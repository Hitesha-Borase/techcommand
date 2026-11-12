import { env } from "cloudflare:workers";
import { z } from "zod";
import {
  googleSheetsStatus,
  processGoogleSheetOutbox,
} from "@/lib/google-sheets-sync";
import { generateDuePayStubs, payrollPeriod } from "@/lib/payroll";
import { googleWorkspaceEmailStatus } from "@/lib/google-workspace-email";
import {
  TECHFLEX_ORG_ID,
  apiError,
  requirePortalRole,
} from "@/lib/portal-auth";
import { safeServerLog } from "@/lib/server-observability";

const actionSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("generate_payroll") }),
  z.object({ action: z.literal("sync_google_sheets") }),
  z.object({
    action: z.literal("record_payment"),
    invoiceId: z.string().min(1),
    amountCents: z.number().int().min(1).max(100_000_000),
    receivedOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    reference: z.string().trim().max(240).optional().default(""),
  }),
  z.object({
    action: z.literal("mark_pay_stub_paid"),
    payStubId: z.string().min(1),
  }),
]);

async function accrueMentorEarnings(invoice: {
  id:string; totalCents:number; workOrderId:string|null; workOrderNumber:string|null;
  accountName:string; estimatedCostCents:number;
}, paymentId:string) {
  if(!invoice.workOrderId) return;
  const relationships=await env.DB.prepare(`SELECT tm.id,tm.mentor_technician_id AS mentorTechnicianId,
      tm.mentee_technician_id AS menteeTechnicianId,tm.bonus_rate_bps AS bonusRateBps,
      tm.bonus_cap_cents AS bonusCapCents,tm.earned_cents AS earnedCents,tm.funded_cents AS fundedCents,
      COALESCE(mu.display_name,mt.technician_code) AS mentorName
    FROM technician_mentorships tm
    JOIN work_order_assignments wa ON wa.technician_id=tm.mentee_technician_id AND wa.work_order_id=?
    JOIN technicians mt ON mt.id=tm.mentor_technician_id LEFT JOIN users mu ON mu.id=mt.user_id
    WHERE tm.organization_id=? AND tm.status='graduated' AND tm.solo_qualified_on IS NOT NULL
      AND date('now')>=date(tm.solo_qualified_on)
      AND date('now')<=date(COALESCE(tm.earning_window_ends_on,date(tm.solo_qualified_on,'+90 days')))`)
    .bind(invoice.workOrderId,TECHFLEX_ORG_ID).all<Record<string,string|number>>();
  if(!relationships.results.length) return;
  const grossProfitCents=Math.max(0,Number(invoice.totalCents)-Number(invoice.estimatedCostCents));
  const marginReserveCents=Math.ceil(Number(invoice.totalCents)*0.4);
  let marginHeadroomCents=Math.max(0,Number(invoice.totalCents)-Number(invoice.estimatedCostCents)-marginReserveCents);
  const statements:D1PreparedStatement[]=[];
  for(const row of relationships.results){
    const remainingCap=Math.max(0,Number(row.bonusCapCents)-Number(row.earnedCents));
    const earned=Math.min(remainingCap,Math.floor(grossProfitCents*Number(row.bonusRateBps)/10000));
    const funded=Math.min(earned,marginHeadroomCents);
    marginHeadroomCents-=funded;
    if(earned<=0) continue;
    statements.push(
      env.DB.prepare(`UPDATE technician_mentorships SET earned_cents=earned_cents+?,funded_cents=funded_cents+?,updated_at=CURRENT_TIMESTAMP WHERE id=? AND organization_id=?`).bind(earned,funded,row.id,TECHFLEX_ORG_ID),
      env.DB.prepare(`INSERT OR IGNORE INTO integration_events (id,organization_id,integration_key,external_event_id,direction,event_type,entity_type,entity_id,status,payload_json) VALUES (?,?, 'google_sheets',?,'outbound','mentor_earning.upsert','technician_mentorship',?,'pending',?)`).bind(crypto.randomUUID(),TECHFLEX_ORG_ID,`mentor_earning:${row.id}:${invoice.workOrderId}:${paymentId}`,row.id,JSON.stringify({sheetName:"Mentor Earnings",headers:["Sync Key","Collected At","Mentor","Mentee Technician ID","Work Order","Account","Gross Profit","Earned","Funded","Deferred","Margin Floor"],values:[`mentor:${row.id}:${invoice.workOrderId}`,new Date().toISOString(),row.mentorName,row.menteeTechnicianId,invoice.workOrderNumber||"",invoice.accountName,grossProfitCents/100,earned/100,funded/100,(earned-funded)/100,"40%"]})),
      env.DB.prepare(`INSERT INTO audit_logs (id,organization_id,action,entity_type,entity_id,after_json) VALUES (?,?,'mentorship.earning_accrued','technician_mentorship',?,?)`).bind(crypto.randomUUID(),TECHFLEX_ORG_ID,row.id,JSON.stringify({paymentId,workOrderId:invoice.workOrderId,earnedCents:earned,fundedCents:funded,deferredCents:earned-funded}))
    );
  }
  if(statements.length) await env.DB.batch(statements);
}

function csvCell(value: unknown) {
  let text = String(value ?? "");
  if (typeof value === "string" && /^[\s]*[=+@-]/.test(text)) text = `'${text}`;
  return /[",\r\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

const privateNoStore = { "Cache-Control": "private, no-store" } as const;

function csv(rows: Array<Record<string, unknown>>) {
  if (!rows.length) return "";
  const headers = Object.keys(rows[0]);
  return [
    headers.map(csvCell).join(","),
    ...rows.map((row) =>
      headers.map((header) => csvCell(row[header])).join(","),
    ),
  ].join("\r\n");
}

async function exportRows(kind: string) {
  if (kind === "completed_orders")
    return env.DB.prepare(
      `SELECT w.external_id AS "Work Order", w.completed_at AS "Completed At",
              a.name AS "Account", l.name AS "Location", w.service_type AS "Service Type",
              sr.manufacturer AS "Manufacturer", sr.model AS "Model",
              sr.serial_number AS "Serial Number", i.invoice_number AS "Invoice",
              ROUND(i.total_cents / 100.0, 2) AS "Revenue",
              ROUND(w.gross_margin_basis_points / 100.0, 2) AS "Gross Margin Percent",
              sr.qa_status AS "QA Status"
         FROM service_reports sr JOIN work_orders w ON w.id = sr.work_order_id
         JOIN accounts a ON a.id = w.account_id AND a.organization_id = w.organization_id
         JOIN locations l ON l.id = w.location_id AND l.account_id = a.id
         LEFT JOIN invoices i ON i.work_order_id = w.id AND i.organization_id = w.organization_id
        WHERE w.organization_id = ? AND sr.qa_status = 'approved'
        ORDER BY w.completed_at DESC`,
    )
      .bind(TECHFLEX_ORG_ID)
      .all<Record<string, unknown>>();
  if (kind === "technician_pay")
    return env.DB.prepare(
      `SELECT COALESCE(u.display_name, t.technician_code) AS "Technician",
              t.technician_code AS "Technician Code", w.external_id AS "Work Order",
              a.name AS "Account", i.invoice_number AS "Invoice",
              ROUND(p.gross_revenue_cents / 100.0, 2) AS "Job Revenue",
              ROUND(p.payout_cents / 100.0, 2) AS "Technician Pay",
              p.status AS "Payroll Status",
              CASE p.collection_status
                WHEN 'covered_by_contract' THEN 'Covered by annual agreement'
                WHEN 'funds_received' THEN 'Customer funds received'
                WHEN 'awaiting_customer_payment' THEN 'Awaiting customer payment'
                ELSE REPLACE(p.collection_status, '_', ' ')
              END AS "Collection Status",
              p.approved_at AS "Approved At", p.paid_at AS "Paid At"
         FROM technician_payouts p
         JOIN technicians t ON t.id = p.technician_id AND t.organization_id = ?
         LEFT JOIN users u ON u.id = t.user_id
         JOIN work_orders w ON w.id = p.work_order_id AND w.organization_id = ?
         JOIN accounts a ON a.id = w.account_id AND a.organization_id = ?
         LEFT JOIN invoices i ON i.id = p.invoice_id AND i.organization_id = ?
        WHERE p.invoice_id IS NULL OR i.id IS NOT NULL
        ORDER BY p.approved_at DESC, w.external_id`,
    ).bind(TECHFLEX_ORG_ID, TECHFLEX_ORG_ID, TECHFLEX_ORG_ID, TECHFLEX_ORG_ID)
      .all<Record<string, unknown>>();
  if (kind === "pay_stubs")
    return env.DB.prepare(
      `SELECT COALESCE(u.display_name, t.technician_code) AS "Technician",
              t.technician_code AS "Technician Code", ps.period_start AS "Period Start",
              ps.period_end AS "Period End", ps.scheduled_for AS "Scheduled For",
              ps.job_count AS "Jobs", ROUND(ps.gross_revenue_cents / 100.0, 2) AS "Job Revenue",
              ROUND(ps.gross_pay_cents / 100.0, 2) AS "Technician Pay",
              ps.status AS "Status", ps.generated_at AS "Generated At", ps.paid_at AS "Paid At"
         FROM pay_stubs ps JOIN technicians t ON t.id = ps.technician_id
           AND t.organization_id = ps.organization_id
         LEFT JOIN users u ON u.id = t.user_id
        WHERE ps.organization_id = ? ORDER BY ps.period_end DESC, "Technician"`,
    )
      .bind(TECHFLEX_ORG_ID)
      .all<Record<string, unknown>>();
  return null;
}

export async function GET(request: Request) {
  try {
    const identity = await requirePortalRole(request, [
      "owner_administrator",
      "operations_administrator",
      "finance",
    ]);
    const url = new URL(request.url);
    const exportKind = url.searchParams.get("export");
    if (exportKind) {
      const result = await exportRows(exportKind);
      if (!result)
        return Response.json(
          { error: "Choose a supported ledger." },
          { status: 400 },
        );
      return new Response(`\uFEFF${csv(result.results)}`, {
        headers: {
          "Content-Type": "text/csv; charset=utf-8",
          "Content-Disposition": `attachment; filename="TechFlex_${exportKind}_${new Date().toISOString().slice(0, 10)}.csv"`,
          ...privateNoStore,
        },
      });
    }
    const payrollRun = await generateDuePayStubs(identity.userId);
    if (payrollRun.generated.length) {
      try {
        await processGoogleSheetOutbox(20);
      } catch (error) {
        safeServerLog("google_sheets_outbox", error);
      }
    }
    const [invoices, payStubs, payoutSummary, integrationCounts, connections] =
      await env.DB.batch([
        env.DB.prepare(
          `SELECT i.id, i.invoice_number AS invoiceNumber, i.status, i.issued_on AS issuedOn,
                  i.due_on AS dueOn, i.total_cents AS totalCents, i.balance_cents AS balanceCents,
                  i.paid_at AS paidAt, i.payment_reference AS paymentReference,
                  i.external_provider AS externalProvider, i.external_id AS externalId,
                  i.pdf_attachment_id AS pdfAttachmentId, w.external_id AS workOrderNumber,
                  a.name AS accountName
             FROM invoices i
             JOIN accounts a ON a.id = i.account_id AND a.organization_id = i.organization_id
             LEFT JOIN work_orders w ON w.id = i.work_order_id AND w.organization_id = i.organization_id
            WHERE i.organization_id = ? ORDER BY i.created_at DESC LIMIT 100`,
        ).bind(TECHFLEX_ORG_ID),
        env.DB.prepare(
          `SELECT ps.id, ps.period_start AS periodStart, ps.period_end AS periodEnd,
                  ps.scheduled_for AS scheduledFor, ps.status, ps.job_count AS jobCount,
                  ps.gross_revenue_cents AS grossRevenueCents,
                  ps.gross_pay_cents AS grossPayCents, ps.pdf_attachment_id AS pdfAttachmentId,
                  ps.generated_at AS generatedAt, ps.paid_at AS paidAt,
                  COALESCE(u.display_name, t.technician_code) AS technicianName,
                  t.technician_code AS technicianCode
             FROM pay_stubs ps JOIN technicians t ON t.id = ps.technician_id
               AND t.organization_id = ps.organization_id
             LEFT JOIN users u ON u.id = t.user_id
            WHERE ps.organization_id = ? ORDER BY ps.period_end DESC, technicianName LIMIT 100`,
        ).bind(TECHFLEX_ORG_ID),
        env.DB.prepare(
          `SELECT COUNT(*) AS payoutCount,
                  COALESCE(SUM(CASE WHEN p.status IN ('approved','included_in_stub') THEN p.payout_cents ELSE 0 END), 0) AS approvedCents,
                  COALESCE(SUM(CASE WHEN p.collection_status = 'funds_received' THEN p.payout_cents ELSE 0 END), 0) AS collectedCents,
                  COALESCE(SUM(CASE WHEN p.collection_status = 'covered_by_contract' AND p.status IN ('approved','included_in_stub') THEN p.payout_cents ELSE 0 END), 0) AS coveredContractCents,
                  COUNT(CASE WHEN p.collection_status = 'covered_by_contract' AND p.status IN ('approved','included_in_stub') THEN 1 END) AS coveredContractCount,
                  COALESCE(SUM(CASE WHEN p.status = 'paid' THEN p.payout_cents ELSE 0 END), 0) AS paidCents
             FROM technician_payouts p
             JOIN technicians t ON t.id = p.technician_id AND t.organization_id = ?
             JOIN work_orders w ON w.id = p.work_order_id AND w.organization_id = ?
             JOIN accounts a ON a.id = w.account_id AND a.organization_id = ?
             LEFT JOIN invoices i ON i.id=p.invoice_id AND i.organization_id=?
            WHERE p.invoice_id IS NULL OR i.id IS NOT NULL`,
        ).bind(TECHFLEX_ORG_ID, TECHFLEX_ORG_ID, TECHFLEX_ORG_ID, TECHFLEX_ORG_ID),
        env.DB.prepare(
          `SELECT integration_key AS integrationKey, status, COUNT(*) AS count
             FROM integration_events WHERE organization_id = ?
              AND status IN ('pending','retry','processing')
            GROUP BY integration_key, status`,
        ).bind(TECHFLEX_ORG_ID),
        env.DB.prepare(
          `SELECT integration_key AS integrationKey, provider, display_name AS displayName,
                  status, connection_mode AS connectionMode, last_sync_at AS lastSyncAt,
                  last_success_at AS lastSuccessAt, last_error AS lastError
             FROM integration_connections WHERE organization_id = ?`,
        ).bind(TECHFLEX_ORG_ID),
      ]);
    const quickBooksRuntime = env as unknown as {
      QUICKBOOKS_WEBHOOK_VERIFIER_TOKEN?: string;
      QUICKBOOKS_CLIENT_ID?: string;
      QUICKBOOKS_CLIENT_SECRET?: string;
      QUICKBOOKS_REALM_ID?: string;
    };
    return Response.json({
      invoices: invoices.results,
      payStubs: payStubs.results,
      payoutSummary: payoutSummary.results[0] || {},
      payroll: {
        ...payrollPeriod(),
        generatedNow: payrollRun.generated.length,
      },
      integrations: {
        googleSheets: googleSheetsStatus(),
        googleWorkspaceEmail: googleWorkspaceEmailStatus(),
        quickBooks: {
          webhookConfigured: Boolean(
            quickBooksRuntime.QUICKBOOKS_WEBHOOK_VERIFIER_TOKEN,
          ),
          accountingApiConfigured: Boolean(
            quickBooksRuntime.QUICKBOOKS_CLIENT_ID &&
            quickBooksRuntime.QUICKBOOKS_CLIENT_SECRET &&
            quickBooksRuntime.QUICKBOOKS_REALM_ID,
          ),
        },
        queue: integrationCounts.results,
        connections: connections.results,
      },
    }, { headers: privateNoStore });
  } catch (error) {
    return apiError(error);
  }
}

export async function POST(request: Request) {
  try {
    const identity = await requirePortalRole(request, [
      "owner_administrator",
      "operations_administrator",
      "finance",
    ]);
    const input = actionSchema.parse(await request.json());
    if (input.action === "generate_payroll") {
      const result = await generateDuePayStubs(identity.userId);
      const sync = await processGoogleSheetOutbox(20);
      return Response.json({ ...result, sync });
    }
    if (input.action === "sync_google_sheets") {
      const result = await processGoogleSheetOutbox(50);
      if (!result.configured)
        return Response.json(
          {
            error:
              "Google Sheets is ready in the portal but still needs its spreadsheet ID and service-account credentials.",
            missing: result.missing,
          },
          { status: 409 },
        );
      return Response.json(result);
    }
    if (input.action === "mark_pay_stub_paid") {
      const payStub = await env.DB.prepare(
        `SELECT ps.status,
          EXISTS (
            SELECT 1 FROM pay_stub_items psi
            LEFT JOIN technician_payouts p ON p.id=psi.payout_id
            LEFT JOIN technicians t ON t.id=p.technician_id
            LEFT JOIN work_orders w ON w.id=p.work_order_id
            LEFT JOIN accounts a ON a.id=w.account_id
            LEFT JOIN invoices i ON i.id=p.invoice_id
            WHERE psi.pay_stub_id=ps.id AND (
              p.id IS NULL OR p.technician_id!=ps.technician_id OR
              t.id IS NULL OR t.organization_id!=ps.organization_id OR
              w.id IS NULL OR w.organization_id!=ps.organization_id OR
              a.id IS NULL OR a.organization_id!=ps.organization_id OR
              psi.work_order_id!=p.work_order_id OR
              COALESCE(psi.invoice_id,'')!=COALESCE(p.invoice_id,'') OR
              (p.invoice_id IS NOT NULL AND (i.id IS NULL OR i.organization_id!=ps.organization_id))
            )
          ) AS invalidItems
         FROM pay_stubs ps WHERE ps.id=? AND ps.organization_id=?`,
      ).bind(input.payStubId, TECHFLEX_ORG_ID).first<{ status: string; invalidItems: number }>();
      if (!payStub || payStub.status === "paid")
        return Response.json(
          { error: "Pay statement not found or already paid." },
          { status: 404 },
        );
      if (Number(payStub.invalidItems))
        return Response.json(
          { error: "This pay statement contains records outside its company or technician. It was not marked paid. Review the statement data before trying again." },
          { status: 409 },
        );
      const result = await env.DB.prepare(
        `UPDATE pay_stubs SET status = 'paid', paid_at = CURRENT_TIMESTAMP,
           record_version = record_version + 1, updated_at = CURRENT_TIMESTAMP
         WHERE id = ? AND organization_id = ? AND status != 'paid'`,
      )
        .bind(input.payStubId, TECHFLEX_ORG_ID)
        .run();
      if (!result.meta.changes)
        return Response.json(
          { error: "Pay statement not found or already paid." },
          { status: 404 },
        );
      await env.DB.prepare(
        `UPDATE technician_payouts SET status = 'paid', paid_at = CURRENT_TIMESTAMP,
           updated_at = CURRENT_TIMESTAMP WHERE id IN
           (SELECT psi.payout_id FROM pay_stub_items psi
             JOIN pay_stubs ps ON ps.id=psi.pay_stub_id AND ps.organization_id=?
            WHERE psi.pay_stub_id = ?)
           AND EXISTS (
             SELECT 1 FROM technicians t
             JOIN work_orders w ON w.id=technician_payouts.work_order_id AND w.organization_id=?
             JOIN accounts a ON a.id=w.account_id AND a.organization_id=?
            WHERE t.id=technician_payouts.technician_id AND t.organization_id=?
              AND (technician_payouts.invoice_id IS NULL OR EXISTS (
                SELECT 1 FROM invoices i WHERE i.id=technician_payouts.invoice_id AND i.organization_id=?
              ))
           )`,
      )
        .bind(
          TECHFLEX_ORG_ID,
          input.payStubId,
          TECHFLEX_ORG_ID,
          TECHFLEX_ORG_ID,
          TECHFLEX_ORG_ID,
          TECHFLEX_ORG_ID,
        )
        .run();
      const paidRows = await env.DB.prepare(
        `SELECT p.id AS payoutId, p.technician_id AS technicianId,
                p.work_order_id AS workOrderId, p.gross_revenue_cents AS grossRevenueCents,
                p.payout_cents AS payoutCents, p.collection_status AS collectionStatus,
                COALESCE(u.display_name, t.technician_code) AS technicianName,
                w.external_id AS workOrderNumber, a.name AS accountName,
                i.invoice_number AS invoiceNumber
           FROM pay_stub_items psi
           JOIN pay_stubs ps ON ps.id=psi.pay_stub_id AND ps.organization_id=?
           JOIN technician_payouts p ON p.id = psi.payout_id
           JOIN technicians t ON t.id = p.technician_id AND t.organization_id=ps.organization_id
           LEFT JOIN users u ON u.id = t.user_id
           JOIN work_orders w ON w.id = p.work_order_id AND w.organization_id=ps.organization_id
           JOIN accounts a ON a.id = w.account_id AND a.organization_id=ps.organization_id
           LEFT JOIN invoices i ON i.id = p.invoice_id AND i.organization_id=ps.organization_id
          WHERE psi.pay_stub_id = ? AND psi.work_order_id=p.work_order_id
            AND COALESCE(psi.invoice_id,'')=COALESCE(p.invoice_id,'')
            AND (p.invoice_id IS NULL OR i.id IS NOT NULL)`,
      )
        .bind(TECHFLEX_ORG_ID, input.payStubId)
        .all<Record<string, string | number>>();
      if (paidRows.results.length)
        await env.DB.batch(
          paidRows.results.map((row) =>
            env.DB.prepare(
              `INSERT OR IGNORE INTO integration_events
                (id, organization_id, integration_key, external_event_id, direction,
                 event_type, entity_type, entity_id, status, payload_json)
               VALUES (?, ?, 'google_sheets', ?, 'outbound', 'technician_pay.upsert',
                 'technician_payout', ?, 'pending', ?)`,
            ).bind(
              crypto.randomUUID(),
              TECHFLEX_ORG_ID,
              `technician_pay:${row.workOrderId}:${row.technicianId}:paid:${input.payStubId}`,
              row.payoutId,
              JSON.stringify({
                sheetName: "Technician Pay",
                headers: [
                  "Sync Key",
                  "Approved At",
                  "Technician",
                  "Work Order",
                  "Account",
                  "Invoice",
                  "Job Revenue",
                  "Technician Pay",
                  "Collection Status",
                  "Payroll Status",
                ],
                values: [
                  `payout:${row.workOrderId}:${row.technicianId}`,
                  new Date().toISOString(),
                  row.technicianName,
                  row.workOrderNumber,
                  row.accountName,
                  row.invoiceNumber || "",
                  Number(row.grossRevenueCents) / 100,
                  Number(row.payoutCents) / 100,
                  row.collectionStatus,
                  "paid",
                ],
              }),
            ),
          ),
        );
      try {
        await processGoogleSheetOutbox(20);
      } catch (error) {
        safeServerLog("google_sheets_outbox", error);
      }
      return Response.json({ payStubId: input.payStubId, status: "paid" });
    }

    const invoice = await env.DB.prepare(
      `SELECT i.id, i.invoice_number AS invoiceNumber, i.balance_cents AS balanceCents,
              i.total_cents AS totalCents, w.id AS workOrderId,
              w.external_id AS workOrderNumber, a.name AS accountName,
              COALESCE(w.estimated_cost_cents,0) AS estimatedCostCents
         FROM invoices i
         JOIN accounts a ON a.id = i.account_id AND a.organization_id = i.organization_id
         LEFT JOIN work_orders w ON w.id = i.work_order_id AND w.organization_id = i.organization_id
        WHERE i.id = ? AND i.organization_id = ?`,
    )
      .bind(input.invoiceId, TECHFLEX_ORG_ID)
      .first<{
        id: string;
        invoiceNumber: string;
        balanceCents: number;
        totalCents: number;
        workOrderId: string | null;
        workOrderNumber: string | null;
        accountName: string;
        estimatedCostCents:number;
      }>();
    if (!invoice)
      return Response.json({ error: "Invoice not found." }, { status: 404 });
    if (input.amountCents > invoice.balanceCents)
      return Response.json(
        { error: "The payment cannot exceed the remaining invoice balance." },
        { status: 400 },
      );
    const paymentId = crypto.randomUUID();
    const nextBalance = invoice.balanceCents - input.amountCents;
    const paymentStatus = nextBalance === 0 ? "paid" : "partial";
    const eventId = `payment:${paymentId}`;
    const statements: D1PreparedStatement[] = [
      env.DB.prepare(
        `INSERT INTO invoice_payments
          (id, organization_id, invoice_id, provider, amount_cents, received_on,
           reference, recorded_by)
         VALUES (?, ?, ?, 'manual', ?, ?, ?, ?)`,
      ).bind(
        paymentId,
        TECHFLEX_ORG_ID,
        invoice.id,
        input.amountCents,
        input.receivedOn,
        input.reference || null,
        identity.userId,
      ),
      env.DB.prepare(
        `UPDATE invoices SET balance_cents = ?, status = ?,
           paid_at = CASE WHEN ? = 0 THEN ? ELSE paid_at END,
           payment_reference = COALESCE(?, payment_reference),
           record_version = record_version + 1, updated_at = CURRENT_TIMESTAMP
         WHERE id = ? AND organization_id = ?`,
      ).bind(
        nextBalance,
        paymentStatus,
        nextBalance,
        input.receivedOn,
        input.reference || null,
        invoice.id,
        TECHFLEX_ORG_ID,
      ),
      env.DB.prepare(
        `INSERT OR IGNORE INTO integration_events
          (id, organization_id, integration_key, external_event_id, direction,
           event_type, entity_type, entity_id, status, payload_json)
         VALUES (?, ?, 'google_sheets', ?, 'outbound', 'invoice_payment.upsert',
           'invoice_payment', ?, 'pending', ?)`,
      ).bind(
        crypto.randomUUID(),
        TECHFLEX_ORG_ID,
        eventId,
        paymentId,
        JSON.stringify({
          sheetName: "Invoice Payments",
          headers: [
            "Sync Key",
            "Received On",
            "Invoice",
            "Work Order",
            "Account",
            "Amount",
            "Remaining Balance",
            "Status",
            "Reference",
            "Provider",
          ],
          values: [
            eventId,
            input.receivedOn,
            invoice.invoiceNumber,
            invoice.workOrderNumber || "",
            invoice.accountName,
            input.amountCents / 100,
            nextBalance / 100,
            paymentStatus,
            input.reference,
            "manual",
          ],
        }),
      ),
      env.DB.prepare(
        `INSERT INTO audit_logs
          (id, organization_id, actor_user_id, action, entity_type, entity_id, after_json)
         VALUES (?, ?, ?, 'invoice.payment_recorded', 'invoice', ?, ?)`,
      ).bind(
        crypto.randomUUID(),
        TECHFLEX_ORG_ID,
        identity.userId,
        invoice.id,
        JSON.stringify({
          paymentId,
          amountCents: input.amountCents,
          receivedOn: input.receivedOn,
          nextBalance,
          provider: "manual",
        }),
      ),
    ];
    if (nextBalance === 0)
      statements.push(
        env.DB.prepare(
          `UPDATE technician_payouts SET collection_status = 'funds_received',
             funds_received_at = ?, updated_at = CURRENT_TIMESTAMP
           WHERE invoice_id = ? AND EXISTS (
             SELECT 1 FROM technicians t
             JOIN work_orders w ON w.id=technician_payouts.work_order_id AND w.organization_id=?
             JOIN accounts a ON a.id=w.account_id AND a.organization_id=?
            WHERE t.id=technician_payouts.technician_id AND t.organization_id=?
           )`,
        ).bind(
          input.receivedOn,
          invoice.id,
          TECHFLEX_ORG_ID,
          TECHFLEX_ORG_ID,
          TECHFLEX_ORG_ID,
        ),
        env.DB.prepare(
          `UPDATE work_orders SET status = 'paid', record_version = record_version + 1,
             updated_at = CURRENT_TIMESTAMP WHERE id = ? AND organization_id = ?`,
        ).bind(invoice.workOrderId, TECHFLEX_ORG_ID),
      );
    await env.DB.batch(statements);
    if (nextBalance === 0) {
      await accrueMentorEarnings(invoice,paymentId);
      const collectedRows = await env.DB.prepare(
        `SELECT p.id AS payoutId, p.technician_id AS technicianId,
                p.work_order_id AS workOrderId, p.gross_revenue_cents AS grossRevenueCents,
                p.payout_cents AS payoutCents, p.status,
                COALESCE(u.display_name, t.technician_code) AS technicianName,
                w.external_id AS workOrderNumber, a.name AS accountName
           FROM technician_payouts p
           JOIN technicians t ON t.id = p.technician_id AND t.organization_id=?
           LEFT JOIN users u ON u.id = t.user_id
           JOIN work_orders w ON w.id = p.work_order_id AND w.organization_id=?
           JOIN accounts a ON a.id = w.account_id AND a.organization_id=?
          WHERE p.invoice_id = ?`,
      )
        .bind(TECHFLEX_ORG_ID, TECHFLEX_ORG_ID, TECHFLEX_ORG_ID, invoice.id)
        .all<Record<string, string | number>>();
      if (collectedRows.results.length)
        await env.DB.batch(
          collectedRows.results.map((row) =>
            env.DB.prepare(
              `INSERT OR IGNORE INTO integration_events
                (id, organization_id, integration_key, external_event_id, direction,
                 event_type, entity_type, entity_id, status, payload_json)
               VALUES (?, ?, 'google_sheets', ?, 'outbound', 'technician_pay.upsert',
                 'technician_payout', ?, 'pending', ?)`,
            ).bind(
              crypto.randomUUID(),
              TECHFLEX_ORG_ID,
              `technician_pay:${row.workOrderId}:${row.technicianId}:collected:${paymentId}`,
              row.payoutId,
              JSON.stringify({
                sheetName: "Technician Pay",
                headers: [
                  "Sync Key",
                  "Approved At",
                  "Technician",
                  "Work Order",
                  "Account",
                  "Invoice",
                  "Job Revenue",
                  "Technician Pay",
                  "Collection Status",
                  "Payroll Status",
                ],
                values: [
                  `payout:${row.workOrderId}:${row.technicianId}`,
                  new Date().toISOString(),
                  row.technicianName,
                  row.workOrderNumber,
                  row.accountName,
                  invoice.invoiceNumber,
                  Number(row.grossRevenueCents) / 100,
                  Number(row.payoutCents) / 100,
                  "funds_received",
                  row.status,
                ],
              }),
            ),
          ),
        );
    }
    try {
      await processGoogleSheetOutbox(10);
    } catch (error) {
      safeServerLog("google_sheets_outbox", error);
    }
    return Response.json({
      paymentId,
      invoiceId: invoice.id,
      status: paymentStatus,
      balanceCents: nextBalance,
    });
  } catch (error) {
    if (error instanceof z.ZodError)
      return Response.json(
        { error: "Review the finance details.", details: error.flatten() },
        { status: 400 },
      );
    return apiError(error);
  }
}
