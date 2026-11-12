import { portalFetch, portalJson } from "@/lib/portal-fetch";

export type PortalClientIdentity = {
  userId: string; displayName: string; email: string; role: string;
  technicianId: string | null; serviceDisciplines: string[];
  administratorOnboarding: boolean;
};

// Every writer of this shared cache must return the same complete shape. In
// particular, the offline banner must not replace the dashboard's disciplines.
export async function fetchPortalIdentity(): Promise<PortalClientIdentity> {
  const data = await portalJson<{
    identity?: Omit<PortalClientIdentity, "serviceDisciplines" | "administratorOnboarding">;
    serviceDisciplines?: unknown; administratorOnboarding?: boolean;
  }>(await portalFetch("/api/me"), "Portal access could not be verified.");
  if (!data.identity?.userId || !data.identity.role || !data.identity.displayName)
    throw new Error("Your portal profile could not be loaded. Sign in again or ask an administrator to review your profile.");
  return {
    ...data.identity,
    serviceDisciplines: Array.isArray(data.serviceDisciplines)
      ? data.serviceDisciplines.filter((value): value is string => typeof value === "string") : [],
    administratorOnboarding: data.administratorOnboarding === true,
  };
}

export const portalIdentityQuery = { queryKey: ["portal-identity"] as const, queryFn: fetchPortalIdentity };
