"use client";

import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { AlertTriangle, CheckCircle2, CloudOff, CloudUpload, LoaderCircle } from "lucide-react";
import { flushOfflineQueue, getOfflineQueueStatus, getOfflineAttentionItems, resolveOfflineItem } from "@/lib/offline-client";
import { captureOperationalEvent, countBucket } from "@/lib/analytics-client";
import { portalIdentityQuery } from "@/lib/portal-identity-client";

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTitle, DialogDescription } from "@/components/ui/dialog";

export function AppResilience() {
  const identity = useQuery(portalIdentityQuery);
  const actorUserId = identity.data?.userId || "";
  const [sessionAvailable, setSessionAvailable] = useState(true);
  const [state, setState] = useState({ online: true, queued: 0, attention: 0, syncing: false });
  const [reviewing, setReviewing] = useState(false);
  const [items, setItems] = useState<Awaited<ReturnType<typeof getOfflineAttentionItems>>>([]);
  const [busy, setBusy] = useState(false);
  async function review() {
    if (!actorUserId || !sessionAvailable) return;
    try { setItems(await getOfflineAttentionItems(actorUserId)); setReviewing(true); }
    catch { toast.error("Saved items could not be read on this device."); }
  }
  async function resolve(id: string, action: "retry" | "confirmed_saved") {
    if (!actorUserId || !sessionAvailable) return;
    setBusy(true);
    try { await resolveOfflineItem(actorUserId, id, action); setItems(await getOfflineAttentionItems(actorUserId)); }
    catch { toast.error("Could not update this saved item. It remains on this device."); }
    finally { setBusy(false); }
  }
  useEffect(() => {
    const unavailable = () => setSessionAvailable(false);
    const restored = (event: Event) => {
      const userId = (event as CustomEvent<{ userId?: string }>).detail?.userId;
      if (userId && userId === actorUserId) setSessionAvailable(true);
    };
    window.addEventListener("techcommand:session-required", unavailable);
    window.addEventListener("techcommand:session-restored", restored);
    return () => {
      window.removeEventListener("techcommand:session-required", unavailable);
      window.removeEventListener("techcommand:session-restored", restored);
    };
  }, [actorUserId]);
  useEffect(() => {
    if (!actorUserId || !sessionAvailable) {
      setState((current) => ({ ...current, queued: 0, attention: 0, syncing: false }));
      return;
    }
    if ("serviceWorker" in navigator)
      navigator.serviceWorker.register("/sw.js").catch(() => undefined);

    let wasOffline = !navigator.onLine;
    const readQueue = async () => {
      const queue = await getOfflineQueueStatus(actorUserId);
      setState((current) => ({ ...current, online: navigator.onLine, ...queue }));
    };
    let storageNoticeShown = false;
    const storageUnavailable = () => {
      setState((current) => ({ ...current, online: navigator.onLine, syncing: false }));
      if (!storageNoticeShown) {
        storageNoticeShown = true;
        toast.warning("Offline storage is unavailable in this browser. Keep an internet connection when saving work. Existing drafts have not been deleted.");
      }
    };
    const refresh = async () => { try { await readQueue(); } catch { storageUnavailable(); } };
    const syncQueue = async () => {
      setState((current) => ({ ...current, online: navigator.onLine, syncing: navigator.onLine && current.queued > 0 }));
      const result = await flushOfflineQueue(actorUserId);
      if (wasOffline) {
        toast.success("Connection restored. Saved field work is syncing.");
        captureOperationalEvent("connection_restored", { online: true });
      }
      wasOffline = false;
      if (result.processed > 0 && result.remaining === 0)
        toast.success("Offline work synchronized");
      if (result.processed > 0)
        captureOperationalEvent("offline_sync_completed", {
          processed_count_bucket: countBucket(result.processed),
          queued_count_bucket: countBucket(result.remaining),
        });
      await readQueue();
      setState((current) => ({ ...current, syncing: false }));
    };
    let syncInProgress = false;
    const sync = async () => {
      if (syncInProgress) return;
      syncInProgress = true;
      try { await syncQueue(); } catch { storageUnavailable(); }
      finally { syncInProgress = false; }
    };
    const offline = () => {
      wasOffline = true;
      setState((current) => ({ ...current, online: false, syncing: false }));
      toast.warning("Offline mode: work will remain on this device until connection returns.");
      captureOperationalEvent("connection_lost", { online: false });
    };
    const serviceWorkerMessage = (event: MessageEvent) => {
      if (event.data?.type === "TECHCOMMAND_SYNC") void sync();
    };
    window.addEventListener("online", sync);
    window.addEventListener("offline", offline);
    window.addEventListener("techcommand:queue-change", refresh);
    navigator.serviceWorker?.addEventListener("message", serviceWorkerMessage);
    void refresh();
    void sync();
    const interval = window.setInterval(() => void sync(), 30_000);
    return () => {
      window.removeEventListener("online", sync);
      window.removeEventListener("offline", offline);
      window.removeEventListener("techcommand:queue-change", refresh);
      navigator.serviceWorker?.removeEventListener("message", serviceWorkerMessage);
      window.clearInterval(interval);
    };
  }, [actorUserId, sessionAvailable]);
  if (!reviewing && state.online && !state.queued && !state.attention && !state.syncing) return null;
  return <><div className={`fixed bottom-4 right-4 z-[100] flex max-w-sm items-center gap-3 rounded-xl border px-4 py-3 text-sm shadow-xl ${state.attention ? "border-red-200 bg-red-50 text-red-900" : state.online ? "border-blue-200 bg-white text-slate-800" : "border-amber-200 bg-amber-50 text-amber-900"}`}>
    {state.attention ? <AlertTriangle className="size-5 shrink-0 text-red-700" /> : state.syncing ? <LoaderCircle className="size-5 shrink-0 animate-spin text-blue-700" /> : state.online ? <CloudUpload className="size-5 shrink-0 text-blue-700" /> : <CloudOff className="size-5 shrink-0 text-amber-700" />}
    <div><p className="font-bold">{state.attention ? `${state.attention} saved item${state.attention === 1 ? "" : "s"} need attention` : state.syncing ? "Synchronizing saved work" : state.online ? `${state.queued} item${state.queued === 1 ? "" : "s"} queued` : "Offline—work is device-saved"}</p><p className="mt-0.5 text-xs opacity-75">{state.attention ? "The item was preserved instead of silently discarded." : state.online ? "Safe retry is automatic." : `${state.queued} item${state.queued === 1 ? "" : "s"} waiting for internet.`}</p></div>
    {state.attention ? <Button variant="outline" onClick={review}>Review</Button> : null}
    {!state.attention && state.online && !state.syncing ? <CheckCircle2 className="size-4 shrink-0 text-emerald-600" /> : null}
  </div>
  <Dialog open={reviewing} onOpenChange={setReviewing}><DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-xl">
    <DialogTitle>Review saved work</DialogTitle>
    <DialogDescription>Check the work order or file list first. Retry only if the item is missing. If it is already saved, clear its local queue entry below.</DialogDescription>
    {items.length === 0 ? <p className="text-sm">No saved items need attention.</p> : items.map(item => <div key={item.id} className="space-y-3 rounded-lg border p-4">
      <p className="break-words font-semibold">{item.label}</p>
      <p className="text-sm text-slate-500">{new Date(item.createdAt).toLocaleString()}</p>
      <p className="text-sm">{item.lastError}</p>
      <div className="flex flex-wrap gap-2"><Button disabled={busy || !state.online} onClick={() => resolve(item.id, "retry")}>Missing — retry save</Button><Button variant="outline" disabled={busy} onClick={() => resolve(item.id, "confirmed_saved")}>Already saved — clear entry</Button></div>
    </div>)}
  </DialogContent></Dialog></>;

}
