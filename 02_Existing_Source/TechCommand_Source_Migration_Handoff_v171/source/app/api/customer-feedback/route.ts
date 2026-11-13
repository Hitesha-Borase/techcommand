import { env } from "cloudflare:workers";
import { z } from "zod";
import {
  googleWorkspaceEmailStatus,
  processGoogleWorkspaceEmailOutbox,
} from "@/lib/google-workspace-email";
import {
  TECHFLEX_ORG_ID,
  apiError,
  requirePortalRole,
} from "@/lib/portal-auth";

const actionSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("sync_email") }),
  z.object({
    action: z.enum(["mark_sms_enrolled", "suppress_sms"]),
    feedbackRequestId: z.string().min(1),
  }),
]);

function getDatabase(): any {
  return (globalThis as any).__D1_DB__ || (globalThis as any).__WORKER_ENV__?.DB || env?.DB;
}

const allowedRoles = [
  "owner_administrator",
  "operations_administrator",
  "finance",
  "dispatcher",
  "biomedical_lead",
] as const;

export async function GET(request: Request) {
  try {
    await requirePortalRole(request, [...allowedRoles]);
    const db = getDatabase();
    if (!db) {
      return Response.json({
        requests: [],
        emailIntegration: googleWorkspaceEmailStatus(),
      });
    }

    const result = await db.prepare(
      `SELECT f.id, f.channel, f.destination, f.campaign_name AS campaignName,
              f.status, f.message_subject AS messageSubject,
              f.message_body AS messageBody, f.review_url AS reviewUrl,
              f.scheduled_for AS scheduledFor, f.sent_at AS sentAt,
              f.external_id AS externalId, w.external_id AS workOrderNumber,
              w.summary, a.name AS accountName,
              COALESCE(c.name, 'Customer') AS customerName,
              c.email AS customerEmail, c.phone AS customerPhone
         FROM customer_feedback_requests f
         JOIN work_orders w ON w.id = f.work_order_id
         JOIN accounts a ON a.id = w.account_id
         LEFT JOIN customers c ON c.id = f.customer_id
        WHERE f.organization_id = ?
        ORDER BY CASE f.status
          WHEN 'blocked_missing_information' THEN 1
          WHEN 'admin_action_required' THEN 2
          WHEN 'queued' THEN 3 ELSE 4 END, f.created_at DESC
        LIMIT 200`,
    )
      .bind(TECHFLEX_ORG_ID)
      .all();

    return Response.json({
      requests: (result?.results || []).map((row: any) => ({
        ...row,
        missing: [
          !row.destination
            ? row.channel === "email"
              ? "customer email"
              : "customer mobile number"
            : null,
          !row.reviewUrl ? "Google review URL" : null,
        ].filter(Boolean),
      })),
      emailIntegration: googleWorkspaceEmailStatus(),
    });
  } catch (error) {
    return apiError(error);
  }
}

export async function POST(request: Request) {
  try {
    const identity = await requirePortalRole(request, [...allowedRoles]);
    const db = getDatabase();
    if (!db) {
      return Response.json({ error: "Database not available" }, { status: 500 });
    }
    const input = actionSchema.parse(await request.json());
    if (input.action === "sync_email") {
      const result = await processGoogleWorkspaceEmailOutbox(25);
      if (!result.configured)
        return Response.json(
          {
            error:
              "Google Workspace email is ready in the portal but still needs delegated Gmail credentials, a sender, and the Google review URL.",
            missing: result.missing,
          },
          { status: 409 },
        );
      return Response.json(result);
    }
    const requestRow = (await db.prepare(
      `SELECT id, work_order_id AS workOrderId, channel, status
         FROM customer_feedback_requests
        WHERE id = ? AND organization_id = ?`,
    )
      .bind(input.feedbackRequestId, TECHFLEX_ORG_ID)
      .first()) as {
        id: string;
        workOrderId: string;
        channel: string;
        status: string;
      } | null;
    if (!requestRow || requestRow.channel !== "sms")
      return Response.json(
        { error: "SMS follow-up not found." },
        { status: 404 },
      );
    const status =
      input.action === "mark_sms_enrolled" ? "enrolled" : "suppressed";
    await db.batch([
      db.prepare(
        `UPDATE customer_feedback_requests SET status = ?,
           sent_at = CASE WHEN ? = 'enrolled' THEN CURRENT_TIMESTAMP ELSE sent_at END,
           record_version = record_version + 1, updated_at = CURRENT_TIMESTAMP
         WHERE id = ? AND organization_id = ?`,
      ).bind(status, status, requestRow.id, TECHFLEX_ORG_ID),
      db.prepare(
        `UPDATE admin_tasks SET status = 'complete', completed_at = CURRENT_TIMESTAMP,
           completed_by = ?, record_version = record_version + 1,
           updated_at = CURRENT_TIMESTAMP
         WHERE source = 'customer_feedback' AND source_record_id = ?`,
      ).bind(identity.userId, `feedback_sms:${requestRow.workOrderId}`),
      db.prepare(
        `INSERT INTO audit_logs
          (id, organization_id, actor_user_id, action, entity_type, entity_id, after_json)
         VALUES (?, ?, ?, ?, 'customer_feedback', ?, ?)`,
      ).bind(
        crypto.randomUUID(),
        TECHFLEX_ORG_ID,
        identity.userId,
        input.action === "mark_sms_enrolled"
          ? "customer_feedback.sms_enrolled"
          : "customer_feedback.sms_suppressed",
        requestRow.id,
        JSON.stringify({ status }),
      ),
    ]);
    return Response.json({ id: requestRow.id, status });
  } catch (error) {
    if (error instanceof z.ZodError)
      return Response.json(
        { error: "Review the follow-up action." },
        { status: 400 },
      );
    return apiError(error);
  }
}
