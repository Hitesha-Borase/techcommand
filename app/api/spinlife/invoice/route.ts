import { SupabaseBucket } from "@/lib/supabase-storage";
import { env } from "cloudflare:workers";
import { z } from "zod";
import { apiError, requirePortalRole, TECHFLEX_ORG_ID, PortalHttpError } from "@/lib/portal-auth";
import { generateInvoicePdf } from "@/lib/techflex-pdfs";
import { spinlifeServiceLabels } from "@/lib/spinlife-simple";
import { privateHeaders, spinlifeRoles, spinlifeJob, spinlifeAudit } from "@/lib/spinlife-store";
import { safeServerLog } from "@/lib/server-observability";

export async function POST(request: Request) {
  let stagedKey: string | null = null;
  try {
    const identity = await requirePortalRole(request, [...spinlifeRoles]);
    const input = z.object({
      id: z.string().min(1).max(160),
      expectedVersion: z.number().int().min(1),
    }).parse(await request.json());

    const job = await spinlifeJob(identity, input.id);

    // Idempotency check: reuse existing invoice for this intake to prevent duplicate billing
    const existing = await env.DB.prepare(
      `SELECT id, storage_key AS storageKey, file_name AS fileName
       FROM attachments
       WHERE organization_id=? AND entity_type='work_order_intake' AND entity_id=? AND category='invoice'
       ORDER BY created_at DESC LIMIT 1`
    ).bind(TECHFLEX_ORG_ID, input.id).first<{ id: string; storageKey: string; fileName: string }>();

    if (existing) {
      return Response.json({
        attachmentId: existing.id,
        fileName: existing.fileName,
        invoiceNumber: `INV-${job.data.externalId || job.id.slice(0, 8).toUpperCase()}`,
        reused: true,
      }, { headers: privateHeaders });
    }

    const { data, visit } = job;
    const woNumber = data.externalId?.trim() || "WO-" + job.id.slice(0, 8).toUpperCase();
    const invoiceNumber = `INV-${woNumber}`;

    // Calculate billing amounts based on account rules (never duplicate charges)
    const subtotalCents = job.technicianPayCents && job.technicianPayCents > 0
      ? job.technicianPayCents
      : (data.serviceType === "biomed_pm_a" ? 17500 : 12500);
    const taxCents = 0;
    const totalCents = subtotalCents;

    const today = new Date().toISOString().slice(0, 10);
    const dueOn = new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10);

    const pdfBytes = await generateInvoicePdf({
      invoiceNumber,
      issuedOn: today,
      dueOn,
      workOrderNumber: woNumber,
      accountName: "SpinLife / National Accounts",
      billingEmail: "ap@spinlife.com",
      serviceLocation: data.serviceAddress || data.customerName || "Customer Residence",
      description: `${spinlifeServiceLabels[data.serviceType] || "DME Field Service"} - Unit Evaluation & On-Site Labor: ${data.manufacturer || ""} ${data.model || ""}`.trim(),
      subtotalCents,
      taxCents,
      totalCents,
      serviceDate: job.startedAt ? job.startedAt.slice(0, 10) : today,
      jobStatus: visit.disposition === "returned_to_service"
        ? "Completed / Returned to Service"
        : visit.disposition === "delivery_completed"
        ? "Delivery Completed"
        : "Field Service Documented",
      serviceType: data.serviceType,
      workPerformed: visit.narrative || data.summary || "Technician performed standard on-site evaluation and equipment checks.",
      paymentTermsDays: 30,
      equipment: {
        type: data.equipmentType || "Mobility Equipment",
        manufacturer: data.manufacturer || "Manufacturer",
        model: data.model || "Model",
        serialNumber: data.serialNumber || "N/A",
      },
    });

    const attachmentId = crypto.randomUUID();
    const fileName = `TechFlex_Invoice_${invoiceNumber}.pdf`;
    stagedKey = `techflex/spinlife/${input.id}/invoices/${attachmentId}.pdf`;

    await SupabaseBucket.put(stagedKey, pdfBytes, {
      httpMetadata: { contentType: "application/pdf" },
    });

    await env.DB.prepare(
      `INSERT INTO attachments (id, organization_id, entity_type, entity_id, storage_key, file_name, content_type, size_bytes, category, uploaded_by)
       VALUES (?, ?, 'work_order_intake', ?, ?, ?, 'application/pdf', ?, 'invoice', ?)`
    ).bind(attachmentId, TECHFLEX_ORG_ID, input.id, stagedKey, fileName, pdfBytes.byteLength, identity.userId).run();

    await spinlifeAudit(identity, input.id, "spinlife.invoice_generated", null, {
      attachmentId,
      invoiceNumber,
      totalCents,
    });

    stagedKey = null;
    return Response.json({
      attachmentId,
      fileName,
      invoiceNumber,
      totalCents,
    }, { headers: privateHeaders });
  } catch (error) {
    if (stagedKey) {
      try {
        await SupabaseBucket.delete(stagedKey);
      } catch (cleanup) {
        safeServerLog("invoice_cleanup", cleanup);
      }
    }
    const response = apiError(error);
    response.headers.set("Cache-Control", "private, no-store");
    return response;
  }
}

