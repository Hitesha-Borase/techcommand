import { env } from "cloudflare:workers";
import { z } from "zod";
import { TECHFLEX_ORG_ID, apiError, requirePortalRole } from "@/lib/portal-auth";
import { generateDuePayStubs } from "@/lib/payroll";

const privateNoStore = { "Cache-Control": "private, no-store" } as const;

export async function GET(request: Request) {
  try {
    const identity = await requirePortalRole(request, [
      "owner_administrator",
      "operations_administrator",
      "finance",
      "technician",
    ]);
    const technicianFilter =
      identity.role === "technician" ? identity.technicianId : null;
    if (identity.role === "technician" && !technicianFilter) {
      return Response.json(
        { summary: [], entries: [], payStubs: [] },
        { headers: privateNoStore },
      );
    }
    await generateDuePayStubs(
      identity.userId,
      identity.role === "technician" ? technicianFilter : null,
    );
    const [summary, entries, payStubs] = await env.DB.batch([
      env.DB.prepare(
        `SELECT t.id AS technicianId, t.technician_code AS technicianCode,
                COALESCE(u.display_name, t.technician_code) AS technicianName,
                COUNT(p.id) AS jobCount,
                COALESCE(SUM(CASE WHEN p.status IN ('pending', 'approved', 'included_in_stub') THEN p.payout_cents ELSE 0 END), 0) AS pendingCents,
                COALESCE(SUM(CASE WHEN p.collection_status = 'covered_by_contract' AND p.status IN ('approved', 'included_in_stub') THEN p.payout_cents ELSE 0 END), 0) AS agreementCoveredCents,
                COALESCE(SUM(CASE WHEN p.status = 'paid' THEN p.payout_cents ELSE 0 END), 0) AS paidCents
           FROM technicians t
           LEFT JOIN users u ON u.id = t.user_id AND EXISTS (
             SELECT 1 FROM memberships m
              WHERE m.user_id = t.user_id AND m.organization_id = t.organization_id AND m.status = 'active'
           )
           LEFT JOIN technician_payouts p ON p.technician_id = t.id AND EXISTS (
             SELECT 1 FROM work_orders w
             JOIN accounts a ON a.id = w.account_id AND a.organization_id = w.organization_id
             LEFT JOIN invoices i ON i.id = p.invoice_id
               AND i.organization_id = w.organization_id
               AND i.work_order_id = w.id AND i.account_id = w.account_id
              WHERE w.id = p.work_order_id AND w.organization_id = t.organization_id
                AND (p.invoice_id IS NULL OR i.id IS NOT NULL)
           )
          WHERE t.organization_id = ? AND t.status = 'active' AND (? IS NULL OR t.id = ?)
          GROUP BY t.id
          ORDER BY technicianName`,
      ).bind(TECHFLEX_ORG_ID, technicianFilter, technicianFilter),
      env.DB.prepare(
        `SELECT p.id, p.status, p.collection_status AS collectionStatus,
                p.basis_type AS basisType, p.basis_rate AS basisRate,
                p.gross_revenue_cents AS grossRevenueCents, p.payout_cents AS payoutCents,
                p.created_at AS createdAt, w.external_id AS workOrderNumber,
                w.summary, a.name AS accountName
           FROM technician_payouts p
           JOIN technicians t ON t.id = p.technician_id AND t.organization_id = ?
           JOIN work_orders w ON w.id = p.work_order_id AND w.organization_id = t.organization_id
           JOIN accounts a ON a.id = w.account_id AND a.organization_id = w.organization_id
           LEFT JOIN invoices i ON i.id = p.invoice_id
             AND i.organization_id = w.organization_id
             AND i.work_order_id = w.id AND i.account_id = w.account_id
          WHERE (p.invoice_id IS NULL OR i.id IS NOT NULL)
            AND (? IS NULL OR p.technician_id = ?)
          ORDER BY p.created_at DESC LIMIT 100`,
      ).bind(TECHFLEX_ORG_ID, technicianFilter, technicianFilter),
      env.DB.prepare(
        `SELECT ps.id, ps.period_start AS periodStart, ps.period_end AS periodEnd,
                ps.scheduled_for AS scheduledFor, ps.status, ps.job_count AS jobCount,
                ps.gross_pay_cents AS grossPayCents,
                ps.pdf_attachment_id AS pdfAttachmentId, ps.generated_at AS generatedAt,
                ps.confirmed_at AS confirmedAt, ps.paid_at AS paidAt,
                COALESCE(u.display_name, t.technician_code) AS technicianName
           FROM pay_stubs ps
           JOIN technicians t ON t.id = ps.technician_id AND t.organization_id = ps.organization_id
           LEFT JOIN users u ON u.id = t.user_id AND EXISTS (
             SELECT 1 FROM memberships m
              WHERE m.user_id = t.user_id AND m.organization_id = ps.organization_id AND m.status = 'active'
           )
          WHERE ps.organization_id = ? AND (? IS NULL OR ps.technician_id = ?)
          ORDER BY ps.period_end DESC LIMIT 52`,
      ).bind(TECHFLEX_ORG_ID, technicianFilter, technicianFilter),
    ]);
    return Response.json({
      summary: summary.results,
      entries: entries.results,
      payStubs: payStubs.results,
    }, { headers: privateNoStore });
  } catch (error) {
    const response = apiError(error);
    response.headers.set("Cache-Control", privateNoStore["Cache-Control"]);
    return response;
  }
}

export async function POST(request: Request) {
  try {
    const identity = await requirePortalRole(request, ["technician"]);
    if (!identity.technicianId)
      return Response.json(
        { error: "This login is not linked to a technician profile." },
        { status: 403 },
      );
    const input = z
      .object({
        action: z.literal("confirm_pay_stub"),
        payStubId: z.string().min(1),
      })
      .parse(await request.json());
    const result = await env.DB.prepare(
      `UPDATE pay_stubs SET confirmed_at = COALESCE(confirmed_at, CURRENT_TIMESTAMP),
         record_version = record_version + 1, updated_at = CURRENT_TIMESTAMP
       WHERE id = ? AND organization_id = 'techflex' AND technician_id = ?`,
    )
      .bind(input.payStubId, identity.technicianId)
      .run();
    if (!result.meta.changes)
      return Response.json(
        { error: "Pay statement not found." },
        { status: 404 },
      );
    await env.DB.prepare(
      `INSERT INTO audit_logs
        (id, organization_id, actor_user_id, action, entity_type, entity_id, after_json)
       VALUES (?, 'techflex', ?, 'pay_stub.confirmed', 'pay_stub', ?, ?)`,
    )
      .bind(
        crypto.randomUUID(),
        identity.userId,
        input.payStubId,
        JSON.stringify({ technicianId: identity.technicianId }),
      )
      .run();
    return Response.json({ payStubId: input.payStubId, confirmed: true });
  } catch (error) {
    if (error instanceof z.ZodError)
      return Response.json(
        { error: "Select a valid pay statement." },
        { status: 400 },
      );
    return apiError(error);
  }
}
