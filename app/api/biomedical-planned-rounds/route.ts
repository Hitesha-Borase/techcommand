import { z } from "zod";
import { apiError, requirePortalRole, PortalHttpError } from "@/lib/portal-auth";
import { biomedicalWriteRoles } from "@/lib/biomedical-accounts";
import { preparedBiomedicalDispatch, readPreparedBiomedicalDispatch, savePreparedBiomedicalDispatch } from "@/lib/prepared-biomedical-dispatch";

const headers = {"Cache-Control":"private, no-store"};
export async function GET(request:Request) {
  try {
    await requirePortalRole(request,[...biomedicalWriteRoles]);
    return Response.json(await readPreparedBiomedicalDispatch(),{headers});
  } catch(error) { const response=apiError(error); response.headers.set("Cache-Control",headers["Cache-Control"]); return response; }
}
export async function POST(request:Request) {
  try {
    const identity=await requirePortalRole(request,[...biomedicalWriteRoles]);
    const input=z.object({key:z.literal(preparedBiomedicalDispatch.key)}).strict().safeParse(await request.json().catch(()=>null));
    if(!input.success)throw new PortalHttpError(400,"Use the prepared visit shown on Biomedical/PM Accounts. Assignment details and billing cannot be overridden by this action.");
    return Response.json(await savePreparedBiomedicalDispatch(identity),{headers});
  } catch(error) { const response=apiError(error); response.headers.set("Cache-Control",headers["Cache-Control"]); return response; }
}
