import { env } from "cloudflare:workers";
import { z } from "zod";
import { executeStructuredAi } from "@/lib/ai-provider";
import {
  TECHFLEX_ORG_ID,
  apiError,
  requirePortalRole,
  type PortalIdentity,
} from "@/lib/portal-auth";

type Runtime = { OPENAI_API_KEY?: string; OPENAI_MODEL?: string };

const inputSchema = z.object({
  module: z.string().trim().min(1).max(80),
  question: z.string().trim().min(3).max(5000),
});

const outputSchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    answer: { type: "string" },
    confidence: {
      type: "string",
      enum: ["record_grounded", "approved_guidance", "general_guidance", "needs_review"],
    },
    sources: { type: "array", items: { type: "string" } },
    cautions: { type: "array", items: { type: "string" } },
    suggestedActions: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          label: { type: "string" },
          targetModule: {
            type: "string",
            enum: ["command", "work-orders", "schedule", "dispatch", "accounts", "customers", "contacts", "partners", "locations", "assets", "support", "pm", "technicians", "parts", "finance", "compliance", "reports", "automations", "imports", "documents", "knowledge", "access", "demo", "settings"],
          },
        },
        required: ["label", "targetModule"],
      },
    },
  },
  required: ["answer", "confidence", "sources", "cautions", "suggestedActions"],
};

function outputText(result: Record<string, unknown>) {
  if (typeof result.output_text === "string") return result.output_text;
  const output = Array.isArray(result.output) ? result.output : [];
  for (const item of output) {
    const content = Array.isArray((item as { content?: unknown[] }).content)
      ? (item as { content: unknown[] }).content
      : [];
    for (const part of content) {
      const text = (part as { text?: unknown }).text;
      if (typeof text === "string") return text;
    }
  }
  throw new Error("The AI response did not contain an answer.");
}

async function operationalContext(identity: PortalIdentity, module: string) {
  const technicianOnly = identity.role === "technician";
  const workOrderSql = `SELECT w.external_id AS workOrder, w.service_type AS serviceType,
      w.priority, w.status, w.summary, w.scheduled_start AS scheduledStart,
      w.gross_margin_basis_points AS marginBasisPoints,
      a.name AS account, l.name AS location, l.address_1 AS address1,
      l.address_2 AS address2, l.city, l.state, l.postal_code AS postalCode,
      (SELECT GROUP_CONCAT(COALESCE(u2.display_name,t2.technician_code), ', ')
         FROM work_order_assignments wa2 JOIN technicians t2 ON t2.id=wa2.technician_id
         LEFT JOIN users u2 ON u2.id=t2.user_id
        WHERE wa2.work_order_id=w.id AND wa2.status NOT IN ('declined','cancelled')) AS assignedTechnicians,
      ast.asset_tag AS assetTag, ast.manufacturer, ast.model, ast.serial_number AS serialNumber
    FROM work_orders w
    JOIN accounts a ON a.id=w.account_id
    JOIN locations l ON l.id=w.location_id
    LEFT JOIN assets ast ON ast.id=w.asset_id
    ${technicianOnly ? "JOIN work_order_assignments wa ON wa.work_order_id=w.id" : ""}
    WHERE w.organization_id=? ${technicianOnly ? "AND wa.technician_id=?" : ""}
    ORDER BY CASE w.status WHEN 'service_in_progress' THEN 1 WHEN 'arrived' THEN 2 WHEN 'assigned' THEN 3 WHEN 'ready_to_assign' THEN 4 ELSE 8 END,
      COALESCE(w.scheduled_start,w.created_at) DESC LIMIT 30`;
  const workOrders = technicianOnly
    ? await env.DB.prepare(workOrderSql).bind(TECHFLEX_ORG_ID, identity.technicianId).all()
    : await env.DB.prepare(workOrderSql).bind(TECHFLEX_ORG_ID).all();
  const [knowledge, tasks] = await Promise.all([
    env.DB.prepare(
      "SELECT category,title,content FROM knowledge_entries WHERE organization_id=? AND status='active' ORDER BY updated_at DESC LIMIT 80",
    ).bind(TECHFLEX_ORG_ID).all(),
    technicianOnly
      ? Promise.resolve({ results: [] as unknown[] })
      : env.DB.prepare(
          "SELECT category,title,priority,due_at AS dueAt FROM admin_tasks WHERE organization_id=? AND status='open' ORDER BY CASE priority WHEN 'urgent' THEN 1 WHEN 'high' THEN 2 ELSE 3 END, due_at LIMIT 20",
        ).bind(TECHFLEX_ORG_ID).all(),
  ]);
  const roleCanSeeFinance = ["owner_administrator", "operations_administrator", "finance"].includes(identity.role);
  const roleCanSeeBiomedicalAssets = ["owner_administrator", "biomedical_lead"].includes(identity.role);
  const wantsFinance = ["command", "finance", "reports", "accounts"].includes(module);
  const wantsBiomedical = ["assets", "pm", "reports", "command"].includes(module);
  const financeSummary = !technicianOnly && roleCanSeeFinance && wantsFinance
    ? await env.DB.prepare(
        `SELECT COUNT(*) AS invoiceCount,
                COALESCE(SUM(total_cents),0) AS totalInvoicedCents,
                COALESCE(SUM(balance_cents),0) AS openBalanceCents,
                COALESCE(SUM(CASE WHEN due_on<date('now') AND balance_cents>0 THEN balance_cents ELSE 0 END),0) AS overdueBalanceCents
           FROM invoices WHERE organization_id=?`,
      ).bind(TECHFLEX_ORG_ID).first()
    : null;
  const biomedicalSummary = !technicianOnly && roleCanSeeBiomedicalAssets && wantsBiomedical
    ? await env.DB.prepare(
        `SELECT COUNT(*) AS activeAssets,
                SUM(CASE WHEN serial_number IS NULL OR trim(serial_number)='' THEN 1 ELSE 0 END) AS missingSerials,
                SUM(CASE WHEN next_pm_due_on<date('now') THEN 1 ELSE 0 END) AS overduePm,
                SUM(CASE WHEN next_pm_due_on BETWEEN date('now') AND date('now','+30 days') THEN 1 ELSE 0 END) AS dueWithin30Days
           FROM assets WHERE organization_id=? AND status!='retired'`,
      ).bind(TECHFLEX_ORG_ID).first()
    : null;
  const portalSnapshot = !technicianOnly
    ? await env.DB.prepare(
        `SELECT
          (SELECT COUNT(*) FROM work_orders WHERE organization_id=? AND status NOT IN ('completed','cancelled','closed')) AS openWorkOrders,
          (SELECT COUNT(*) FROM admin_tasks WHERE organization_id=? AND status='open') AS openAdminTasks,
          (SELECT COUNT(*) FROM service_reports sr JOIN work_orders w ON w.id=sr.work_order_id WHERE w.organization_id=? AND sr.qa_status='submitted') AS reportsAwaitingQa,
          (SELECT COUNT(*) FROM document_records WHERE organization_id=? AND status='current' AND expires_on IS NOT NULL AND expires_on<=date('now','+30 days')) AS documentsExpiringSoon`,
      ).bind(TECHFLEX_ORG_ID, TECHFLEX_ORG_ID, TECHFLEX_ORG_ID, TECHFLEX_ORG_ID).first()
    : null;
  return {
    currentModule: module,
    currentWorkOrders: workOrders.results,
    approvedKnowledge: knowledge.results,
    openOperationalTasks: tasks.results,
    portalSnapshot,
    financeSummary,
    biomedicalSummary,
    dataBoundaries: {
      biomedicalAssetsOnly: true,
      manualEditingAlwaysAvailable: true,
      aiChangesRequireReview: true,
      mainBusinessHub: "611 Park Meadow Road, Suite B, Westerville, Ohio 43081",
      routeOriginRule: "Use the administrator-managed dispatch origin for the selected technician. The main hub is not a universal origin.",
    },
  };
}

export async function GET(request: Request) {
  try {
    await requirePortalRole(request, [
      "owner_administrator", "operations_administrator", "dispatcher",
      "biomedical_lead", "finance", "technician",
    ]);
    const runtime = env as unknown as { OPENAI_API_KEY?: string; GEMINI_API_KEY?: string };
    const ready = Boolean(runtime.GEMINI_API_KEY || runtime.OPENAI_API_KEY || (typeof process !== "undefined" && process.env ? (process.env.GEMINI_API_KEY || process.env.OPENAI_API_KEY) : ""));
    return Response.json({ ready });
  } catch (error) {
    return apiError(error);
  }
}

export async function POST(request: Request) {
  try {
    const identity = await requirePortalRole(request, [
      "owner_administrator", "operations_administrator", "dispatcher",
      "biomedical_lead", "finance", "technician",
    ]);
    const input = inputSchema.parse(await request.json());
    const runtime = env as unknown as { OPENAI_API_KEY?: string; OPENAI_MODEL?: string; GEMINI_API_KEY?: string; GEMINI_MODEL?: string };
    const aiKey = runtime.GEMINI_API_KEY || runtime.OPENAI_API_KEY || (typeof process !== "undefined" && process.env ? (process.env.GEMINI_API_KEY || process.env.OPENAI_API_KEY) : "");
    if (!aiKey)
      return Response.json({ error: "The AI project key is not connected." }, { status: 503 });
    const context = await operationalContext(identity, input.module);
    const instruction = `You are TechCommand Copilot, the permission-aware operating assistant for TechFlex Mobility Solutions. The user role is ${identity.role}; the current portal module is ${input.module}. Answer the actual question directly and use the supplied portal records as controlling facts. Distinguish portal records and approved TechFlex guidance from general model knowledge. Biomedical assets belong only to the Biomedical module and must not be treated as general field-service inventory. Routing uses the administrator-managed dispatch origin for the selected technician; 611 Park Meadow Road, Suite B, Westerville, Ohio 43081 is the main business hub but never a universal origin. Never invent a work-order fact, measurement, part number, fault code, contract term, address, or manufacturer procedure. For an exact model-specific repair instruction, say when the approved manual or bulletin is required. AI is advisory: never claim an action or edit was executed, and make clear what the user may change manually. Suggest the safest relevant portal destination for next steps. Employee-file uploads: direct administrators to Document Vault → Employee & Technician Files → select the technician → Employee files → Choose file → Upload file. This uploads an actual document, not a spreadsheet import. The same Employee files button is beside each person in Technicians. Never send employee uploads to Contacts. A complete packet can be one PDF up to 20 MB, using Complete employee file / personnel packet (restricted), available only to Owner Administrator or Finance. Other roles may upload only their allowed categories. Technicians may receive guidance only for their own supplied work-order context. When comparing nearby work orders, use only supplied addresses and schedules and label any distance estimate that has not been route-verified. Keep the answer practical and concise.`;
    const answer = await executeStructuredAi({
      key: aiKey,
      model: runtime.GEMINI_MODEL || runtime.OPENAI_MODEL,
      name: "techcommand_copilot_answer",
      instruction,
      content: [{ type: "input_text", text: `QUESTION:\n${input.question}\n\nAUTHORIZED PORTAL CONTEXT:\n${JSON.stringify(context)}` }],
      schema: outputSchema,
      validate: z.object({
        answer: z.string(),
        confidence: z.enum(["record_grounded", "approved_guidance", "general_guidance", "needs_review"]),
        sources: z.array(z.string()),
        cautions: z.array(z.string()),
        suggestedActions: z.array(z.object({ label: z.string(), targetModule: z.string() })),
      }),
    });
    await env.DB.prepare(
      "INSERT INTO assistant_questions (id,organization_id,asked_by,role,question,answer,sources_json) VALUES (?,?,?,?,?,?,?)",
    ).bind(
      crypto.randomUUID(), TECHFLEX_ORG_ID, identity.userId, identity.role,
      input.question, String(answer.answer || ""), JSON.stringify(answer.sources || []),
    ).run();
    return Response.json({ response: answer });
  } catch (error) {
    if (error instanceof z.ZodError)
      return Response.json({ error: "Enter a complete question." }, { status: 400 });
    return apiError(error);
  }
}
