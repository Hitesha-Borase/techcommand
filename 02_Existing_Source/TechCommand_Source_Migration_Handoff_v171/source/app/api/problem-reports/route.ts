import { env } from "cloudflare:workers";
import { z } from "zod";
import { TECHFLEX_ORG_ID, apiError, requirePortalRole } from "@/lib/portal-auth";

const portalRoles = [
  "owner_administrator", "operations_administrator", "dispatcher", "biomedical_lead",
  "finance", "technician", "client_administrator", "client_location_user", "auditor", "school_coordinator",
] as const;

const reportSchema = z.object({
  clientReportId: z.string().uuid(),
  module: z.string().trim().min(2).max(80),
  category: z.enum(["save", "upload", "import", "access", "mobile", "workflow", "other"]),
  referenceId: z.string().trim().max(120).regex(/^[A-Za-z0-9#_.:/-]*$/).optional().default(""),
  summary: z.string().trim().min(10).max(500),
  steps: z.string().trim().max(2000).optional().default(""),
  expected: z.string().trim().max(1000).optional().default(""),
  actual: z.string().trim().max(1000).optional().default(""),
  errorMessage: z.string().trim().max(500).optional().default(""),
  privacyConfirmed: z.literal(true),
});

const restrictedPatterns = [
  { pattern: /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/i, label: "email address" },
  { pattern: /\b(?:\+?1[\s.-]?)?\(?\d{3}\)?[\s.-]\d{3}[\s.-]\d{4}\b/, label: "phone number" },
  { pattern: /\b\d{3}-\d{2}-\d{4}\b/, label: "Social Security number" },
];

function restrictedDetail(input: z.infer<typeof reportSchema>) {
  const text = [input.referenceId, input.summary, input.steps, input.expected, input.actual, input.errorMessage].join("\n");
  return restrictedPatterns.find(({ pattern }) => pattern.test(text))?.label;
}

function cleanLine(value: string) {
  return value.replace(/\s+/g, " ").trim();
}

const reviewStatusSchema = z.object({
  id: z.string().uuid(),
  version: z.number().int().positive(),
  status: z.enum(["in_progress", "complete"]),
});

function parseInstructions(value: unknown) {
  const details = new Map<string, string>();
  for (const line of String(value || "").split("\n")) {
    const divider = line.indexOf(":");
    if (divider <= 0) continue;
    details.set(line.slice(0, divider).trim(), line.slice(divider + 1).trim());
  }
  return details;
}

export async function GET(request: Request) {
  try {
    await requirePortalRole(request, ["owner_administrator", "operations_administrator"]);
    const result = await env.DB.prepare(
      `SELECT id,title,instructions,priority,status,record_version AS recordVersion,
              created_at AS createdAt,updated_at AS updatedAt
         FROM admin_tasks
        WHERE organization_id=? AND source='problem_report'
        ORDER BY CASE status WHEN 'open' THEN 1 WHEN 'in_progress' THEN 2 ELSE 3 END,
                 CASE priority WHEN 'high' THEN 1 ELSE 2 END,created_at DESC
        LIMIT 100`,
    ).bind(TECHFLEX_ORG_ID).all<Record<string, unknown>>();
    const reports = result.results.map((row) => {
      const details = parseInstructions(row.instructions);
      return {
        id: row.id,
        module: String(row.title || "Portal issue").replace(/^Portal issue\s*·\s*/, ""),
        category: details.get("Category") || "other",
        referenceId: details.get("Reference") || "",
        summary: details.get("What happened") || "No summary was saved.",
        steps: details.get("Steps") || "",
        expected: details.get("Expected") || "",
        actual: details.get("Actual") || "",
        errorMessage: details.get("Displayed error") || "",
        reporterRole: details.get("Reporter role") || "Unknown portal role",
        receipt: details.get("Private receipt") || "Unavailable",
        priority: row.priority,
        status: row.status,
        recordVersion: Number(row.recordVersion),
        createdAt: row.createdAt,
        updatedAt: row.updatedAt,
      };
    });
    return Response.json({ reports });
  } catch (error) {
    return apiError(error);
  }
}

export async function POST(request: Request) {
  try {
    const identity = await requirePortalRole(request, [...portalRoles]);
    const raw = await request.text();
    if (raw.length > 15000) return Response.json({ error: "The problem report is too large. Shorten the notes and try again." }, { status: 413 });
    let parsed: unknown;
    try { parsed = JSON.parse(raw); }
    catch { return Response.json({ error: "The problem report could not be read. Your draft is still available." }, { status: 400 }); }
    const input = reportSchema.parse(parsed);
    const restricted = restrictedDetail(input);
    if (restricted) return Response.json({ error: `Remove the ${restricted}. Use a work-order number instead of customer, employee, or contact information.` }, { status: 400 });

    const existing = await env.DB.prepare(
      "SELECT id FROM admin_tasks WHERE organization_id=? AND source='problem_report' AND source_record_id=? LIMIT 1",
    ).bind(TECHFLEX_ORG_ID, input.clientReportId).first<{ id: string }>();
    if (existing) return Response.json({ report: { id: existing.id, duplicate: true }, message: "This report was already received." });

    const id = crypto.randomUUID();
    const title = `Portal issue · ${cleanLine(input.module)}`;
    const instructions = [
      `Category: ${input.category}`,
      input.referenceId ? `Reference: ${input.referenceId}` : "",
      `What happened: ${cleanLine(input.summary)}`,
      input.steps ? `Steps: ${cleanLine(input.steps)}` : "",
      input.expected ? `Expected: ${cleanLine(input.expected)}` : "",
      input.actual ? `Actual: ${cleanLine(input.actual)}` : "",
      input.errorMessage ? `Displayed error: ${cleanLine(input.errorMessage)}` : "",
      `Reporter role: ${identity.role}`,
      `Private receipt: ${input.clientReportId.slice(0, 8)}`,
    ].filter(Boolean).join("\n");
    const auditId = crypto.randomUUID();
    const result = await env.DB.batch([
      env.DB.prepare(
        `INSERT OR IGNORE INTO admin_tasks
          (id,organization_id,assigned_role,category,title,instructions,priority,status,source,source_record_id)
         VALUES (?,?,'operations_administrator','Portal issue',?,?,?,'open','problem_report',?)`,
      ).bind(id, TECHFLEX_ORG_ID, title, instructions, input.category === "access" || input.category === "save" ? "high" : "normal", input.clientReportId),
      env.DB.prepare(
        `INSERT INTO audit_logs (id,organization_id,actor_user_id,action,entity_type,entity_id,after_json)
         SELECT ?,?,?,'problem_report.created','problem_report',?,?
          WHERE changes() > 0`,
      ).bind(auditId, TECHFLEX_ORG_ID, identity.userId, id, JSON.stringify({ module: input.module, category: input.category, receipt: input.clientReportId.slice(0, 8) })),
    ]);
    if (!result[0]?.meta?.changes) {
      const duplicate = await env.DB.prepare(
        "SELECT id FROM admin_tasks WHERE organization_id=? AND source='problem_report' AND source_record_id=? LIMIT 1",
      ).bind(TECHFLEX_ORG_ID, input.clientReportId).first<{ id: string }>();
      if (duplicate) return Response.json({ report: { id: duplicate.id, duplicate: true }, message: "This report was already received." });
      return Response.json({ error: "The report could not be confirmed. Your draft is still available; try again once." }, { status: 503 });
    }
    return Response.json({ report: { id, duplicate: false }, message: "Report received. An administrator can review it in the Command Center." }, { status: 201 });
  } catch (error) {
    if (error instanceof z.ZodError) return Response.json({ error: "Finish the summary and confirm that no private information is included." }, { status: 400 });
    return apiError(error);
  }
}

export async function PATCH(request: Request) {
  try {
    const identity = await requirePortalRole(request, ["owner_administrator", "operations_administrator"]);
    const input = reviewStatusSchema.parse(await request.json());
    const auditId = crypto.randomUUID();
    const after = JSON.stringify({ status: input.status, version: input.version + 1 });
    const result = await env.DB.batch([
      env.DB.prepare(
        `INSERT INTO audit_logs
          (id,organization_id,actor_user_id,action,entity_type,entity_id,before_json,after_json)
         SELECT ?,?,?, 'problem_report.status_changed','problem_report',id,
                json_object('status',status,'version',record_version),?
           FROM admin_tasks
          WHERE organization_id=? AND source='problem_report' AND id=?
            AND record_version=? AND status!='complete' AND status!=?`,
      ).bind(auditId, TECHFLEX_ORG_ID, identity.userId, after, TECHFLEX_ORG_ID, input.id, input.version, input.status),
      env.DB.prepare(
        `UPDATE admin_tasks
            SET status=?,assigned_user_id=CASE WHEN ?='in_progress' THEN ? ELSE assigned_user_id END,
                completed_at=CASE WHEN ?='complete' THEN CURRENT_TIMESTAMP ELSE NULL END,
                completed_by=CASE WHEN ?='complete' THEN ? ELSE NULL END,
                record_version=record_version+1,updated_at=CURRENT_TIMESTAMP
          WHERE organization_id=? AND source='problem_report' AND id=?
            AND record_version=? AND status!='complete' AND status!=?`,
      ).bind(input.status, input.status, identity.userId, input.status, input.status, identity.userId,
        TECHFLEX_ORG_ID, input.id, input.version, input.status),
    ]);
    if (result[1]?.meta?.changes) {
      return Response.json({ report: { id: input.id, status: input.status, recordVersion: input.version + 1 } });
    }
    const current = await env.DB.prepare(
      "SELECT status,record_version AS recordVersion FROM admin_tasks WHERE organization_id=? AND source='problem_report' AND id=?",
    ).bind(TECHFLEX_ORG_ID, input.id).first<{ status: string; recordVersion: number }>();
    if (!current) return Response.json({ error: "This problem report no longer exists." }, { status: 404 });
    if (current.status === input.status && Number(current.recordVersion) === input.version) {
      return Response.json({ report: { id: input.id, status: current.status, recordVersion: Number(current.recordVersion), duplicate: true } });
    }
    return Response.json({
      error: current.status === "complete"
        ? "This report was already resolved. Refresh to review the final status."
        : "This report changed after you opened it. Refresh and compare before changing its status.",
      current: { status: current.status, recordVersion: Number(current.recordVersion) },
    }, { status: 409 });
  } catch (error) {
    if (error instanceof z.ZodError) return Response.json({ error: "Refresh the report and choose a valid review status." }, { status: 400 });
    return apiError(error);
  }
}
