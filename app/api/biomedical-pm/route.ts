import {env} from "cloudflare:workers";
import {z} from "zod";
import {apiError,requirePortalRole,PortalHttpError,TECHFLEX_ORG_ID} from "@/lib/portal-auth";
import {pmSource,pmStorageKey} from "@/lib/biomedical-pm-directory";
const readRoles=["owner_administrator","operations_administrator","biomedical_lead","dispatcher","finance"] as const;
const writeRoles=["owner_administrator","operations_administrator","biomedical_lead"] as const;
const headers={"Cache-Control":"private, no-store"};
const field=z.string().max(12000);
const schema=z.object({reportKey:z.string().max(160).optional(),unit:z.string().min(1).max(120),expectedVersion:z.number().int().min(0),fields:z.object({fieldNotes:field.optional().default(""),risk:z.enum(["high","medium","low","unassessed"]),riskReason:z.string().max(2000),riskReview:field,location:field,technician:field,serviceDate:field,compliance:field,history:field,oemSchedule:field,measurements:field,testEquipment:field,actions:field,outcome:field,followUp:field,nextDue:field}).strict()}).strict();
type Row={reportKey:string;unit:string;version:number;fieldsJson:string;updatedAt:string;updatedBy:string};
export async function GET(request:Request){try{
 const identity=await requirePortalRole(request,[...readRoles]);const report=await pmSource(new URL(request.url).searchParams.get('reportKey')||undefined);
 if(new URL(request.url).searchParams.get("download")==="source")return new Response(report.worksheet,{headers:{...headers,"Content-Type":"text/markdown; charset=utf-8","Content-Disposition":"attachment; filename=TechFlex_Biomedical_PM_Draft.md","X-Content-Type-Options":"nosniff"}});
 const rows=await env.DB.prepare("SELECT report_key AS reportKey,unit_number AS unit,record_version AS version,fields_json AS fieldsJson,updated_at AS updatedAt,updated_by AS updatedBy FROM biomedical_pm_draft_entries WHERE organization_id=? AND report_key IN (SELECT value FROM json_each(?))").bind(TECHFLEX_ORG_ID,JSON.stringify([...new Set(report.assets.map(a=>(a as {storageKey?:string}).storageKey||pmStorageKey(report.key)))])).all<Row>();
 const {worksheet,...data}=report;void worksheet;
 return Response.json({...data,entries:rows.results.filter(row=>report.assets.some(a=>a.unit===row.unit&&((a as {storageKey?:string}).storageKey||pmStorageKey(report.key))===row.reportKey)).map(({fieldsJson,...row})=>({...row,fields:JSON.parse(fieldsJson)})),canEdit:(writeRoles as readonly string[]).includes(identity.role)},{headers});
}catch(error){const response=apiError(error);response.headers.set("Cache-Control","private, no-store");return response;}}
export async function POST(request:Request){try{
 const identity=await requirePortalRole(request,[...writeRoles]);
 const input=schema.safeParse(await request.json().catch(()=>null));if(!input.success)throw new PortalHttpError(400,"Keep notes within the allowed length. Optional fields can be left blank.");
 const report=await pmSource(input.data.reportKey);const {unit,expectedVersion,fields}=input.data;
 const asset=report.assets.find(a=>a.unit===unit);
 if(!asset)throw new PortalHttpError(404,"Facility unit not found in this draft.");
 const storageKey=(asset as {storageKey?:string}).storageKey||pmStorageKey(report.key);
 const id=`${storageKey}:${unit}`,version=expectedVersion+1,stamp=new Date().toISOString(),body=JSON.stringify(fields),author=identity.displayName||identity.userId,historyId=crypto.randomUUID();
 // History insertion is the optimistic lock: only the next revision may be inserted.
 // Duplicate revisions fail the batch atomically, preserving every accepted edit.
 const results=await env.DB.batch([
 env.DB.prepare(`INSERT INTO biomedical_pm_draft_history(id,organization_id,report_key,unit_number,fields_json,record_version,updated_by,created_at)
 SELECT ?,?,?,?,?,?,?,? WHERE COALESCE((SELECT record_version FROM biomedical_pm_draft_entries WHERE organization_id=? AND report_key=? AND unit_number=?),0)=?`).bind(historyId,TECHFLEX_ORG_ID,storageKey,unit,body,version,author,stamp,TECHFLEX_ORG_ID,storageKey,unit,expectedVersion),
 env.DB.prepare(`INSERT INTO biomedical_pm_draft_entries(id,organization_id,report_key,unit_number,fields_json,record_version,updated_by,updated_at)
 SELECT ?,?,?,?,?,?,?,? WHERE EXISTS(SELECT 1 FROM biomedical_pm_draft_history WHERE organization_id=? AND report_key=? AND unit_number=? AND record_version=? AND id=?)
 ON CONFLICT(id) DO UPDATE SET fields_json=excluded.fields_json,record_version=excluded.record_version,updated_by=excluded.updated_by,updated_at=excluded.updated_at WHERE biomedical_pm_draft_entries.record_version=?`).bind(id,TECHFLEX_ORG_ID,storageKey,unit,body,version,author,stamp,TECHFLEX_ORG_ID,storageKey,unit,version,historyId,expectedVersion)
 ]);
 if(!results[0].meta.changes)throw new PortalHttpError(409,"This unit has a newer saved revision. Reload the report before saving; copy any unsaved notes first.");
 return Response.json({entry:{unit,version,fields,updatedAt:stamp,updatedBy:author},status:"Draft"},{headers});
}catch(error){const response=apiError(error);response.headers.set("Cache-Control","private, no-store");return response;}}
