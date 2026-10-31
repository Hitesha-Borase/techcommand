import {releasePendingSubmissionReviews} from "@/lib/submission-inbox";
import {procedureDocument,stampProcedureMeasurements} from "@/lib/asset-ai-procedure";
import { parseDisciplines } from "@/lib/service-disciplines";
import { env } from "cloudflare:workers";
import { z } from "zod";
import { apiError, requirePortalRole, TECHFLEX_ORG_ID, PortalHttpError } from "@/lib/portal-auth";
import { spinlifeDataSchema, spinlifeVisitSchema } from "@/lib/spinlife-simple";
import { privateHeaders, spinlifeRoles, spinlifeJobs, spinlifeJob, spinlifeJobSummaries, versionGuard, spinlifeAudit } from "@/lib/spinlife-store";
import {governedProcedureByRevision} from "@/lib/technical-knowledge";
import type { OrderTarget } from "@/lib/order-navigation";

const inputSchema=z.object({
  id:z.string().min(1).max(160), mutationId:z.string().uuid(), expectedVersion:z.number().int().min(0),
  expectedIntakeVersion:z.number().int().positive().optional(),
  action:z.enum(["save","start","submit"]).default("save"),
  data:spinlifeDataSchema.optional(), visit:spinlifeVisitSchema.optional(),
  technicianId:z.string().max(160).nullable().optional(),
  technicianPayCents:z.number().int().min(0).max(100000000).nullable().optional(),
  scheduledStart:z.string().max(120).nullable().optional(),
});
export async function GET(request:Request) {
  try {
    const identity=await requirePortalRole(request,[...spinlifeRoles]);
    await releasePendingSubmissionReviews();
    const params=new URL(request.url).searchParams;
    const id=params.get("id");
    if(id) return Response.json({job:await spinlifeJob(identity,id)},{headers:privateHeaders});
    const jobs=params.get("view")==="summary" ? await spinlifeJobSummaries(identity) : await spinlifeJobs(identity);
    const technicians=identity.role==="technician" ? [] : (await env.DB.prepare(`SELECT t.id,COALESCE(u.display_name,t.technician_code) AS name,u.email
      FROM technicians t JOIN users u ON u.id=t.user_id AND u.status='active'
      WHERE t.organization_id=? AND t.status='active' AND EXISTS (
        SELECT 1 FROM memberships m JOIN roles r ON r.id=m.role_id AND r.organization_id=m.organization_id
        WHERE m.user_id=t.user_id AND m.organization_id=t.organization_id AND m.status='active' AND r.name='technician')
      ORDER BY u.display_name`).bind(TECHFLEX_ORG_ID).all()).results;
    return Response.json({jobs,technicians,canAssign:identity.role!=="technician"},{headers:privateHeaders});
  } catch(error) {const r=apiError(error);r.headers.set("Cache-Control","private, no-store");return r;}
}
export async function POST(request:Request) {
  try {
    const identity=await requirePortalRole(request,[...spinlifeRoles]);
    const input=inputSchema.parse(await request.json());
    const current=(await spinlifeJobs(identity,input.id))[0];
    if(current?.lastMutationId===input.mutationId) return Response.json({job:current},{headers:privateHeaders});
    if(!current && await env.DB.prepare("SELECT id FROM work_order_intakes WHERE id=?").bind(input.id).first()) throw new PortalHttpError(404,"Work order not found or not assigned to you.");
    if(identity.role==="technician" && !current && !identity.technicianId) throw new PortalHttpError(409,"Your technician profile must be active before creating a work order. Your draft is preserved.");
    if((current?.version || 0)!==input.expectedVersion) throw new PortalHttpError(409,"This work order changed. Your entries are still on screen; reload the saved copy before trying again.");
    if(current && input.expectedIntakeVersion!==undefined && current.intakeVersion!==input.expectedIntakeVersion) throw new PortalHttpError(409,"The saved intake changed. Refresh the saved copy and keep your edits before trying again.");
    if(identity.role==="technician" && (input.technicianId!==undefined || input.technicianPayCents!==undefined)) throw new PortalHttpError(403,"Only an administrator can change assignment or technician pay.");
    const technicianId=identity.role==="technician" ? current?.technicianId || identity.technicianId : input.technicianId===undefined ? current?.technicianId || null : input.technicianId;
    const technicianPayCents=input.technicianPayCents===undefined ? current?.technicianPayCents ?? null : input.technicianPayCents;
    if(technicianId) {
      const valid=await env.DB.prepare(`SELECT t.id,t.service_disciplines_json AS disciplines FROM technicians t JOIN users u ON u.id=t.user_id AND u.status='active'
        WHERE t.id=? AND t.organization_id=? AND t.status='active' AND EXISTS (
          SELECT 1 FROM memberships m JOIN roles r ON r.id=m.role_id AND r.organization_id=m.organization_id
          WHERE m.user_id=t.user_id AND m.organization_id=t.organization_id AND m.status='active' AND r.name='technician')`)
        .bind(technicianId,TECHFLEX_ORG_ID).first<{id:string;disciplines:string|null}>();
      if(identity.role !== "technician" && valid?.disciplines != null && technicianId !== current?.technicianId && !parseDisciplines(valid.disciplines).includes("dme_mobility")) throw new PortalHttpError(409,"Choose a DME / Mobility field service technician. You can save this draft without assigning it.");
      if(!valid) throw new PortalHttpError(409,"That technician is not active in this company. You can save without an assignment.");
    }
    // Reassignment is still possible after start, but never attributes earlier
    // technician evidence/signatures to somebody else.
    if(current?.startedAt && technicianId!==current.technicianId) throw new PortalHttpError(409,"Work has already started. Keep the recorded technician on this visit; contact dispatch for additional coverage.");
    const data=input.data || current?.data || spinlifeDataSchema.parse({});
    const visit=input.visit || current?.visit || spinlifeVisitSchema.parse({});
    if(visit.manufacturerGuide){
      const samePinned=current?.visit.manufacturerGuide?.id===visit.manufacturerGuide.id && current.data.manufacturer===data.manufacturer && current.data.model===data.model && current.data.serviceType===data.serviceType;
      if(samePinned)visit.manufacturerGuide=current.visit.manufacturerGuide;
      else{
        const cacheKey=JSON.stringify([TECHFLEX_ORG_ID,data.manufacturer.trim().toLowerCase(),data.model.trim().toLowerCase(),data.serviceType]);
        const source=await env.DB.prepare("SELECT document_json AS documentJson,updated_at AS updatedAt FROM asset_procedure_research WHERE cache_key=? AND generation_id=? AND status='candidate'").bind(cacheKey,visit.manufacturerGuide.id).first<{documentJson:string;updatedAt:string}>();
        const governed=source?null:await governedProcedureByRevision(visit.manufacturerGuide.id);
        if(!source&&!governed)throw new PortalHttpError(409,"The manufacturer reference changed. Your answers remain on screen; save the equipment identity separately before applying new guidance.");
        if(governed&&!governed.isCurrent)throw new PortalHttpError(409,"A newer reviewed procedure revision is published. Reload the guide; your other entries remain on screen.");
        const document=procedureDocument.parse(source?JSON.parse(source.documentJson):governed!.document);visit.manufacturerGuide={id:visit.manufacturerGuide.id,document,retrievedAt:source?.updatedAt||governed!.updatedAt,reviewedAt:visit.manufacturerGuide.reviewedAt?new Date().toISOString():null,reviewedBy:visit.manufacturerGuide.reviewedAt?identity.userId:null};
      }
    }
    if(new Set(visit.manufacturerAnswers.map(answer=>answer.stepId)).size!==visit.manufacturerAnswers.length || visit.manufacturerAnswers.some(answer=>!visit.manufacturerGuide?.document.steps.some(step=>step.id===answer.stepId)))throw new PortalHttpError(400,"A procedure answer does not belong to this saved manufacturer revision. Reload the guide; your narrative remains on screen.");
    for(const answer of visit.manufacturerAnswers){const step=visit.manufacturerGuide!.document.steps.find(item=>item.id===answer.stepId)!;if(Object.keys(answer.photoCaptions).some(id=>!answer.photoAttachmentIds.includes(id)))throw new PortalHttpError(400,"A photo caption is not attached to this manufacturer procedure step. Reload the guide; your narrative remains on screen.");if(new Set(answer.measurements.map(item=>item.requirementId)).size!==answer.measurements.length||answer.measurements.some(item=>!step.measurements.some(requirement=>requirement.id===item.requirementId)))throw new PortalHttpError(400,"A measurement does not belong to this saved manufacturer revision. Reload the guide; your narrative remains on screen.");for(const evidence of answer.measurements){const requirement=step.measurements.find(item=>item.id===evidence.requirementId)!;if(evidence.unit&&evidence.unit!==requirement.unit)throw new PortalHttpError(400,`Record ${requirement.name} in the required unit: ${requirement.unit}.`);}}
    visit.manufacturerAnswers=stampProcedureMeasurements(current?.visit.manufacturerAnswers||[],visit.manufacturerAnswers,identity.userId,new Date().toISOString());
    const stepPhotoIds=[...new Set(visit.manufacturerAnswers.flatMap(answer=>answer.photoAttachmentIds))];
    if(stepPhotoIds.length>100)throw new PortalHttpError(400,"Keep up to 100 step-bound photos on one DME visit.");
    if(stepPhotoIds.length){const found=await env.DB.prepare(`SELECT id FROM attachments WHERE organization_id=? AND entity_type='work_order_intake' AND entity_id=? AND content_type LIKE 'image/%' AND id IN (${stepPhotoIds.map(()=>"?").join(",")})`).bind(TECHFLEX_ORG_ID,input.id,...stepPhotoIds).all<{id:string}>();if(found.results.length!==stepPhotoIds.length)throw new PortalHttpError(409,"A selected step photo is no longer available on this work order. Reload the photo list; your other entries remain on screen.");}
    if(current) {
      const factual=(v:typeof visit)=>JSON.stringify({parts:v.parts,reportWording:v.reportWording,narrative:v.narrative,findings:v.findings,testResults:v.testResults,recommendation:v.recommendation,disposition:v.disposition,photoCaptions:v.photoCaptions,
        previousGuidance:v.previousGuidance,manufacturerGuide:v.manufacturerGuide,manufacturerAnswers:v.manufacturerAnswers,checks:Object.fromEntries(Object.entries(v.checks).filter(([key])=>key!=="sl_attestation"))});
      const changed=JSON.stringify(data)!==JSON.stringify(current.data) || factual(visit)!==factual(current.visit);
      if(changed) {
        if(current.visit.signatureAttachmentId && visit.signatureAttachmentId===current.visit.signatureAttachmentId) visit.signatureAttachmentId="";
        if(current.visit.checks.sl_attestation?.state==="done") visit.checks={...visit.checks,sl_attestation:{state:"pending",note:"Record amended; confirmation applies to the previous version."}};
      }
    }
    if(visit.checks.sl_attestation?.state==="done") {
      if(current?.visit.checks.sl_attestation?.state!=="done" && (identity.role!=="technician" || identity.technicianId!==technicianId))
        throw new PortalHttpError(403,"Only the assigned technician can attest to their work. Save the other details with this check left for later.");
      visit.technicianAttestedAt=current?.visit.technicianAttestedAt || new Date().toISOString();
    } else visit.technicianAttestedAt="";
    if(visit.signatureAttachmentId) {
      const signature=await env.DB.prepare("SELECT id FROM attachments WHERE id=? AND organization_id=? AND entity_type='work_order_intake' AND entity_id=? AND category='signature' AND content_type IN ('image/png','image/jpeg')")
        .bind(visit.signatureAttachmentId,TECHFLEX_ORG_ID,input.id).first();
      if(!signature) throw new PortalHttpError(409,"The signature has not finished uploading to this order. Save without a signature or retry the upload.");
      visit.customerSignedAt=visit.signatureAttachmentId===current?.visit.signatureAttachmentId ? current.visit.customerSignedAt : new Date().toISOString();
    } else visit.customerSignedAt="";
    const externalId=data.externalId.trim() || null;
    const updatingExistingDraft=Boolean(current?.version && externalId===current.data.externalId.trim() && input.action==="save");
    let duplicate: OrderTarget | null = null;
    let duplicateTarget: OrderTarget | undefined;
    let warning: string | undefined;
    if(externalId) {
      duplicate=await env.DB.prepare(`SELECT id,'intake' AS kind FROM work_order_intakes WHERE organization_id=? AND lower(replace(source,' ',''))='spinlife' AND external_id=? AND id!=?
        UNION ALL SELECT id,'work_order' AS kind FROM work_orders WHERE organization_id=? AND lower(replace(external_source,' ',''))='spinlife' AND external_id=? LIMIT 1`)
        .bind(TECHFLEX_ORG_ID,externalId,input.id,TECHFLEX_ORG_ID,externalId).first<OrderTarget>();
      if(duplicate) {
        // A technician must not learn another technician's record identity.
        if(identity.role!=="technician") duplicateTarget=duplicate;
        else if(duplicate.kind==="intake" && (await spinlifeJobs(identity,duplicate.id)).length) duplicateTarget=duplicate;
        if(!updatingExistingDraft) return Response.json({error:"This SpinLife number already has a saved record. Open that record to continue; your entries remain here. No second job was created.",...(duplicateTarget?{existingId:duplicateTarget.id,target:duplicateTarget}:{})},{status:409,headers:privateHeaders});
        warning="Your changes were saved to this existing draft. Another record has the same number; the records were not merged. Review the other saved record before starting additional work.";
      }
    }
    if(input.action==="start" && !technicianId) throw new PortalHttpError(409,"Save this draft, then select the technician to start their work order.");
    const now=new Date().toISOString();
    const startedAt=current?.startedAt || (input.action==="start"?now:null);
    const status=input.action==="submit"||["spinlife_review","spinlife_completed"].includes(current?.status || "")?"spinlife_completed":startedAt?"spinlife_in_progress":technicianId?"spinlife_assigned":"spinlife_draft";
    const version=input.expectedVersion+1;
    const scheduledStart=input.scheduledStart===undefined ? current?.scheduledStart || null : input.scheduledStart;
    if(scheduledStart && scheduledStart!==current?.scheduledStart && (!/^\d{4}-\d{2}-\d{2}$/.test(scheduledStart) || !Number.isFinite(Date.parse(scheduledStart)) || new Date(scheduledStart).toISOString().slice(0,10)!==scheduledStart)) throw new PortalHttpError(400,"Choose a valid planned date, or clear the date to save for later.");
    const statements=[];
    if(!current) statements.push(env.DB.prepare("SELECT CASE WHEN NOT EXISTS(SELECT 1 FROM work_order_intakes WHERE id=?) THEN 1 ELSE json('spinlife_create_conflict') END").bind(input.id));
    if(current?.version) statements.push(versionGuard(input.id,input.expectedVersion,identity.technicianId,identity));
    else if(current) statements.push(env.DB.prepare(`SELECT CASE WHEN EXISTS (SELECT 1 FROM work_order_intakes WHERE id=? AND organization_id=? AND converted_work_order_id IS NULL AND status NOT IN ('converted','archived')) THEN 1 ELSE json('spinlife_adopt_conflict') END`).bind(input.id,TECHFLEX_ORG_ID));
    if(!current?.version) statements.push(env.DB.prepare("SELECT CASE WHEN NOT EXISTS(SELECT 1 FROM spinlife_visits WHERE intake_id=?) THEN 1 ELSE json('spinlife_adopt_conflict') END").bind(input.id));
    if(current) statements.push(env.DB.prepare("SELECT CASE WHEN EXISTS(SELECT 1 FROM work_order_intakes WHERE id=? AND organization_id=? AND record_version=?) THEN 1 ELSE json('spinlife_intake_version_conflict') END").bind(input.id,TECHFLEX_ORG_ID,current.intakeVersion));
    if(technicianId) statements.push(env.DB.prepare(`SELECT CASE WHEN EXISTS (SELECT 1 FROM technicians t JOIN users u ON u.id=t.user_id AND u.status='active'
      WHERE t.id=? AND t.organization_id=? AND t.status='active' AND EXISTS(SELECT 1 FROM memberships m JOIN roles r ON r.id=m.role_id AND r.organization_id=m.organization_id WHERE m.user_id=t.user_id AND m.organization_id=t.organization_id AND m.status='active' AND r.name='technician')) THEN 1 ELSE json('spinlife_technician_conflict') END`).bind(technicianId,TECHFLEX_ORG_ID));
    // Preserve previous account-specific pricing, source/provenance fields and
    // linked records on adopted intakes; only the simple fields are updated.
    if(current) statements.push(env.DB.prepare(`UPDATE work_order_intakes SET external_id=?,data_json=json_patch(data_json,?),status=?,blocking_count=0,missing_fields_json='[]',updated_by=?,updated_at=?,record_version=record_version+1 WHERE id=? AND organization_id=?`)
      .bind(externalId,JSON.stringify(data),status,identity.userId,now,input.id,TECHFLEX_ORG_ID));
    else statements.push(env.DB.prepare(`INSERT INTO work_order_intakes (id,organization_id,source,external_id,status,data_json,created_by,updated_by) VALUES (?,?,'spinlife',?,?,?,?,?)`)
      .bind(input.id,TECHFLEX_ORG_ID,externalId,status,JSON.stringify(data),identity.userId,identity.userId));
    statements.push(env.DB.prepare(`INSERT INTO spinlife_visits (intake_id,technician_id,technician_pay_cents,scheduled_start,started_at,visit_json,record_version,last_mutation_id)
      VALUES (?,?,?,?,?,?,?,?) ON CONFLICT(intake_id) DO UPDATE SET technician_id=excluded.technician_id,technician_pay_cents=excluded.technician_pay_cents,
      scheduled_start=excluded.scheduled_start,started_at=excluded.started_at,visit_json=excluded.visit_json,record_version=excluded.record_version,last_mutation_id=excluded.last_mutation_id`)
      .bind(input.id,technicianId,technicianPayCents,scheduledStart,startedAt,JSON.stringify(visit),version,input.mutationId));
    // Updating an already-existing draft does not create another job identity.
    // Creation, renumbering, first adoption and Start still require uniqueness
    // inside the transaction; all saves retain the exact-record version guards.
    if(externalId && !updatingExistingDraft) {
      statements.push(env.DB.prepare(`SELECT CASE WHEN NOT EXISTS(SELECT 1 FROM work_orders WHERE organization_id=? AND lower(replace(external_source,' ',''))='spinlife' AND external_id=?) THEN 1 ELSE json('spinlife_duplicate_conflict') END`).bind(TECHFLEX_ORG_ID,externalId));
      statements.push(env.DB.prepare(`SELECT CASE WHEN NOT EXISTS(SELECT 1 FROM work_order_intakes WHERE organization_id=? AND lower(replace(source,' ',''))='spinlife' AND external_id=? AND id!=?) THEN 1 ELSE json('spinlife_duplicate_conflict') END`).bind(TECHFLEX_ORG_ID,externalId,input.id));
    }
    statements.push(spinlifeAudit(identity,input.id,input.action==="submit"?"spinlife.submitted":input.action==="start"&&!current?.startedAt?"spinlife.started":"spinlife.saved",current || null,{data,visit,technicianId,technicianPayCents,scheduledStart,startedAt,version}));
    if (input.action === "submit") statements.push(env.DB.prepare(`INSERT INTO admin_tasks
      (id,organization_id,assigned_role,category,title,instructions,priority,status,source,source_record_id)
      VALUES (?,?,'operations_administrator','Submissions',?,?,'normal','open','spinlife_submission',?)
      ON CONFLICT(source,source_record_id) DO UPDATE SET title=excluded.title,instructions=excluded.instructions,
        status='open',completed_at=NULL,completed_by=NULL,record_version=record_version+1,updated_at=CURRENT_TIMESTAMP`).bind(
          `spinlife-submission:${input.id}`,TECHFLEX_ORG_ID,`Submission inbox: ${externalId || input.id}`,
          `Informational copy. Field work is complete; no administrator approval is required. Open this order in DME / Mobility to view notes and files.\nVisit notes: ${visit.narrative || visit.findings || "See saved visit"}`,input.id));
    try {await env.DB.batch(statements);} catch(error) {
      const saved=(await spinlifeJobs(identity,input.id))[0];
      if(saved?.lastMutationId===input.mutationId) return Response.json({job:saved},{headers:privateHeaders});
      if(saved?.version!==current?.version || /conflict|UNIQUE|malformed JSON/i.test(String(error))) throw new PortalHttpError(409,"Another save changed this work order. Your entries are still on screen; reload the saved copy before trying again.");
      throw error;
    }
    return Response.json({job:await spinlifeJob(identity,input.id),...(warning?{warning,target:duplicateTarget}:{})},{status:current?200:201,headers:privateHeaders});
  } catch(error) {const r=apiError(error);r.headers.set("Cache-Control","private, no-store");return r;}
}
