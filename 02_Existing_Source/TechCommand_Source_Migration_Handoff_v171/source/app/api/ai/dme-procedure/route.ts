import {z} from "zod";
import {apiError,requirePortalRole} from "@/lib/portal-auth";
import {spinlifeJob,spinlifeRoles,privateHeaders} from "@/lib/spinlife-store";
import {cachedManufacturerResearch} from "@/lib/cached-manufacturer-research";
export async function POST(request:Request){try{
 const identity=await requirePortalRole(request,[...spinlifeRoles]);
 const {workOrderId}=z.object({workOrderId:z.string().min(1).max(160)}).strict().parse(await request.json());
 const job=await spinlifeJob(identity,workOrderId);
 if(!job.data.serviceType)return Response.json({status:"missing",error:"Choose the job type when known. Your draft remains saved."},{headers:privateHeaders});
 return Response.json(await cachedManufacturerResearch(job.data.manufacturer,job.data.model,job.data.serviceType),{headers:privateHeaders});
}catch(error){if(error instanceof z.ZodError)return Response.json({error:"Choose a saved work order."},{status:400,headers:privateHeaders});const response=apiError(error);response.headers.set("Cache-Control","private, no-store");return response;}}
