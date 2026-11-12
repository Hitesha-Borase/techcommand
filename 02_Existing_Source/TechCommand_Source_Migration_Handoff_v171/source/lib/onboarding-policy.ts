import type { PortalIdentity } from "@/lib/portal-auth";

// Company-specific assignment, separate from role permissions. This is the
// existing approved assistant account; assigning setup does not grant access.
const administratorSetupAssignees: Readonly<Record<string, string>> = {
  techflex: "kristin.dunn@techflexmobility.com",
};

export function isAdministratorOnboardingAssigned(
  organizationId: string,
  identity: Pick<PortalIdentity, "email" | "role">,
) {
  return (
    (identity.role === "owner_administrator" || identity.role === "operations_administrator") &&
    administratorSetupAssignees[organizationId] === identity.email.trim().toLowerCase()
  );
}
