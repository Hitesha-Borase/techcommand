import type { QueryClient } from "@tanstack/react-query";

const PORTAL_IDENTITY_KEY = "portal-identity";

function isPortalIdentityQuery(queryKey: readonly unknown[]) {
  return queryKey[0] === PORTAL_IDENTITY_KEY;
}

/**
 * Blank observer-held data before removing cached records. QueryClient.clear()
 * alone removes cache entries but leaves mounted observers holding their last
 * result until they render again.
 */
export function clearIdentityBoundClientState(
  client: QueryClient,
  options: { preservePortalIdentity?: boolean } = {},
) {
  void client.cancelQueries();
  for (const query of client.getQueryCache().getAll()) {
    if (options.preservePortalIdentity && isPortalIdentityQuery(query.queryKey)) continue;
    query.reset();
  }
  client.removeQueries({
    type: "inactive",
    predicate: (query) =>
      !(options.preservePortalIdentity && isPortalIdentityQuery(query.queryKey)),
  });
  client.getMutationCache().clear();
}

export function isPortalSignOutHref(href: string, origin: string) {
  try {
    const url = new URL(href, origin);
    return url.origin === origin && url.pathname === "/signout-with-chatgpt";
  } catch {
    return false;
  }
}
