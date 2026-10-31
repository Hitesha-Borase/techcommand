import {apiError,requirePortalRole} from '@/lib/portal-auth';
import {pmDirectory} from '@/lib/biomedical-pm-directory';
export async function GET(request:Request){try{
 const user=await requirePortalRole(request,['owner_administrator','operations_administrator','biomedical_lead','dispatcher','finance']);
 return Response.json({...await pmDirectory(),canAssignPrepared:['owner_administrator','operations_administrator'].includes(user.role),canEdit:['owner_administrator','operations_administrator','biomedical_lead'].includes(user.role)},{headers:{'Cache-Control':'private, no-store'}});
}catch(e){const r=apiError(e);r.headers.set('Cache-Control','private, no-store');return r;}}
