import { env } from "cloudflare:workers";
import { parseDisciplines } from "@/lib/service-disciplines";
import { TECHFLEX_ORG_ID, apiError, getPortalIdentity } from "@/lib/portal-auth";
import { isAdministratorOnboardingAssigned } from "@/lib/onboarding-policy";

export async function GET(request: Request) {
  try {
    const identity = await getPortalIdentity(request);
    const technician = identity.technicianId ? await env.DB.prepare("SELECT service_disciplines_json AS disciplines FROM technicians WHERE id=? AND organization_id=? AND status='active'").bind(identity.technicianId,TECHFLEX_ORG_ID).first<{disciplines:string|null}>() : null;
    return Response.json({
      serviceDisciplines: parseDisciplines(technician?.disciplines),
      identity,
      administratorOnboarding: isAdministratorOnboardingAssigned(TECHFLEX_ORG_ID, identity),
    }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    return apiError(error);
  }
}
