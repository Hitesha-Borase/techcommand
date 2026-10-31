import { env } from 'cloudflare:workers';
import { z } from 'zod';
import { TECHFLEX_ORG_ID, apiError, requirePortalRole } from '@/lib/portal-auth';
import { auditAreas, closureError, csvCell, isValidDate, type ComplianceRecord } from '@/lib/compliance-policy';

const date = z.string().max(10).refine(isValidDate, 'Use a valid calendar date.');
const note = z.string().trim().max(4000);
const schema = z.object({
  id: z.string().uuid(), version: z.number().int().min(0), title: z.string().trim().min(3).max(240),
  kind: z.enum(['audit', 'complaint', 'incident', 'adverse_event', 'survey']),
  status: z.enum(['open', 'in_progress', 'complete']), priority: z.enum(['urgent','high','normal','low']),
  periodStart: date, periodEnd: date, scope: note, sample: note, summary: note,
  owner: z.string().trim().max(200), dueDate: date, evidenceIds: z.array(z.string().max(200)).max(50),
  checks: z.array(z.object({ area: z.enum(auditAreas), result: z.enum(['not_reviewed','pass','finding','not_applicable']), evidence: note, finding: note, correctiveAction: note, responsible: z.string().max(200), dueDate: date, verification: note })).max(8),
  correctiveAction: note, verification: note,
}).refine(r => !r.periodStart || !r.periodEnd || r.periodStart <= r.periodEnd, 'Audit end date must follow its start date.');
const roles = ['owner_administrator', 'operations_administrator'] as const;
const select = `SELECT id, title, category, instructions, status, priority, record_version AS version, created_at AS createdAt, updated_at AS updatedAt FROM admin_tasks WHERE organization_id = ? AND source = 'compliance'`;
function record(row: Record<string, unknown>): ComplianceRecord {
  const value = JSON.parse(String(row.instructions || '{}'));
  return { ...value, id: row.id, title: row.title, kind: row.category, status: row.status, priority: row.priority, version: row.version, createdAt: row.createdAt, updatedAt: row.updatedAt };
}
export async function GET(request: Request) {
  try {
    const identity = await requirePortalRole(request, [...roles]);
    const url = new URL(request.url);
    if (url.searchParams.get('history')) {
      const history = await env.DB.prepare(`SELECT a.id, a.action, a.occurred_at AS occurredAt, u.display_name AS actor, a.after_json AS details FROM audit_logs a LEFT JOIN users u ON u.id=a.actor_user_id WHERE a.organization_id=? AND a.entity_type='compliance_record' AND a.entity_id=? ORDER BY a.occurred_at DESC, a.rowid DESC LIMIT 100`).bind(TECHFLEX_ORG_ID, url.searchParams.get('history')).all();
      return Response.json({ history: history.results }, { headers: { 'Cache-Control': 'no-store' } });
    }
    const offset = Math.max(0, Math.min(1000000, Number(url.searchParams.get('offset')) || 0));
    const rows = await env.DB.prepare(`${select} ORDER BY created_at DESC, id LIMIT 101 OFFSET ?`).bind(TECHFLEX_ORG_ID, offset).all<Record<string, unknown>>();
    const records = rows.results.slice(0, 100).map(record);
    if (url.searchParams.get('export') === 'csv') {
      const lines = [['ID','Title','Type','Status','Period start','Period end','Owner','Due date','Scope','Sample','Summary','Corrective action','Verification','Signed by','Signed at','Checklist JSON','Evidence IDs'], ...records.map(r => [r.id,r.title,r.kind,r.status,r.periodStart,r.periodEnd,r.owner,r.dueDate,r.scope,r.sample,r.summary,r.correctiveAction,r.verification,r.signedBy,r.signedAt,JSON.stringify(r.checks),r.evidenceIds.join('; ')])];
      await env.DB.prepare(`INSERT INTO audit_logs (id,organization_id,actor_user_id,action,entity_type,entity_id,after_json) VALUES (?,?,?,'compliance.export','compliance_record','register',?)`).bind(crypto.randomUUID(),TECHFLEX_ORG_ID,identity.userId,JSON.stringify({ count: records.length, offset })).run();
      return new Response('\uFEFF' + lines.map(row => row.map(csvCell).join(',')).join('\r\n'), {headers:{'Content-Type':'text/csv; charset=utf-8','Content-Disposition':'attachment; filename="TechCommand_Audit_Register_Page.csv"','Cache-Control':'no-store'}});
    }
    const documents = await env.DB.prepare(`SELECT d.id,d.title,d.category,d.attachment_id AS attachmentId FROM document_records d WHERE d.organization_id=? AND d.status='current' AND d.deleted_at IS NULL ORDER BY d.created_at DESC LIMIT 200`).bind(TECHFLEX_ORG_ID).all();
    return Response.json({ records, hasMore: rows.results.length > 100, documents: documents.results, viewer: identity.displayName }, {headers:{'Cache-Control':'no-store'}});
  } catch (error) { return apiError(error); }
}
export async function POST(request: Request) {
  try {
    const identity = await requirePortalRole(request, [...roles]);
    const raw = await request.text();
    if (raw.length > 150000) return Response.json({error:'Audit record is too large.'},{status:413});
    let parsed: unknown;
    try { parsed = JSON.parse(raw); } catch { return Response.json({error:'Invalid audit record.'},{status:400}); }
    const input = schema.parse(parsed);
    const invalid = closureError(input);
    if (invalid) return Response.json({error:invalid},{status:400});
    if (input.evidenceIds.length) {
      const docs = await env.DB.prepare(`SELECT id FROM document_records WHERE organization_id=? AND status='current' AND deleted_at IS NULL AND id IN (${input.evidenceIds.map(() => '?').join(',')})`).bind(TECHFLEX_ORG_ID,...input.evidenceIds).all();
      if (docs.results.length !== new Set(input.evidenceIds).size) return Response.json({error:'One or more evidence documents are unavailable.'},{status:400});
    }
    const existing = await env.DB.prepare(`${select} AND id=?`).bind(TECHFLEX_ORG_ID,input.id).first<Record<string,unknown>>();
    if (existing && existing.version !== input.version || !existing && input.version !== 0) return Response.json({error:'This record changed. Reload before editing.'},{status:409});
    if (existing?.status === 'complete') return Response.json({error:'Signed records are locked. Create a follow-up audit to preserve the signed record.'},{status:409});
    const now = new Date().toISOString();
    const data = {...input, version:input.version + 1, ...(input.status === 'complete' ? {signedBy:identity.displayName,signedAt:now}: {})};
    const after = JSON.stringify(data);
    const auditId = crypto.randomUUID();
    if (!existing) {
      await env.DB.batch([
        env.DB.prepare(`INSERT INTO admin_tasks (id,organization_id,category,title,instructions,priority,status,source,source_record_id,due_at,completed_at,completed_by) VALUES (?,?,?,?,?,?,?,'compliance',?,?,?,?)`).bind(input.id,TECHFLEX_ORG_ID,input.kind,input.title,after,input.priority,input.status,input.id,input.dueDate||null,input.status==='complete'?now:null,input.status==='complete'?identity.userId:null),
        env.DB.prepare(`INSERT INTO audit_logs (id,organization_id,actor_user_id,action,entity_type,entity_id,after_json) VALUES (?,?,?,'compliance.created','compliance_record',?,?)`).bind(auditId,TECHFLEX_ORG_ID,identity.userId,input.id,after),
      ]);
    } else {
      const result = await env.DB.batch([
        env.DB.prepare(`INSERT INTO audit_logs (id,organization_id,actor_user_id,action,entity_type,entity_id,before_json,after_json) SELECT ?,?,?,?,'compliance_record',?,instructions,? FROM admin_tasks WHERE organization_id=? AND source='compliance' AND id=? AND record_version=? AND status!='complete'`).bind(auditId,TECHFLEX_ORG_ID,identity.userId,input.status==='complete'?'compliance.signed':'compliance.updated',input.id,after,TECHFLEX_ORG_ID,input.id,input.version),
        env.DB.prepare(`UPDATE admin_tasks SET category=?,title=?,instructions=?,priority=?,status=?,due_at=?,completed_at=?,completed_by=?,record_version=record_version+1,updated_at=? WHERE organization_id=? AND source='compliance' AND id=? AND record_version=? AND status!='complete'`).bind(input.kind,input.title,after,input.priority,input.status,input.dueDate||null,input.status==='complete'?now:null,input.status==='complete'?identity.userId:null,now,TECHFLEX_ORG_ID,input.id,input.version),
      ]);
      if (!result[1].meta.changes) return Response.json({error:'This record changed. Reload before editing.'},{status:409});
    }
    return Response.json({record:data},{status:existing?200:201,headers:{'Cache-Control':'no-store'}});
  } catch (error) {
    if (error instanceof z.ZodError) return Response.json({error:'Review the required fields and dates.',details:error.flatten()},{status:400});
    return apiError(error);
  }
}
