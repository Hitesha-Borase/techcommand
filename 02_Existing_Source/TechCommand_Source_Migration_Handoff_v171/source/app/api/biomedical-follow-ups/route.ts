import { env } from "cloudflare:workers";
import { z } from "zod";
import {
  apiError,
  PortalHttpError,
  requirePortalRole,
  TECHFLEX_ORG_ID,
} from "@/lib/portal-auth";

const headers = { "Cache-Control": "private, no-store" } as const;
const stages = [
  "needs_verification",
  "ready_to_order",
  "ordered",
  "received",
  "repair_scheduled",
  "resolved",
  "not_required",
] as const;

const updateSchema = z.object({
  requestId: z.string().uuid(),
  taskId: z.string().min(1).max(180),
  expectedRecordVersion: z.number().int().positive(),
  sourceProgressVersion: z.number().int().positive(),
  stage: z.enum(stages),
  partDescription: z.string().trim().max(500).default(""),
  partNumber: z.string().trim().max(180).default(""),
  manufacturerReference: z.string().trim().max(1000).default(""),
  approvalReference: z.string().trim().max(500).default(""),
  vendorName: z.string().trim().max(240).default(""),
  orderReference: z.string().trim().max(240).default(""),
  orderedOn: z.string().date().optional().nullable(),
  receivedOn: z.string().date().optional().nullable(),
  repairWorkOrderId: z.string().trim().max(180).optional().nullable(),
  resolutionNote: z.string().trim().max(2000).default(""),
  notes: z.string().trim().max(3000).default(""),
});

type FollowUpRow = {
  id: string;
  taskId: string;
  workOrderAssetId: string;
  sourceProgressVersion: number;
  actualSourceProgressVersion: number;
  stage: (typeof stages)[number];
  needsReverification: number;
  recordVersion: number;
  lastRequestId: string | null;
  accountId: string;
  locationId: string;
  assetId: string;
  partDescription: string;
  partNumber: string;
  manufacturerReference: string;
  approvalReference: string;
  vendorName: string;
  orderReference: string;
  orderedOn: string | null;
  receivedOn: string | null;
  repairWorkOrderId: string | null;
  resolutionNote: string;
  notes: string;
};

function failure(error: unknown) {
  const response =
    error instanceof z.ZodError
      ? Response.json(
          { error: "Review the parts and repair follow-up details." },
          { status: 400 },
        )
      : /biomedical_follow_up_changed|UNIQUE constraint/i.test(String(error))
        ? Response.json(
            { error: "This follow-up changed after you opened it. Reload before saving." },
            { status: 409 },
          )
        : apiError(error);
  response.headers.set("Cache-Control", headers["Cache-Control"]);
  return response;
}

function requireFields(input: z.infer<typeof updateSchema>) {
  const hasPart = Boolean(input.partDescription || input.partNumber);
  if (
    ["ready_to_order", "ordered", "received", "repair_scheduled"].includes(
      input.stage,
    ) &&
    (!hasPart || !input.approvalReference)
  ) {
    throw new PortalHttpError(
      400,
      "Record the known part description or number and the actual approval reference before advancing.",
    );
  }
  if (
    ["ordered", "received", "repair_scheduled"].includes(input.stage) &&
    (!input.vendorName || !input.orderReference || !input.orderedOn)
  ) {
    throw new PortalHttpError(
      400,
      "Record the actual vendor, order reference and order date. TechCommand does not place the order.",
    );
  }
  if (
    ["received", "repair_scheduled"].includes(input.stage) &&
    !input.receivedOn
  ) {
    throw new PortalHttpError(400, "Record the actual received date before advancing.");
  }
  if (
    input.orderedOn &&
    input.receivedOn &&
    input.receivedOn < input.orderedOn
  ) {
    throw new PortalHttpError(400, "The received date cannot precede the order date.");
  }
  if (input.stage === "repair_scheduled" && !input.repairWorkOrderId) {
    throw new PortalHttpError(
      400,
      "Link an existing repair work order before recording a scheduled repair.",
    );
  }
  if (
    ["resolved", "not_required"].includes(input.stage) &&
    !input.resolutionNote
  ) {
    throw new PortalHttpError(
      400,
      "Record the actual resolution or why follow-up is not required.",
    );
  }
}

export async function PATCH(request: Request) {
  let requestId = "";
  let actor = "";
  let body = "";
  try {
    const identity = await requirePortalRole(request, [
      "owner_administrator",
      "operations_administrator",
    ]);
    actor = identity.userId;
    if (request.headers.get("origin") !== new URL(request.url).origin) {
      throw new PortalHttpError(403, "Save from your signed-in TechCommand portal.");
    }
    const input = updateSchema.parse(await request.json());
    requestId = input.requestId;
    body = JSON.stringify(input);

    const replay = await env.DB.prepare(
      "SELECT organization_id AS organizationId, actor_user_id AS actor, after_json AS body FROM audit_logs WHERE id=?",
    )
      .bind(requestId)
      .first<{ organizationId: string; actor: string; body: string }>();
    if (replay) {
      if (
        replay.organizationId === TECHFLEX_ORG_ID &&
        replay.actor === actor &&
        replay.body === body
      ) {
        return Response.json({ saved: true, replayed: true }, { headers });
      }
      throw new PortalHttpError(
        409,
        "This save identifier belongs to another follow-up change.",
      );
    }

    const current = await env.DB.prepare(
      `SELECT f.id,f.task_id AS taskId,f.work_order_asset_id AS workOrderAssetId,
              f.source_progress_version AS sourceProgressVersion,wa.record_version AS actualSourceProgressVersion,f.stage,
              f.needs_reverification AS needsReverification,f.record_version AS recordVersion,
              f.last_request_id AS lastRequestId,w.account_id AS accountId,w.location_id AS locationId,
              wa.asset_id AS assetId,f.part_description AS partDescription,f.part_number AS partNumber,
              f.manufacturer_reference AS manufacturerReference,f.approval_reference AS approvalReference,
              f.vendor_name AS vendorName,f.order_reference AS orderReference,f.ordered_on AS orderedOn,
              f.received_on AS receivedOn,f.repair_work_order_id AS repairWorkOrderId,
              f.resolution_note AS resolutionNote,f.notes
         FROM biomedical_follow_ups f
         JOIN admin_tasks t ON t.id=f.task_id AND t.organization_id=f.organization_id
         JOIN work_order_assets wa ON wa.id=f.work_order_asset_id AND wa.organization_id=f.organization_id
         JOIN work_orders w ON w.id=wa.work_order_id AND w.organization_id=f.organization_id
        WHERE f.task_id=? AND f.organization_id=? AND t.source='biomedical_asset_progress'`,
    )
      .bind(input.taskId, TECHFLEX_ORG_ID)
      .first<FollowUpRow>();
    if (!current) {
      throw new PortalHttpError(404, "This biomedical follow-up is no longer available.");
    }
    if (
      current.recordVersion !== input.expectedRecordVersion ||
      current.sourceProgressVersion !== input.sourceProgressVersion ||
      current.actualSourceProgressVersion !== current.sourceProgressVersion
    ) {
      throw new PortalHttpError(
        409,
        "The technician evidence or follow-up changed after you opened it. Reload before saving.",
      );
    }
    requireFields(input);

    if (input.repairWorkOrderId) {
      const repair = await env.DB.prepare(
        `SELECT w.id FROM work_orders w
          JOIN work_order_assets wa ON wa.work_order_id=w.id AND wa.organization_id=w.organization_id
         WHERE w.id=? AND w.organization_id=? AND w.account_id=? AND w.location_id=? AND wa.asset_id=?
           AND w.status NOT IN ('cancelled','closed') LIMIT 1`,
      )
        .bind(
          input.repairWorkOrderId,
          TECHFLEX_ORG_ID,
          current.accountId,
          current.locationId,
          current.assetId,
        )
        .first();
      if (!repair) {
        throw new PortalHttpError(
          400,
          "Select an existing open repair work order for this facility and exact asset.",
        );
      }
    }

    const closed = ["resolved", "not_required"].includes(input.stage);
    await env.DB.batch([
      env.DB.prepare(
        `SELECT CASE WHEN EXISTS(
          SELECT 1 FROM biomedical_follow_ups
           WHERE task_id=? AND organization_id=? AND record_version=? AND source_progress_version=?
        ) THEN 1 ELSE json('biomedical_follow_up_changed') END`,
      ).bind(
        input.taskId,
        TECHFLEX_ORG_ID,
        input.expectedRecordVersion,
        input.sourceProgressVersion,
      ),
      env.DB.prepare(
        `UPDATE biomedical_follow_ups SET stage=?,needs_reverification=0,
          part_description=?,part_number=?,manufacturer_reference=?,approval_reference=?,vendor_name=?,
          order_reference=?,ordered_on=?,received_on=?,repair_work_order_id=?,resolution_note=?,notes=?,
          record_version=record_version+1,last_request_id=?,updated_by=?,updated_at=CURRENT_TIMESTAMP
         WHERE task_id=? AND organization_id=? AND record_version=? AND source_progress_version=?`,
      ).bind(
        input.stage,
        input.partDescription,
        input.partNumber,
        input.manufacturerReference,
        input.approvalReference,
        input.vendorName,
        input.orderReference,
        input.orderedOn || null,
        input.receivedOn || null,
        input.repairWorkOrderId || null,
        input.resolutionNote,
        input.notes,
        requestId,
        identity.userId,
        input.taskId,
        TECHFLEX_ORG_ID,
        input.expectedRecordVersion,
        input.sourceProgressVersion,
      ),
      env.DB.prepare(
        `UPDATE admin_tasks SET status=?,completed_at=CASE WHEN ? THEN CURRENT_TIMESTAMP ELSE NULL END,
          completed_by=CASE WHEN ? THEN ? ELSE NULL END,record_version=record_version+1,updated_at=CURRENT_TIMESTAMP
         WHERE id=? AND organization_id=? AND EXISTS(
           SELECT 1 FROM biomedical_follow_ups f WHERE f.task_id=admin_tasks.id AND f.last_request_id=?
         )`,
      ).bind(
        closed ? "complete" : "in_progress",
        Number(closed),
        Number(closed),
        identity.userId,
        input.taskId,
        TECHFLEX_ORG_ID,
        requestId,
      ),
      env.DB.prepare(
        `INSERT INTO audit_logs(id,organization_id,actor_user_id,action,entity_type,entity_id,before_json,after_json)
         SELECT ?,?,?,?,'biomedical_follow_up',f.id,?,?
           FROM biomedical_follow_ups f WHERE f.task_id=? AND f.organization_id=? AND f.last_request_id=?`,
      ).bind(
        requestId,
        TECHFLEX_ORG_ID,
        identity.userId,
        closed ? "biomedical_follow_up.closed" : "biomedical_follow_up.updated",
        JSON.stringify({
          stage: current.stage,
          version: current.recordVersion,
          sourceProgressVersion: current.sourceProgressVersion,
          needsReverification: Boolean(current.needsReverification),
          partDescription: current.partDescription,
          partNumber: current.partNumber,
          manufacturerReference: current.manufacturerReference,
          approvalReference: current.approvalReference,
          vendorName: current.vendorName,
          orderReference: current.orderReference,
          orderedOn: current.orderedOn,
          receivedOn: current.receivedOn,
          repairWorkOrderId: current.repairWorkOrderId,
          resolutionNote: current.resolutionNote,
          notes: current.notes,
        }),
        body,
        input.taskId,
        TECHFLEX_ORG_ID,
        requestId,
      ),
    ]);
    return Response.json(
      {
        saved: true,
        followUp: {
          taskId: input.taskId,
          stage: input.stage,
          recordVersion: input.expectedRecordVersion + 1,
          sourceProgressVersion: input.sourceProgressVersion,
          needsReverification: false,
        },
      },
      { headers },
    );
  } catch (error) {
    if (requestId && actor) {
      try {
        const done = await env.DB.prepare(
          "SELECT organization_id AS organizationId,actor_user_id AS actor,after_json AS body FROM audit_logs WHERE id=?",
        )
          .bind(requestId)
          .first<{ organizationId: string; actor: string; body: string }>();
        if (
          done?.organizationId === TECHFLEX_ORG_ID &&
          done.actor === actor &&
          done.body === body
        ) {
          return Response.json({ saved: true, replayed: true }, { headers });
        }
      } catch {
        // Keep the original failure; retry retains its request identity.
      }
    }
    return failure(error);
  }
}
