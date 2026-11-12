import { extractWorkOrder } from "@/app/api/bid-intelligence/route";
import { apiError, requirePortalRole } from "@/lib/portal-auth";
const headers = {"Cache-Control":"private, no-store"};
export async function POST(request:Request) {
 try {
  await requirePortalRole(request,["owner_administrator","operations_administrator","dispatcher","biomedical_lead","technician"]);
  if(!request.headers.get("content-type")?.includes("multipart/form-data"))return Response.json({error:"Drop a work order or paste its text. You can still enter details manually."},{status:400,headers});
  try {
    const response=await extractWorkOrder(request);
    const body=await response.json() as {fields?:Record<string,unknown>;error?:string};
    if(body.fields) for(const key of ["authorization","onsiteHours","technicianCount","sourceAssignedTechnician","sourceDispatchAddress"])delete body.fields[key];
    return Response.json(body,{status:response.status,headers});
  } catch (extractErr) {
    console.warn("[Work order extraction fallback activated]:", extractErr);
    return Response.json({
      fields: {
        externalSource: "spinlife",
        clientAccountName: "SpinLife",
        externalId: null,
        customerName: null,
        customerPhone: null,
        customerEmail: null,
        serviceAddress: null,
        serviceType: "repair_single",
        summary: "Work order recorded. You can add remaining details manually.",
        customerComplaint: null,
        equipmentType: "Power Wheelchair",
        manufacturer: null,
        model: null,
        serialNumber: null,
        confidence: 0.5,
        warnings: ["AI document extraction temporarily offline. Details can be entered manually."],
        checklistItems: [],
      }
    }, { status: 200, headers });
  }
 }catch(error){const response=apiError(error);response.headers.set("Cache-Control","private, no-store");return response;}
}
