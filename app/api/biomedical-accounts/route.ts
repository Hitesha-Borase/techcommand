import { z } from "zod";
import { apiError, requirePortalRole, PortalHttpError } from "@/lib/portal-auth";
import { biomedicalReadRoles, biomedicalWriteRoles, biomedicalSummaries, biomedicalSource, savedBiomedicalAccount, sourceDocumentBytes, importBiomedicalAccount } from "@/lib/biomedical-accounts";
const headers={"Cache-Control":"private, no-store"};
export async function GET(request:Request) {
  try {
    const identity=await requirePortalRole(request,[...biomedicalReadRoles]);
    const url=new URL(request.url),key=url.searchParams.get("source"),documentRole=url.searchParams.get("document");
    if(key && documentRole) {
      const {document,bytes}=await sourceDocumentBytes(biomedicalSource(key),documentRole);
      return new Response(bytes,{headers:{...headers,"Content-Type":"application/pdf","Content-Disposition":`inline; filename="${document.fileName}"`,"X-Content-Type-Options":"nosniff"}});
    }
    const accounts=await Promise.all(biomedicalSummaries().map(async source=>({source,saved:await savedBiomedicalAccount(source.key)})));
    return Response.json({accounts,canImport:(biomedicalWriteRoles as readonly string[]).includes(identity.role)},{headers});
  } catch(error) {const response=apiError(error);response.headers.set("Cache-Control","private, no-store");return response;}
}
export async function POST(request:Request) {
  try {
    const identity=await requirePortalRole(request,[...biomedicalWriteRoles]);
    const parsed=z.object({source:z.string(),revision:z.string()}).strict().safeParse(await request.json().catch(()=>null));
    if(!parsed.success) throw new PortalHttpError(400,"Choose a prepared account from this page. Its signed terms cannot be overridden during import.");
    const input=parsed.data;
    return Response.json(await importBiomedicalAccount(identity,input.source,input.revision),{headers});
  } catch(error) {const response=apiError(error);response.headers.set("Cache-Control","private, no-store");return response;}
}
