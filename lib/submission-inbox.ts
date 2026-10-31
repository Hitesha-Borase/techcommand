import { env } from "cloudflare:workers";
import { TECHFLEX_ORG_ID } from "@/lib/portal-auth";

let inFlight: Promise<void> | null = null;
let lastReleaseAt = 0;

// Release older submissions that were waiting for mandatory review. This is a
// bounded, repeatable data transition, with no billing or qualification effects.
export async function releasePendingSubmissionReviews() {
  if (inFlight) return inFlight;
  if (Date.now() - lastReleaseAt < 60000) return;
  inFlight = applyPendingSubmissionRelease().then(() => { lastReleaseAt = Date.now(); }).finally(() => { inFlight = null; });
  return inFlight;
}

async function applyPendingSubmissionRelease() {
  await env.DB.batch([
    env.DB.prepare(`UPDATE work_orders SET status='completed',
      completed_at=COALESCE(completed_at,(SELECT MAX(sr.submitted_at) FROM service_reports sr WHERE sr.work_order_id=work_orders.id AND sr.qa_status='submitted'),CURRENT_TIMESTAMP),
      record_version=record_version+1,updated_at=CURRENT_TIMESTAMP
      WHERE organization_id=? AND id IN (
        SELECT w.id FROM work_orders w WHERE w.organization_id=? AND w.status='technician_submitted'
          AND EXISTS(SELECT 1 FROM service_reports sr WHERE sr.work_order_id=w.id AND sr.qa_status='submitted')
        LIMIT 200
      )`).bind(TECHFLEX_ORG_ID,TECHFLEX_ORG_ID),
    env.DB.prepare(`UPDATE admin_tasks SET category='Submissions',priority='normal',assigned_role='operations_administrator',
      title='Submission inbox: ' || COALESCE((SELECT external_id FROM work_orders w WHERE w.id=admin_tasks.work_order_id),title),
      instructions='Informational technician submission. Field work is complete. Administrator review, comments and report edits are optional and do not block the technician.',
      record_version=record_version+1,updated_at=CURRENT_TIMESTAMP
      WHERE organization_id=? AND id IN (SELECT id FROM admin_tasks
        WHERE organization_id=? AND source='service_report' AND category != 'Submissions'
          AND work_order_id IN (SELECT id FROM work_orders WHERE organization_id=? AND status='completed') LIMIT 200)`)
      .bind(TECHFLEX_ORG_ID,TECHFLEX_ORG_ID,TECHFLEX_ORG_ID),
    env.DB.prepare(`INSERT INTO admin_tasks(id,organization_id,assigned_role,category,title,instructions,priority,status,source,source_record_id)
      SELECT 'spinlife-submission:' || i.id,i.organization_id,'operations_administrator','Submissions','Submission inbox: ' || COALESCE(i.external_id,i.id),
        'Informational field submission. Review is optional. Open this order in DME / Mobility to view the saved notes and files.','normal','open','spinlife_submission',i.id
      FROM work_order_intakes i WHERE i.organization_id=? AND i.status='spinlife_review' AND i.converted_work_order_id IS NULL
        AND EXISTS(SELECT 1 FROM spinlife_visits v WHERE v.intake_id=i.id) ORDER BY i.id LIMIT 200
      ON CONFLICT(source,source_record_id) DO NOTHING`).bind(TECHFLEX_ORG_ID),
    env.DB.prepare(`UPDATE work_order_intakes SET status='spinlife_completed',record_version=record_version+1,updated_at=CURRENT_TIMESTAMP
      WHERE organization_id=? AND id IN (SELECT i.id FROM work_order_intakes i WHERE i.organization_id=? AND i.status='spinlife_review'
        AND i.converted_work_order_id IS NULL AND EXISTS(SELECT 1 FROM spinlife_visits v WHERE v.intake_id=i.id) ORDER BY i.id LIMIT 200)`)
      .bind(TECHFLEX_ORG_ID,TECHFLEX_ORG_ID),
  ]);
}
