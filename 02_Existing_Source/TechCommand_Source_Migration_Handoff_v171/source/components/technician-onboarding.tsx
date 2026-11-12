"use client";

import { portalFetch } from "@/lib/portal-fetch";

import { useState } from "react";
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

type Item = {
  key: string;
  order: number;
  title: string;
  detail: string;
  module: string;
  status: string;
};

async function api<T>(init?: RequestInit): Promise<T> {
  const response = await portalFetch("/api/onboarding", {
    ...init,
    headers: { "Content-Type": "application/json", ...(init?.headers || {}) },
  });
  const data = (await response.json()) as T & { error?: string };
  if (!response.ok) throw new Error(data.error || "Setup progress could not be updated.");
  return data;
}

export function TechnicianOnboarding({
  onNavigate,
}: {
  onNavigate: (tab: string) => void;
}) {
  const client = useQueryClient();
  const [open, setOpen] = useState(false);
  const query = useQuery({
    queryKey: ["technician-onboarding"],
    queryFn: () => api<{ items: Item[]; scope: string }>(),
  });
  const update = useMutation({
    mutationFn: ({ itemKey, status }: { itemKey: string; status: string }) =>
      api({ method: "PUT", body: JSON.stringify({ itemKey, status }) }),
    onSuccess: () => client.invalidateQueries({ queryKey: ["technician-onboarding"] }),
  });
  const items = query.data?.scope === "technician" ? query.data.items : [];
  const complete = items.filter((item) => item.status === "complete").length;
  const next = items.find((item) => item.status !== "complete");

  if (!items.length) return null;
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="fixed bottom-5 left-5 z-30 flex items-center gap-2 rounded-full bg-[#102748] px-4 py-3 text-sm font-bold text-white shadow-xl"
      >
        <ClipboardCheck className="size-4" />
        {complete}/{items.length} setup
      </button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[88vh] overflow-y-auto sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>Your TechCommand field setup</DialogTitle>
            <DialogDescription>
              Your assignments are available now. Use this checklist when convenient; optional account and calendar setup does not block starting your assigned work.
            </DialogDescription>
          </DialogHeader>
          <div className="rounded-xl bg-[#102748] p-4 text-white">
            <div className="flex items-center justify-between text-sm font-semibold">
              <span>Field portal ready</span>
              <span>{Math.round((complete / items.length) * 100)}%</span>
            </div>
            <Progress className="mt-3" value={(complete / items.length) * 100} />
            <p className="mt-3 text-xs text-blue-100">
              {next ? `Next: ${next.title}` : "Setup complete. This checklist remains available for reference."}
            </p>
          </div>
          <div className="space-y-2">
            {items.map((item) => (
              <article key={item.key} className={`rounded-xl border p-4 ${item.status === "complete" ? "bg-emerald-50/60" : "bg-white"}`}>
                <div className="flex items-start gap-3">
                  {item.status === "complete" ? <CheckCircle2 className="mt-0.5 size-5 shrink-0 text-emerald-600" /> : <Circle className="mt-0.5 size-5 shrink-0 text-slate-300" />}
                  <div className="min-w-0 flex-1">
                    <p className="font-bold">{item.order}. {item.title}</p>
                    <p className="mt-1 text-sm leading-6 text-slate-600">{item.detail}</p>
                    <div className="mt-3 flex flex-wrap gap-2">
                      <Button size="sm" variant="outline" onClick={() => { onNavigate(item.module); setOpen(false); }}>
                        Open section <ArrowRight />
                      </Button>
                      <Button
                        size="sm"
                        variant={item.status === "complete" ? "ghost" : "default"}
                        disabled={update.isPending}
                        onClick={() => update.mutate({ itemKey: item.key, status: item.status === "complete" ? "open" : "complete" })}
                      >
                        {item.status === "complete" ? "Mark incomplete" : "Mark complete"}
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
