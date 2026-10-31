import { env } from "cloudflare:workers";
import { PortalHttpError, TECHFLEX_ORG_ID } from "@/lib/portal-auth";
import { generatePayStubPdf } from "@/lib/techflex-pdfs";
import { safeServerLog } from "@/lib/server-observability";

type PayrollItem = {
  payoutId: string;
  technicianId: string;
  technicianName: string;
  technicianCode: string;
  workOrderId: string;
  workOrderNumber: string;
  accountName: string;
  invoiceId: string | null;
  invoiceNumber: string | null;
  serviceDate: string;
  grossRevenueCents: number;
  payoutCents: number;
  collectionStatus: string;
};

type PreparedPayStub = {
  payStubId: string;
  attachmentId: string;
  storageKey: string;
  technicianId: string;
  technicianName: string;
  periodStart: string;
  periodEnd: string;
  scheduledFor: string;
  generatedAt: string;
  grossRevenueCents: number;
  grossPayCents: number;
  pdfSize: number;
  items: PayrollItem[];
};

type PendingPayrollCleanup = {
  pendingId: string;
  attachmentId: string;
  storageKey: string;
};

async function completePayrollCleanup(item: PendingPayrollCleanup) {
  try {
    const referenced = await env.DB.prepare(
      "SELECT id FROM attachments WHERE organization_id=? AND storage_key=? LIMIT 1",
    ).bind(TECHFLEX_ORG_ID, item.storageKey).first<{ id: string }>();
    if (referenced) {
      await env.DB.prepare(
        "INSERT OR IGNORE INTO audit_logs (id, organization_id, action, entity_type, entity_id, before_json, after_json) VALUES (?, ?, 'attachment.storage_cleanup_completed', 'attachment', ?, ?, ?)",
      ).bind(
        `${item.pendingId}:completed`,
        TECHFLEX_ORG_ID,
        item.attachmentId,
        JSON.stringify({ storageKey: item.storageKey }),
        JSON.stringify({ storageRemoved: false, retainedBecauseReferenced: true }),
      ).run();
      return;
    }
    await env.BUCKET.delete(item.storageKey);
    await env.DB.prepare(
      "INSERT OR IGNORE INTO audit_logs (id, organization_id, action, entity_type, entity_id, before_json, after_json) VALUES (?, ?, 'attachment.storage_cleanup_completed', 'attachment', ?, ?, ?)",
    ).bind(
      `${item.pendingId}:completed`,
      TECHFLEX_ORG_ID,
      item.attachmentId,
      JSON.stringify({ storageKey: item.storageKey }),
      JSON.stringify({ storageRemoved: true }),
    ).run();
  } catch (error) {
    safeServerLog("payroll_cleanup", error);
  }
}

async function queuePayrollCleanup(attachmentId: string, storageKey: string) {
  const pendingId = crypto.randomUUID();
  try {
    await env.DB.prepare(
      "INSERT INTO audit_logs (id, organization_id, action, entity_type, entity_id, before_json, after_json) VALUES (?, ?, 'attachment.storage_cleanup_pending', 'attachment', ?, ?, ?)",
    ).bind(
      pendingId,
      TECHFLEX_ORG_ID,
      attachmentId,
      JSON.stringify({ storageKey }),
      JSON.stringify({ metadataSaved: false, storageRemoved: false, source: "payroll_close" }),
    ).run();
  } catch (error) {
    safeServerLog("payroll_cleanup", error);
  }
  await completePayrollCleanup({ pendingId, attachmentId, storageKey });
}

async function cleanupPreparedPayStubs(stubs: PreparedPayStub[]) {
  for (const stub of stubs)
    await queuePayrollCleanup(stub.attachmentId, stub.storageKey);
}

async function payStubCommitState(stub: PreparedPayStub) {
  const row = await env.DB.prepare(
    `SELECT
      EXISTS (SELECT 1 FROM attachments WHERE id=? AND organization_id=? AND entity_type='technician' AND entity_id=? AND storage_key=? AND category='pay_stub') AS attachmentSaved,
      EXISTS (SELECT 1 FROM pay_stubs WHERE id=? AND organization_id=? AND technician_id=? AND period_start=? AND period_end=? AND pdf_attachment_id=?) AS payStubSaved,
      ((SELECT COUNT(*) FROM pay_stub_items WHERE pay_stub_id=?)=?) AS itemsSaved,
      ((SELECT COUNT(*) FROM technician_payouts p
          JOIN technicians t ON t.id=p.technician_id AND t.organization_id=?
          JOIN work_orders w ON w.id=p.work_order_id AND w.organization_id=?
         WHERE p.id IN (SELECT payout_id FROM pay_stub_items WHERE pay_stub_id=?)
           AND p.status='included_in_stub')=?) AS payoutsSaved,
      EXISTS (SELECT 1 FROM integration_events WHERE organization_id=? AND integration_key='google_sheets' AND external_event_id=? AND entity_type='pay_stub' AND entity_id=?) AS integrationSaved,
      EXISTS (SELECT 1 FROM audit_logs WHERE organization_id=? AND action='pay_stub.generated' AND entity_type='pay_stub' AND entity_id=?) AS auditSaved`,
  ).bind(
    stub.attachmentId,
    TECHFLEX_ORG_ID,
    stub.technicianId,
    stub.storageKey,
    stub.payStubId,
    TECHFLEX_ORG_ID,
    stub.technicianId,
    stub.periodStart,
    stub.periodEnd,
    stub.attachmentId,
    stub.payStubId,
    stub.items.length,
    TECHFLEX_ORG_ID,
    TECHFLEX_ORG_ID,
    stub.payStubId,
    stub.items.length,
    TECHFLEX_ORG_ID,
    `pay_stub:${stub.payStubId}:1`,
    stub.payStubId,
    TECHFLEX_ORG_ID,
    stub.payStubId,
  ).first<Record<string, number>>();
  const values = Object.values(row || {}).map(Number);
  if (values.length === 6 && values.every((value) => value === 1)) return "saved" as const;
  if (values.length === 6 && values.every((value) => value === 0)) return "absent" as const;
  return "unconfirmed" as const;
}

const weekdayIndex: Record<string, number> = {
  Sun: 0,
  Mon: 1,
  Tue: 2,
  Wed: 3,
  Thu: 4,
  Fri: 5,
  Sat: 6,
};

function shiftDate(date: string, days: number) {
  const value = new Date(`${date}T12:00:00Z`);
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
}

export function payrollPeriod(now = new Date()) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    weekday: "short",
    hour: "2-digit",
    hourCycle: "h23",
  }).formatToParts(now);
  const value = (type: string) =>
    parts.find((part) => part.type === type)?.value || "";
  const localDate = `${value("year")}-${value("month")}-${value("day")}`;
  const weekday = weekdayIndex[value("weekday")] ?? now.getUTCDay();
  const hour = Number(value("hour") || 0);
  let daysSinceWednesday = (weekday - 3 + 7) % 7;
  if (daysSinceWednesday === 0 && hour < 15) daysSinceWednesday = 7;
  const cutoffDate = shiftDate(localDate, -daysSinceWednesday);
  return {
    periodStart: shiftDate(cutoffDate, -7),
    periodEnd: shiftDate(cutoffDate, -1),
    cutoffDate,
    scheduledFor: `${cutoffDate} 15:00 America/New_York`,
    due: daysSinceWednesday < 7 || (weekday === 3 && hour >= 15),
  };
}

export async function generateDuePayStubs(
  actorUserId: string | null,
  technicianId?: string | null,
) {
  const period = payrollPeriod();
  const result = await env.DB.prepare(
    `SELECT p.id AS payoutId, p.technician_id AS technicianId,
            COALESCE(u.display_name, t.technician_code) AS technicianName,
            t.technician_code AS technicianCode, p.work_order_id AS workOrderId,
            w.external_id AS workOrderNumber, a.name AS accountName,
            p.invoice_id AS invoiceId, i.invoice_number AS invoiceNumber,
            substr(COALESCE(w.completed_at, w.scheduled_start, p.approved_at), 1, 10) AS serviceDate,
            p.gross_revenue_cents AS grossRevenueCents, p.payout_cents AS payoutCents,
            p.collection_status AS collectionStatus
       FROM technician_payouts p
       JOIN technicians t ON t.id = p.technician_id AND t.organization_id = ?
       LEFT JOIN users u ON u.id = t.user_id
       JOIN work_orders w ON w.id = p.work_order_id AND w.organization_id = ?
       JOIN accounts a ON a.id = w.account_id AND a.organization_id = ?
       LEFT JOIN invoices i ON i.id = p.invoice_id AND i.organization_id = ?
      WHERE p.status = 'approved'
        AND (p.invoice_id IS NULL OR i.id IS NOT NULL)
        AND date(COALESCE(p.approved_at, p.created_at)) BETWEEN date(?) AND date(?)
        AND (? IS NULL OR p.technician_id = ?)
        AND NOT EXISTS (SELECT 1 FROM pay_stub_items psi WHERE psi.payout_id = p.id)
      ORDER BY technicianName, serviceDate, workOrderNumber`,
  )
    .bind(
      TECHFLEX_ORG_ID,
      TECHFLEX_ORG_ID,
      TECHFLEX_ORG_ID,
      TECHFLEX_ORG_ID,
      period.periodStart,
      period.periodEnd,
      technicianId || null,
      technicianId || null,
    )
    .all<PayrollItem>();
  const grouped = new Map<string, PayrollItem[]>();
  for (const item of result.results)
    grouped.set(item.technicianId, [
      ...(grouped.get(item.technicianId) || []),
      item,
    ]);
  const prepared: PreparedPayStub[] = [];
  try {
    for (const [technicianId, items] of grouped) {
      const existing = await env.DB.prepare(
        `SELECT id FROM pay_stubs WHERE organization_id = ? AND technician_id = ? AND period_start = ? AND period_end = ?`,
      )
        .bind(TECHFLEX_ORG_ID, technicianId, period.periodStart, period.periodEnd)
        .first<{ id: string }>();
      if (existing) continue;
      const payStubId = crypto.randomUUID();
      const grossRevenueCents = items.reduce(
        (sum, item) => sum + Number(item.grossRevenueCents || 0),
        0,
      );
      const grossPayCents = items.reduce(
        (sum, item) => sum + Number(item.payoutCents || 0),
        0,
      );
      const generatedAt = new Date().toISOString();
      const pdf = await generatePayStubPdf({
        technicianName: items[0].technicianName,
        technicianCode: items[0].technicianCode,
        periodStart: period.periodStart,
        periodEnd: period.periodEnd,
        generatedAt,
        items,
      });
      const attachmentId = crypto.randomUUID();
      const storageKey = `techflex/technicians/${technicianId}/pay_stubs/${period.periodStart}_${period.periodEnd}.pdf`;
      prepared.push({
        payStubId,
        attachmentId,
        storageKey,
        technicianId,
        technicianName: items[0].technicianName,
        periodStart: period.periodStart,
        periodEnd: period.periodEnd,
        scheduledFor: period.scheduledFor,
        generatedAt,
        grossRevenueCents,
        grossPayCents,
        pdfSize: pdf.length,
        items,
      });
      await env.BUCKET.put(storageKey, pdf, {
        httpMetadata: { contentType: "application/pdf" },
      });
    }
  } catch (error) {
    safeServerLog("payroll_commit", error);
    await cleanupPreparedPayStubs(prepared);
    throw new PortalHttpError(
      503,
      "Payroll statements could not all be prepared. No payroll records were created and eligible technician pay remains approved. Refresh Finance, then try again.",
    );
  }

  const statements: D1PreparedStatement[] = [];
  const preparedPayoutIds = prepared.flatMap((stub) =>
    stub.items.map((item) => item.payoutId),
  );
  if (preparedPayoutIds.length)
    statements.push(
      env.DB.prepare(
        `SELECT CASE WHEN (
          SELECT COUNT(*) FROM technician_payouts p
          JOIN technicians t ON t.id=p.technician_id AND t.organization_id=?
          JOIN work_orders w ON w.id=p.work_order_id AND w.organization_id=?
          JOIN accounts a ON a.id=w.account_id AND a.organization_id=?
          LEFT JOIN invoices i ON i.id=p.invoice_id AND i.organization_id=?
           WHERE p.id IN (${preparedPayoutIds.map(() => "?").join(",")})
             AND p.status='approved'
             AND (p.invoice_id IS NULL OR i.id IS NOT NULL)
             AND NOT EXISTS (SELECT 1 FROM pay_stub_items psi WHERE psi.payout_id=p.id)
        )=? THEN 1 ELSE json('payroll_generation_conflict') END`,
      ).bind(
        TECHFLEX_ORG_ID,
        TECHFLEX_ORG_ID,
        TECHFLEX_ORG_ID,
        TECHFLEX_ORG_ID,
        ...preparedPayoutIds,
        preparedPayoutIds.length,
      ),
    );
  for (const stub of prepared) {
    statements.push(
      env.DB.prepare(
        `INSERT INTO attachments
          (id, organization_id, entity_type, entity_id, storage_key, file_name,
           content_type, size_bytes, category, uploaded_by)
         VALUES (?, ?, 'technician', ?, ?, ?, 'application/pdf', ?, 'pay_stub', ?)`,
      ).bind(
        stub.attachmentId,
        TECHFLEX_ORG_ID,
        stub.technicianId,
        stub.storageKey,
        `TechFlex_Pay_Statement_${stub.periodStart}_${stub.periodEnd}.pdf`,
        stub.pdfSize,
        actorUserId,
      ),
      env.DB.prepare(
        `INSERT INTO pay_stubs
          (id, organization_id, technician_id, period_start, period_end,
           scheduled_for, status, job_count, gross_revenue_cents,
           gross_pay_cents, pdf_attachment_id, generated_at)
         VALUES (?, ?, ?, ?, ?, ?, 'generated', ?, ?, ?, ?, ?)`,
      ).bind(
        stub.payStubId,
        TECHFLEX_ORG_ID,
        stub.technicianId,
        stub.periodStart,
        stub.periodEnd,
        stub.scheduledFor,
        stub.items.length,
        stub.grossRevenueCents,
        stub.grossPayCents,
        stub.attachmentId,
        stub.generatedAt,
      ),
    );
    for (const item of stub.items)
      statements.push(
        env.DB.prepare(
          `INSERT INTO pay_stub_items
            (id, pay_stub_id, payout_id, work_order_id, invoice_id,
             work_order_number, account_name, service_date, gross_revenue_cents,
             payout_cents, collection_status)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        ).bind(
          crypto.randomUUID(),
          stub.payStubId,
          item.payoutId,
          item.workOrderId,
          item.invoiceId,
          item.workOrderNumber,
          item.accountName,
          item.serviceDate || null,
          item.grossRevenueCents,
          item.payoutCents,
          item.collectionStatus,
        ),
        env.DB.prepare(
          `UPDATE technician_payouts SET status = 'included_in_stub',
             updated_at = CURRENT_TIMESTAMP
           WHERE id = ? AND status = 'approved'
             AND EXISTS (
               SELECT 1 FROM technicians t
               JOIN work_orders w ON w.id=technician_payouts.work_order_id AND w.organization_id=?
               JOIN accounts a ON a.id=w.account_id AND a.organization_id=?
              WHERE t.id=technician_payouts.technician_id AND t.organization_id=?
                AND (technician_payouts.invoice_id IS NULL OR EXISTS (
                  SELECT 1 FROM invoices i WHERE i.id=technician_payouts.invoice_id AND i.organization_id=?
                ))
             )`,
        ).bind(
          item.payoutId,
          TECHFLEX_ORG_ID,
          TECHFLEX_ORG_ID,
          TECHFLEX_ORG_ID,
          TECHFLEX_ORG_ID,
        ),
        env.DB.prepare(
          `INSERT OR IGNORE INTO integration_events
            (id, organization_id, integration_key, external_event_id, direction,
             event_type, entity_type, entity_id, status, payload_json)
           VALUES (?, ?, 'google_sheets', ?, 'outbound', 'technician_pay.upsert',
             'technician_payout', ?, 'pending', ?)`,
        ).bind(
          crypto.randomUUID(),
          TECHFLEX_ORG_ID,
          `technician_pay:${item.workOrderId}:${stub.technicianId}:stub:${stub.payStubId}`,
          item.payoutId,
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
              `payout:${item.workOrderId}:${stub.technicianId}`,
              stub.generatedAt,
              item.technicianName,
              item.workOrderNumber,
              item.accountName,
              item.invoiceNumber || "",
              item.grossRevenueCents / 100,
              item.payoutCents / 100,
              item.collectionStatus,
              "included_in_stub",
            ],
          }),
        ),
      );
    statements.push(
      env.DB.prepare(
        `INSERT OR IGNORE INTO integration_events
          (id, organization_id, integration_key, external_event_id, direction,
           event_type, entity_type, entity_id, status, payload_json)
         VALUES (?, ?, 'google_sheets', ?, 'outbound', 'pay_stub.upsert',
           'pay_stub', ?, 'pending', ?)`,
      ).bind(
        crypto.randomUUID(),
        TECHFLEX_ORG_ID,
        `pay_stub:${stub.payStubId}:1`,
        stub.payStubId,
        JSON.stringify({
          sheetName: "Pay Stubs",
          headers: [
            "Sync Key",
            "Generated At",
            "Technician",
            "Period Start",
            "Period End",
            "Jobs",
            "Gross Job Revenue",
            "Technician Pay",
            "Status",
          ],
          values: [
            `pay_stub:${stub.payStubId}`,
            stub.generatedAt,
            stub.technicianName,
            stub.periodStart,
            stub.periodEnd,
            stub.items.length,
            stub.grossRevenueCents / 100,
            stub.grossPayCents / 100,
            "generated",
          ],
        }),
      ),
      env.DB.prepare(
        `INSERT INTO audit_logs
          (id, organization_id, actor_user_id, action, entity_type, entity_id, after_json)
         VALUES (?, ?, ?, 'pay_stub.generated', 'pay_stub', ?, ?)`,
      ).bind(
        crypto.randomUUID(),
        TECHFLEX_ORG_ID,
        actorUserId,
        stub.payStubId,
        JSON.stringify({
          technicianId: stub.technicianId,
          periodStart: stub.periodStart,
          periodEnd: stub.periodEnd,
          jobCount: stub.items.length,
          grossPayCents: stub.grossPayCents,
        }),
      ),
    );
  }
  if (statements.length) {
    try {
      await env.DB.batch(statements);
    } catch (error) {
      safeServerLog("payroll_commit", error);
      try {
        const states = await Promise.all(prepared.map(payStubCommitState));
        if (!states.every((state) => state === "saved")) {
          if (states.every((state) => state === "absent")) {
            await cleanupPreparedPayStubs(prepared);
            if (String(error).includes("malformed JSON"))
              throw new PortalHttpError(
                409,
                "Eligible technician pay changed while payroll was being prepared. No pay statements were created. Refresh Finance and review the updated pay list before trying again.",
              );
            throw new PortalHttpError(
              503,
              "Payroll was not saved. No pay statements were created and eligible technician pay remains approved. Refresh Finance, then try again.",
            );
          }
          await cleanupPreparedPayStubs(prepared);
          throw new PortalHttpError(
            409,
            "Payroll could not be confirmed for every technician. Refresh Finance and review the pay-statement list before trying again.",
          );
        }
      } catch (verificationError) {
        if (verificationError instanceof PortalHttpError) throw verificationError;
        safeServerLog("payroll_commit", verificationError);
        throw new PortalHttpError(
          409,
          "Payroll could not be confirmed for every technician. Refresh Finance and review the pay-statement list before trying again.",
        );
      }
    }
  }
  const generated = prepared.map((stub) => ({
    payStubId: stub.payStubId,
    technicianId: stub.technicianId,
    technicianName: stub.technicianName,
    grossPayCents: stub.grossPayCents,
    jobCount: stub.items.length,
  }));
  return { period, generated };
}
