"use client";

import { useEffect, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { fetchPortalIdentity } from "@/lib/portal-identity-client";
import { clearIdentityBoundClientState, isPortalSignOutHref } from "@/lib/identity-cache";
import { clearIdentityBoundDeviceState } from "@/lib/device-state";
import { Dialog, DialogContent, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

export function SessionRecovery() {
  const [needed, setNeeded] = useState(false);
  const [checking, setChecking] = useState(false);
  const [message, setMessage] = useState("");
  const client = useQueryClient();
  const previousUserId = useRef<string | null>(null);
  useEffect(() => {
    const recover = () => {
      const current = client.getQueryData<{ userId?: string }>(["portal-identity"]);
      previousUserId.current = current?.userId || null;
      clearIdentityBoundClientState(client, { preservePortalIdentity: true });
      setNeeded(true);
    };
    const clearForNavigation = () => clearIdentityBoundClientState(client);
    const clearForSignOut = (event: MouseEvent) => {
      const link = event.target instanceof Element ? event.target.closest("a[href]") : null;
      const href = link?.getAttribute("href");
      if (href && isPortalSignOutHref(href, window.location.origin)) {
        event.preventDefault();
        const departingUserId = client.getQueryData<{ userId?: string }>(["portal-identity"])?.userId;
        clearForNavigation();
        void (departingUserId ? clearIdentityBoundDeviceState(departingUserId) : Promise.resolve())
          .finally(() => window.location.assign(href));
      }
    };
    const restoreFromHistory = (event: PageTransitionEvent) => {
      if (event.persisted) window.location.reload();
    };
    window.addEventListener("techcommand:session-required", recover);
    window.addEventListener("pagehide", clearForNavigation);
    window.addEventListener("pageshow", restoreFromHistory);
    document.addEventListener("click", clearForSignOut, true);
    return () => {
      window.removeEventListener("techcommand:session-required", recover);
      window.removeEventListener("pagehide", clearForNavigation);
      window.removeEventListener("pageshow", restoreFromHistory);
      document.removeEventListener("click", clearForSignOut, true);
    };
  }, [client]);
  if (!needed) return null;
  return <Dialog open={needed} onOpenChange={setNeeded}><DialogContent className="z-[300] max-w-xl text-sm">
    <DialogTitle>Restore your portal session</DialogTitle>
    <DialogDescription>Keep this tab open to preserve your form. Sign in with your TechCommand username or email and password, then return here and check access. If you need a login or a password reset, contact your TechFlex administrator.</DialogDescription>
    <div className="flex flex-wrap items-center gap-3">
      <a className="font-semibold text-blue-700 underline" href="/login" target="_blank" rel="noopener noreferrer">Sign in to TechCommand</a>
      <Button disabled={checking} onClick={async () => {
        setChecking(true); setMessage("");
        try {
          const nextIdentity = await fetchPortalIdentity();
          if (previousUserId.current && previousUserId.current !== nextIdentity.userId) {
            await clearIdentityBoundDeviceState(previousUserId.current);
            clearIdentityBoundClientState(client);
            window.location.reload();
            return;
          }
          client.setQueryData(["portal-identity"], nextIdentity);
          previousUserId.current = nextIdentity.userId;
          setNeeded(false);
          window.dispatchEvent(new CustomEvent("techcommand:session-restored", { detail: { userId: nextIdentity.userId } }));
          void client.invalidateQueries({ predicate: (query) => query.queryKey[0] !== "portal-identity" });
        } catch (error) { setMessage(error instanceof Error ? error.message : "Access could not be verified."); }
        finally { setChecking(false); }
      }}>{checking ? "Checking…" : "Check access"}</Button>
    </div>
    {message ? <p className="mt-2 text-red-700">{message}</p> : null}
    <p className="mt-2 text-slate-600">After access is restored, check the roster or account list before submitting again. Saves are never automatically repeated.</p>
  </DialogContent></Dialog>;
}
