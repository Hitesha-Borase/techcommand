import {procedureAnswer,procedureDocument,readProcedure,readAnswers,stampProcedureMeasurements,type ProcedureSnapshot} from "@/lib/asset-ai-procedure";
import {catalogingSnapshot} from "@/lib/biomedical-workflows";
import { env } from "cloudflare:workers";
import {governedProcedureByRevision} from "@/lib/technical-knowledge";
import { z } from "zod";
import {
  TECHFLEX_ORG_ID,
  apiError,
  requirePortalRole,
} from "@/lib/portal-auth";

const privateNoStore = { "Cache-Control": "private, no-store" } as const;
const activeAssignmentStatuses = [
  "offered",
  "assigned",
  "accepted",
  "dispatched",
  "arrived",
  "in_progress",
  "submitted",
] as const;

const progressSchema = z
  .object({
    workOrderId: z.string().trim().min(1).max(160),
    assetId: z.string().trim().min(1).max(160),
    expectedRecordVersion: z.number().int().positive(),
    procedureId: z.string().max(200).optional(),
    procedureReviewed: z.boolean().optional(),
    procedureAnswers: z.array(procedureAnswer).max(100).optional(),
    status: z.enum(["not_started", "in_progress", "completed", "not_applicable"]),
    notes: z.string().trim().max(10000).optional().default(""),
    findings: z.string().trim().max(10000).optional().default(""),
    workPerformed: z.string().trim().max(10000).optional().default(""),
    testResults: z.string().trim().max(10000).optional().default(""),
    disposition: z
      .enum([
        "passed",
        "returned_to_service",
        "parts_required",
        "follow_up_required",
        "quarantined",
        "retired",
        "needs_resolution",
        "needs_review",
        "cataloged",
      ])
      .optional()
      .nullable(),
    notApplicableReason: z.string().trim().max(2000).optional().default(""),
  })
  .strict()
  .superRefine((input, context) => {
    const resultFields = [input.findings, input.workPerformed, input.testResults];
    if (input.status === "completed") {
      if (![input.notes, ...resultFields].some(value => value.trim()))
        context.addIssue({ code: z.ZodIssueCode.custom, path: ["notes"], message: "Record a note, or save unfinished work as In progress." });
    }
    if (input.status === "not_applicable") {
      if (input.notApplicableReason.length < 3)
        context.addIssue({ code: z.ZodIssueCode.custom, path: ["notApplicableReason"], message: "Explain why this equipment is not applicable to the round." });
    }
    if (input.status === "not_started" && (resultFields.some(Boolean) || input.disposition || input.notApplicableReason))
      context.addIssue({ code: z.ZodIssueCode.custom, path: ["status"], message: "Use In progress to preserve entered results, or clear them before returning to Not started." });
  });

type AssetProgressRow = {
  serviceType: string;
  id: string;
  assetId: string;
  assetTag: string;
  manufacturer: string | null;
  model: string | null;
  serialNumber: string | null;
  description: string | null;
  status: string;
  notes: string | null;
  findings: string | null;
  workPerformed: string | null;
  testResults: string | null;
  disposition: string | null;
  notApplicableReason: string | null;
  procedureSnapshotJson: string | null;
  procedureAnswersJson: string | null;
  recordVersion: number;
  updatedAt: string;
};

async function assetProgress(workOrderId: string, technicianId: string) {
  return env.DB.prepare(
    `SELECT w.service_type AS serviceType, wa.id, wa.asset_id AS assetId, a.asset_tag AS assetTag,
            a.manufacturer, a.model, a.serial_number AS serialNumber,
            a.description, wa.status, wa.notes, wa.findings,
            wa.work_performed AS workPerformed, wa.test_results AS testResults,
            wa.disposition, wa.not_applicable_reason AS notApplicableReason,
            wa.procedure_snapshot_json AS procedureSnapshotJson, wa.procedure_answers_json AS procedureAnswersJson,
            wa.record_version AS recordVersion, wa.updated_at AS updatedAt
       FROM work_order_assets wa
       JOIN work_orders w ON w.id = wa.work_order_id
        AND w.organization_id = wa.organization_id
       JOIN assets a ON a.id = wa.asset_id
        AND a.organization_id = wa.organization_id
        AND a.account_id = w.account_id AND a.location_id = w.location_id
       JOIN work_order_assignments assign ON assign.work_order_id = w.id
        AND assign.technician_id = ?
        AND assign.status IN (${activeAssignmentStatuses.map(() => "?").join(",")})
      WHERE wa.organization_id = ? AND wa.work_order_id = ?
        AND w.status != 'cancelled'
      ORDER BY a.asset_tag, a.id`,
  )
    .bind(technicianId, ...activeAssignmentStatuses, TECHFLEX_ORG_ID, workOrderId)
    .all<AssetProgressRow>();
}

export async function GET(request: Request) {
  try {
    const identity = await requirePortalRole(request, [
      "technician",
      "owner_administrator",
      "operations_administrator",
      "biomedical_lead",
    ]);
    const technicianId = identity.role === "technician" ? identity.technicianId : (identity.technicianId || "tech_demo_1");
    if (!technicianId)
      return Response.json(
        { error: "This login is not linked to an active technician profile." },
        { status: 403, headers: privateNoStore },
      );
    const workOrderId = new URL(request.url).searchParams.get("workOrderId")?.trim();
    if (!workOrderId)
      return Response.json(
        { error: "Choose a work order." },
        { status: 400, headers: privateNoStore },
      );
    const result = await assetProgress(workOrderId, technicianId);
    return Response.json({ assets: result.results }, { headers: privateNoStore });
  } catch (error) {
    const response = apiError(error);
    response.headers.set("Cache-Control", privateNoStore["Cache-Control"]);
    return response;
  }
}

export async function POST(request: Request) {
  try {
    const identity = await requirePortalRole(request, [
      "technician",
      "owner_administrator",
      "operations_administrator",
      "biomedical_lead",
    ]);
    const technicianId = identity.role === "technician" ? identity.technicianId : (identity.technicianId || "tech_demo_1");
    if (!technicianId)
      return Response.json(
        { error: "This login is not linked to an active technician profile." },
        { status: 403, headers: privateNoStore },
      );
    const input = progressSchema.parse(await request.json());
    const scoped = (await assetProgress(input.workOrderId,technicianId)).results.find(a=>a.assetId===input.assetId);
    if(!scoped)return Response.json({error:"This equipment is no longer assigned to you. Your entries remain on this screen."},{status:409,headers:privateNoStore});
    let snapshot:ProcedureSnapshot|null=readProcedure(scoped.procedureSnapshotJson);
    const cataloging=scoped.serviceType==="biomed_cataloging";
    if(cataloging&&!snapshot)snapshot=catalogingSnapshot(scoped);
    if(cataloging&&input.procedureId&&input.procedureId!==snapshot?.id)return Response.json({error:"Use this asset's cataloging checklist; no diagnostic protocol is applied to cataloging."},{status:400,headers:privateNoStore});
    if(input.disposition==='cataloged'&&!cataloging)return Response.json({error:"Cataloged is only an inventory outcome, not a maintenance or repair result."},{status:400,headers:privateNoStore});
    if(cataloging&&['passed','returned_to_service'].includes(input.disposition||''))return Response.json({error:"Cataloging does not establish a passing test or return to service. Choose Cataloged or an unresolved disposition."},{status:400,headers:privateNoStore});
    if(input.procedureId && snapshot?.id!==input.procedureId){
      if(snapshot)return Response.json({error:"This item already has a saved procedure. Reload it to preserve its answers."},{status:409,headers:privateNoStore});
      const research=await env.DB.prepare("SELECT document_json AS documentJson,updated_at AS updatedAt FROM asset_procedure_research WHERE organization_id=? AND generation_id=? AND status='candidate'").bind(TECHFLEX_ORG_ID,input.procedureId).first<{documentJson:string;updatedAt:string}>();
      const governed=research?null:await governedProcedureByRevision(input.procedureId);
      if(!research&&!governed)return Response.json({error:"Reload the retrieved procedure before saving."},{status:409,headers:privateNoStore});
      if(governed&&!governed.isCurrent)return Response.json({error:"A newer reviewed procedure revision is published. Reload the guide; your other entries remain on screen."},{status:409,headers:privateNoStore});
      const document=procedureDocument.parse(research?JSON.parse(research.documentJson):governed!.document);
      if(document.manufacturer.trim().toLowerCase()!==scoped.manufacturer?.trim().toLowerCase() || document.model.trim().toLowerCase()!==scoped.model?.trim().toLowerCase())return Response.json({error:"The procedure does not match this equipment."},{status:400,headers:privateNoStore});
      snapshot={id:input.procedureId,document,retrievedAt:research?.updatedAt||governed!.updatedAt,reviewedBy:null,reviewedAt:null};
    }
    if(!cataloging && input.status==='completed' && ['passed','returned_to_service'].includes(input.disposition||'') && snapshot && (snapshot.document.manufacturer.trim().toLowerCase()!==scoped.manufacturer?.trim().toLowerCase() || snapshot.document.model.trim().toLowerCase()!==scoped.model?.trim().toLowerCase()))return Response.json({error:"Equipment identity changed since this procedure was attached. Save observations without claiming protocol completion; resolve the source match."},{status:409,headers:privateNoStore});
    if(snapshot && input.procedureReviewed===true && !snapshot.reviewedAt)snapshot={...snapshot,reviewedBy:identity.userId,reviewedAt:new Date().toISOString()};
    if(snapshot && input.procedureReviewed===false)snapshot={...snapshot,reviewedBy:null,reviewedAt:null};
    const previousAnswers=readAnswers(scoped.procedureAnswersJson);
    const answers=stampProcedureMeasurements(previousAnswers,input.procedureAnswers ?? previousAnswers,identity.userId,new Date().toISOString());
    if(new Set(answers.map(a=>a.stepId)).size!==answers.length || answers.some(a=>!snapshot?.document.steps.some(s=>s.id===a.stepId)))return Response.json({error:"One of these answers does not belong to the attached procedure. Reload the item; keep your entered notes."},{status:400,headers:privateNoStore});
    for(const answer of answers){
      const step=snapshot?.document.steps.find(item=>item.id===answer.stepId);
      if(Object.keys(answer.photoCaptions).some(id=>!answer.photoAttachmentIds.includes(id)))return Response.json({error:"A photo caption is not attached to this procedure step. Reload the item; your narrative remains on screen."},{status:400,headers:privateNoStore});
      if(new Set(answer.measurements.map(item=>item.requirementId)).size!==answer.measurements.length || answer.measurements.some(item=>!step?.measurements.some(requirement=>requirement.id===item.requirementId)))return Response.json({error:"A measurement does not belong to this saved procedure revision. Reload the item; your narrative remains on screen."},{status:400,headers:privateNoStore});
      for(const evidence of answer.measurements){const requirement=step!.measurements.find(item=>item.id===evidence.requirementId)!;if(evidence.unit&&evidence.unit!==requirement.unit)return Response.json({error:`Record ${requirement.name} in the required unit: ${requirement.unit}.`},{status:400,headers:privateNoStore});}
    }
    const photoIds=[...new Set(answers.flatMap(answer=>answer.photoAttachmentIds))];
    if(photoIds.length>100)return Response.json({error:"Keep up to 100 step-bound photos on one equipment record."},{status:400,headers:privateNoStore});
    if(photoIds.length){const found=await env.DB.prepare(`SELECT id FROM attachments WHERE organization_id=? AND entity_type='work_order' AND entity_id=? AND content_type LIKE 'image/%' AND id IN (${photoIds.map(()=>"?").join(",")})`).bind(TECHFLEX_ORG_ID,input.workOrderId,...photoIds).all<{id:string}>();if(found.results.length!==photoIds.length)return Response.json({error:"A selected step photo is no longer available on this work order. Reload the photo list; your other entries remain on screen."},{status:409,headers:privateNoStore});}
    if(input.status === "completed" && !input.disposition) input.disposition = cataloging ? "cataloged" : "needs_review";
    const auditId = crypto.randomUUID();
    const followUpRequested=["parts_required","follow_up_required","quarantined","needs_resolution"].includes(input.disposition || "");
    const followUpEvidenceChanged=
      scoped.status!==input.status ||
      (scoped.notes||"")!==input.notes ||
      (scoped.findings||"")!==input.findings ||
      (scoped.workPerformed||"")!==input.workPerformed ||
      (scoped.testResults||"")!==input.testResults ||
      (scoped.disposition||null)!==(input.disposition||null);
    const followUpInstructions=`Technician-reported status: ${input.status}. Disposition: ${input.disposition || "Not recorded"}.\nFindings: ${input.findings || "Not recorded"}\nWork performed: ${input.workPerformed || "Not recorded"}\nTests: ${input.testResults || "Not recorded"}\nNotes / requested parts: ${input.notes || "Not recorded"}\nNext: verify exact manufacturer, model, serial and compatible part number; use the approved manufacturer reference for contact details. If unavailable, verify the official service contact before calling. Record account setup if needed, ordering approval and delivery status; schedule the assigned qualified technician after delivery. No part has been ordered and no repair has been scheduled by this save.`;
    try {
      await env.DB.batch([
        env.DB.prepare(
          `SELECT CASE WHEN EXISTS (
             SELECT 1 FROM work_order_assets wa
             JOIN work_orders w ON w.id=wa.work_order_id
              AND w.organization_id=wa.organization_id
             JOIN assets a ON a.id=wa.asset_id
              AND a.organization_id=wa.organization_id
              AND a.account_id=w.account_id AND a.location_id=w.location_id
            WHERE wa.organization_id=? AND wa.work_order_id=? AND wa.asset_id=?
              AND wa.record_version=? AND w.service_type=?
              AND w.status != 'cancelled'
              AND EXISTS (SELECT 1 FROM work_order_assignments assign
                WHERE assign.work_order_id=w.id AND assign.technician_id=?
                  AND assign.status IN (${activeAssignmentStatuses.map(() => "?").join(",")}))
           ) THEN 1 ELSE json('asset_progress_conflict') END`,
        ).bind(
          TECHFLEX_ORG_ID,
          input.workOrderId,
          input.assetId,
          input.expectedRecordVersion,
          scoped.serviceType,
          technicianId,
          ...activeAssignmentStatuses,
        ),
        env.DB.prepare(
          `UPDATE work_order_assets SET status=?, notes=?, findings=?, work_performed=?,
             test_results=?, disposition=?, not_applicable_reason=?, updated_by=?, procedure_snapshot_json=?,procedure_answers_json=?,
             record_version=record_version+1, updated_at=CURRENT_TIMESTAMP
           WHERE organization_id=? AND work_order_id=? AND asset_id=? AND record_version=?`,
        ).bind(
          input.status,
          input.notes || null,
          input.findings || null,
          input.workPerformed || null,
          input.testResults || null,
          input.disposition || null,
          input.notApplicableReason || null,
          identity.userId,
          snapshot?JSON.stringify(snapshot):null,
          JSON.stringify(answers),
          TECHFLEX_ORG_ID,
          input.workOrderId,
          input.assetId,
          input.expectedRecordVersion,
        ),
        ...(followUpRequested ? [env.DB.prepare(`INSERT INTO admin_tasks(id,organization_id,account_id,work_order_id,assigned_role,category,title,instructions,priority,status,source,source_record_id)
          SELECT ?,w.organization_id,w.account_id,w.id,'operations_administrator','biomedical_follow_up',
          'Biomedical equipment needs attention: ' || a.asset_tag, 'Equipment: ' || COALESCE(a.manufacturer,'Manufacturer not recorded') || ' | ' || COALESCE(a.model,'Model not recorded') || ' | Serial ' || COALESCE(a.serial_number,'not recorded') || char(10) || ?,?,'open','biomedical_asset_progress',p.id
          FROM work_orders w JOIN work_order_assets p ON p.work_order_id=w.id AND p.organization_id=w.organization_id
          JOIN assets a ON a.id=p.asset_id AND a.organization_id=w.organization_id AND a.account_id=w.account_id AND a.location_id=w.location_id
          WHERE w.id=? AND w.organization_id=? AND a.id=?
          ON CONFLICT(id) DO UPDATE SET
            instructions=CASE WHEN ? THEN excluded.instructions ELSE admin_tasks.instructions END,
            priority=CASE WHEN ? THEN excluded.priority ELSE admin_tasks.priority END,
            status=CASE WHEN ? THEN 'open' ELSE admin_tasks.status END,
            completed_at=CASE WHEN ? THEN NULL ELSE admin_tasks.completed_at END,
            completed_by=CASE WHEN ? THEN NULL ELSE admin_tasks.completed_by END,
            record_version=admin_tasks.record_version+CASE WHEN ? THEN 1 ELSE 0 END,
            updated_at=CASE WHEN ? THEN CURRENT_TIMESTAMP ELSE admin_tasks.updated_at END`)
          .bind(`bio-followup:${input.workOrderId}:${input.assetId}`,
            followUpInstructions,
            input.disposition === "quarantined" ? "high" : "normal",input.workOrderId,TECHFLEX_ORG_ID,input.assetId,
            ...Array(7).fill(Number(followUpEvidenceChanged))),
          env.DB.prepare(`INSERT INTO biomedical_follow_ups
            (id,organization_id,task_id,work_order_asset_id,source_progress_version,stage,needs_reverification,updated_by)
            SELECT 'bio-followup:' || p.work_order_id || ':' || p.asset_id,p.organization_id,
                   'bio-followup:' || p.work_order_id || ':' || p.asset_id,p.id,p.record_version,
                   'needs_verification',0,?
              FROM work_order_assets p
             WHERE p.work_order_id=? AND p.asset_id=? AND p.organization_id=?
            ON CONFLICT(task_id) DO UPDATE SET
              source_progress_version=excluded.source_progress_version,
              needs_reverification=CASE WHEN ? THEN 1 ELSE biomedical_follow_ups.needs_reverification END,
              record_version=biomedical_follow_ups.record_version+CASE WHEN ? THEN 1 ELSE 0 END,
              last_request_id=CASE WHEN ? THEN NULL ELSE biomedical_follow_ups.last_request_id END,
              updated_at=CURRENT_TIMESTAMP`)
            .bind(identity.userId,input.workOrderId,input.assetId,TECHFLEX_ORG_ID,
              Number(followUpEvidenceChanged),Number(followUpEvidenceChanged),Number(followUpEvidenceChanged))] : [
          env.DB.prepare(`UPDATE admin_tasks SET
              instructions=CASE WHEN ? THEN ? ELSE instructions END,
              status=CASE WHEN ? THEN 'open' ELSE status END,
              completed_at=CASE WHEN ? THEN NULL ELSE completed_at END,
              completed_by=CASE WHEN ? THEN NULL ELSE completed_by END,
              record_version=record_version+CASE WHEN ? THEN 1 ELSE 0 END,
              updated_at=CASE WHEN ? THEN CURRENT_TIMESTAMP ELSE updated_at END
            WHERE id=? AND organization_id=? AND source='biomedical_asset_progress'`)
            .bind(Number(followUpEvidenceChanged),followUpInstructions,
              ...Array(5).fill(Number(followUpEvidenceChanged)),
              `bio-followup:${input.workOrderId}:${input.assetId}`,TECHFLEX_ORG_ID),
          env.DB.prepare(`UPDATE biomedical_follow_ups SET
              source_progress_version=(SELECT record_version FROM work_order_assets WHERE id=biomedical_follow_ups.work_order_asset_id AND organization_id=biomedical_follow_ups.organization_id),
              needs_reverification=CASE WHEN ? THEN 1 ELSE needs_reverification END,
              record_version=record_version+CASE WHEN ? THEN 1 ELSE 0 END,
              last_request_id=CASE WHEN ? THEN NULL ELSE last_request_id END,
              updated_at=CASE WHEN ? THEN CURRENT_TIMESTAMP ELSE updated_at END
            WHERE task_id=? AND organization_id=?`)
            .bind(Number(followUpEvidenceChanged),Number(followUpEvidenceChanged),Number(followUpEvidenceChanged),Number(followUpEvidenceChanged),
              `bio-followup:${input.workOrderId}:${input.assetId}`,TECHFLEX_ORG_ID),
        ]),
        env.DB.prepare(
          `INSERT INTO audit_logs
            (id, organization_id, actor_user_id, action, entity_type, entity_id, after_json)
           VALUES (?, ?, ?, 'work_order.asset_progress_saved', 'work_order_asset',
                   (SELECT id FROM work_order_assets WHERE organization_id=? AND work_order_id=? AND asset_id=?), ?)`,
        ).bind(
          auditId,
          TECHFLEX_ORG_ID,
          identity.userId,
          TECHFLEX_ORG_ID,
          input.workOrderId,
          input.assetId,
          JSON.stringify({
            workOrderId: input.workOrderId,
            assetId: input.assetId,
            status: input.status,
            notesRecorded: Boolean(input.notes),
            findingsRecorded: Boolean(input.findings),
            workPerformedRecorded: Boolean(input.workPerformed),
            testResultsRecorded: Boolean(input.testResults),
            disposition: input.disposition || null,
            notApplicableReasonRecorded: Boolean(input.notApplicableReason),
          }),
        ),
      ]);
    } catch (error) {
      if (String(error).includes("malformed JSON"))
        return Response.json(
          {
            error:
              "This equipment progress changed in another tab or is no longer assigned to you. Your entries are still on this screen. Reload the item before saving again.",
          },
          { status: 409, headers: privateNoStore },
        );
      throw error;
    }
    const saved = await assetProgress(input.workOrderId, technicianId);
    const item = saved.results.find((row) => row.assetId === input.assetId);
    if (!item)
      return Response.json(
        { error: "The save could not be confirmed. Keep this screen open and reload the equipment list." },
        { status: 409, headers: privateNoStore },
      );
    return Response.json({ asset: item }, { headers: privateNoStore });
  } catch (error) {
    if (error instanceof z.ZodError)
      return Response.json(
        {
          error:
            error.issues[0]?.message ||
            "Review this equipment item and try the save again.",
          details: error.flatten(),
        },
        { status: 400, headers: privateNoStore },
      );
    const response = apiError(error);
    response.headers.set("Cache-Control", privateNoStore["Cache-Control"]);
    return response;
  }
}
