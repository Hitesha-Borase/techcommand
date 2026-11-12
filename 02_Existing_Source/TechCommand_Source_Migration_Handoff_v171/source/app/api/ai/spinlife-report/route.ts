import {z} from "zod";
import {apiError,requirePortalRole,PortalHttpError} from "@/lib/portal-auth";
import {spinlifeJob,spinlifeRoles,privateHeaders} from "@/lib/spinlife-store";
import {simpleChecks} from "@/lib/spinlife-simple";
import {spinlifeWritingReport} from "@/lib/spinlife-writing";
import {prepareWritingReview} from "@/app/api/ai/completion-review/route";
export async function POST(request:Request){try{
 const identity=await requirePortalRole(request,[...spinlifeRoles]);
 const input=z.object({workOrderId:z.string().min(1).max(160),expectedVersion:z.number().int().positive()}).strict().parse(await request.json());
 const job=await spinlifeJob(identity,input.workOrderId);if(job.version!==input.expectedVersion)throw new PortalHttpError(409,"The saved job changed. Save your current answers, then refresh the report draft.");
 const missing=simpleChecks(job.data,job.visit).filter(check=>!check.complete&&!check.notApplicable).map(check=>check.label);
 const response=await prepareWritingReview({serviceType:job.data.serviceType},spinlifeWritingReport(job),missing);response.headers.set("Cache-Control",privateHeaders["Cache-Control"]);return response;
}catch(error){if(error instanceof z.ZodError)return Response.json({error:"Save your answers before drafting the report."},{status:400,headers:privateHeaders});const response=apiError(error);response.headers.set("Cache-Control","private, no-store");return response;}}
