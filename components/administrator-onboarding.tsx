"use client";

import { useEffect, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowRight, CheckCircle2, Circle, ClipboardCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Progress } from "@/components/ui/progress";
import { portalFetch, portalJson } from "@/lib/portal-fetch";

type Item = {
  key: string;
  order: number;
  title: string;
  detail: string;
  module: string;
  status: string;
};
async function api<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await portalFetch(url, {
    ...init,
    headers: { "Content-Type": "application/json", ...(init?.headers || {}) },
  });
  return portalJson<T>(response, "Setup progress could not be confirmed.");
}

type SetupProps = {
  userId: string;
  assigned: boolean;
  onNavigate: (module: string) => void;
};

export function AdministratorOnboarding(props: SetupProps) {
  if (!props.assigned) return null;
  return <AssignedAdministratorOnboarding key={props.userId} {...props} />;
}

function AssignedAdministratorOnboarding({ userId, onNavigate }: SetupProps) {
  const client = useQueryClient();
  const [open, setOpen] = useState(false);
  const opened = useRef(false);
  const query = useQuery({
    queryKey: ["administrator-onboarding", userId],
    queryFn: () => api<{ items: Item[]; scope: string; userId: string }>("/api/onboarding"),
  });
  const update = useMutation({
    mutationFn: ({ itemKey, status }: { itemKey: string; status: string }) =>
      api("/api/onboarding", {
        method: "PUT",
        body: JSON.stringify({ itemKey, status }),
      }),
    onSuccess: () =>
      client.invalidateQueries({ queryKey: ["administrator-onboarding", userId] }),
  });
  const items = query.data?.scope === "administrator" && query.data.userId === userId && !query.isError
    ? query.data.items : [];
  const complete = items.filter((item) => item.status === "complete").length;
  const next = items.find((item) => item.status !== "complete");
  const nextKey = next?.key;
  useEffect(() => {
    if (items.length && nextKey && !opened.current) {
      opened.current = true;
      setOpen(true);
    }
  }, [items.length, nextKey]);
  if (query.isError) return (
    <button type="button" onClick={() => { void query.refetch(); }}
      className="fixed bottom-5 right-5 z-30 rounded-full border bg-white px-4 py-3 text-sm font-semibold text-slate-700 shadow-lg">
      Setup unavailable · Retry
    </button>
  );
  if (!items.length) return null;
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="fixed bottom-5 right-5 z-30 flex items-center gap-2 rounded-full bg-[#102748] px-4 py-3 text-sm font-bold text-white shadow-xl"
      >
        <ClipboardCheck className="size-4" />
        {complete}/{items.length} setup
      </button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[88vh] overflow-y-auto sm:max-w-3xl">
          <DialogHeader>
            <DialogTitle>TechCommand administrator launch checklist</DialogTitle>
            <DialogDescription>
              Review the records already loaded by your team. Add only missing
              information, then mark each step complete after checking it.
              You can close this checklist and continue working at any time.
            </DialogDescription>
          </DialogHeader>
          <div className="mt-2 rounded-xl bg-[#102748] p-4 text-white">
            <div className="flex items-center justify-between text-sm">
              <span className="font-semibold">
                Setup steps reviewed
              </span>
              <span>{Math.round((complete / items.length) * 100)}%</span>
            </div>
            <Progress
              className="mt-3"
              value={(complete / items.length) * 100}
            />
            {next ? (
              <p className="mt-3 text-xs text-blue-100">Next: {next.title}</p>
            ) : (
              <p className="mt-3 text-xs text-emerald-200">
                Initial setup complete. Continue using the checklist for audits
                and new-account launches.
              </p>
            )}
          </div>
          {update.isError ? (
            <p role="alert" className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800">
              {update.error.message} Your last confirmed progress is shown. Refresh setup before trying again.
              <Button variant="outline" size="sm" className="ml-2" onClick={() => { update.reset(); void query.refetch(); }}>
                Refresh setup
              </Button>
            </p>
          ) : null}
          <div className="mt-3 space-y-2">
            {items.map((item) => (
              <article
                key={item.key}
                className={`rounded-xl border p-4 ${item.status === "complete" ? "bg-emerald-50/60" : "bg-white"}`}
              >
                <div className="flex items-start gap-3">
                  {item.status === "complete" ? (
                    <CheckCircle2 className="mt-0.5 size-5 shrink-0 text-emerald-600" />
                  ) : (
                    <Circle className="mt-0.5 size-5 shrink-0 text-slate-300" />
                  )}
                  <div className="min-w-0 flex-1">
                    <p className="font-bold">
                      {item.order}. {item.title}
                    </p>
                    <p className="mt-1 text-sm leading-6 text-slate-600">
                      {item.detail}
                    </p>
                    <div className="mt-3 flex flex-wrap gap-2">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => {
                          onNavigate(item.module);
                          setOpen(false);
                        }}
                      >
                        Open section <ArrowRight />
                      </Button>
                      <Button
                        size="sm"
                        variant={
                          item.status === "complete" ? "ghost" : "default"
                        }
                        disabled={update.isPending}
                        onClick={() =>
                          update.mutate({
                            itemKey: item.key,
                            status:
                              item.status === "complete" ? "open" : "complete",
                          })
                        }
                      >
                        {item.status === "complete"
                          ? "Mark incomplete"
                          : "Mark complete"}
                      </Button>
                    </div>
                  </div>
                </div>
              </article>
            ))}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
