import { extractWorkOrder } from "@/app/api/bid-intelligence/route";
import { apiError, requirePortalRole } from "@/lib/portal-auth";
const headers = {"Cache-Control":"private, no-store"};
export async function POST(request:Request) {
 try {
  await requirePortalRole(request,["owner_administrator","operations_administrator","dispatcher","biomedical_lead","technician"]);
  if(!request.headers.get("content-type")?.includes("multipart/form-data"))return Response.json({error:"Drop a work order or paste its text. You can still enter details manually."},{status:400,headers});
  const response=await extractWorkOrder(request);
  const body=await response.json() as {fields?:Record<string,unknown>;error?:string};
  if(body.fields) for(const key of ["authorization","onsiteHours","technicianCount","sourceAssignedTechnician","sourceDispatchAddress"])delete body.fields[key];
  return Response.json(body,{status:response.status,headers});
 }catch(error){const response=apiError(error);response.headers.set("Cache-Control","private, no-store");return response;}
}
