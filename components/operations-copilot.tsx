"use client";

import { useMemo, useState } from "react";
import { Bot, CheckCircle2, LoaderCircle, Send, ShieldCheck, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { Textarea } from "@/components/ui/textarea";

type AiResponse = {
  answer: string;
  confidence: "record_grounded" | "approved_guidance" | "general_guidance" | "needs_review";
  sources: string[];
  cautions: string[];
  suggestedActions: { label: string; targetModule: string }[];
};

const prompts: Record<string, string[]> = {
  "work-orders": ["What needs attention on the current work orders?", "Which jobs are missing information before dispatch?"],
  schedule: ["Summarize scheduling conflicts and the best next move.", "What should the coordinator prioritize today?"],
  dispatch: ["Which assignments need dispatch attention?", "Summarize urgent route risks."],
  assets: ["Help me identify this biomedical asset and its service history.", "Which biomedical PM or safety details need attention?"],
  support: ["Help diagnose this unit without inventing a manufacturer procedure.", "What evidence should the technician capture?"],
  finance: ["Which jobs have pricing or margin risks?", "Draft the next billing follow-up."],
  technician: ["Walk me through my next job step by step.", "Check what evidence I still need before completion."],
};

export function OperationsCopilot({
  module,
  onNavigate,
  spotlight = false,
}: {
  module: string;
  onNavigate?: (module: string) => void;
  spotlight?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [question, setQuestion] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<AiResponse | null>(null);
  const quickPrompts = useMemo(() => prompts[module] || [
    "What is the most important operational issue right now?",
    "Explain what I should do next using the portal records.",
  ], [module]);

  async function ask(value = question) {
    const cleaned = value.trim();
    if (cleaned.length < 3) return;
    setQuestion(cleaned);
    setLoading(true);
    try {
      const response = await fetch("/api/ai/copilot", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ module, question: cleaned }),
      });
      const data = (await response.json()) as { response?: AiResponse; error?: string };
      if (!response.ok || !data.response) throw new Error(data.error || "The copilot could not answer.");
      setResult(data.response);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "The copilot could not answer.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button className={`fixed bottom-5 right-5 z-40 h-12 rounded-full bg-gradient-to-r from-[#125fd4] to-[#0f95a9] px-5 shadow-xl shadow-blue-950/25 ${spotlight ? "ring-4 ring-cyan-300 ring-offset-4 ring-offset-white animate-pulse" : ""}`}>
          <Sparkles className="size-4" /> AI Copilot
        </Button>
      </SheetTrigger>
      <SheetContent className="w-full overflow-y-auto p-0 sm:max-w-xl">
        <SheetHeader className="border-b bg-[#0d2746] px-6 py-6 text-left text-white">
          <div className="flex items-center gap-3"><span className="grid size-11 place-items-center rounded-xl bg-cyan-300/15 text-cyan-200"><Bot /></span><div><SheetTitle className="text-white">TechCommand Copilot</SheetTitle><SheetDescription className="mt-1 text-blue-100">Operational help using your role, current screen, approved guidance, and authorized portal records.</SheetDescription></div></div>
        </SheetHeader>
        <div className="space-y-5 p-6">
          <div className="flex flex-wrap gap-2">
            {quickPrompts.map((prompt) => <button key={prompt} type="button" onClick={() => void ask(prompt)} className="rounded-full border bg-slate-50 px-3 py-2 text-left text-xs font-semibold text-slate-700 hover:border-blue-300 hover:bg-blue-50">{prompt}</button>)}
          </div>
          <Textarea value={question} onChange={(event) => setQuestion(event.target.value)} className="min-h-28" placeholder="Ask about a work order, exact unit, technician workflow, schedule, evidence, pricing, customer update, or next action…" />
          <Button className="w-full" disabled={loading || question.trim().length < 3} onClick={() => void ask()}>{loading ? <LoaderCircle className="animate-spin" /> : <Send />}{loading ? "Reviewing authorized records…" : "Ask TechCommand"}</Button>
          {result ? <article className="space-y-4 rounded-xl border bg-white p-5 shadow-sm">
            <div className="flex items-center gap-2 text-sm font-bold text-emerald-700"><CheckCircle2 className="size-4" />{result.confidence.replaceAll("_", " ")}</div>
            <p className="whitespace-pre-wrap text-sm leading-7 text-slate-800">{result.answer}</p>
            {result.cautions.length ? <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs leading-5 text-amber-950"><b>Check before acting:</b> {result.cautions.join(" ")}</div> : null}
            {result.sources.length ? <div><p className="text-xs font-bold uppercase tracking-wide text-slate-500">Sources and context</p><div className="mt-2 flex flex-wrap gap-2">{result.sources.map((source) => <span key={source} className="rounded-full border bg-slate-50 px-3 py-1 text-xs">{source}</span>)}</div></div> : null}
            {onNavigate && result.suggestedActions.length ? <div className="flex flex-wrap gap-2 border-t pt-4">{result.suggestedActions.map((action) => <Button key={`${action.targetModule}-${action.label}`} size="sm" variant="outline" onClick={() => { onNavigate(action.targetModule); setOpen(false); }}>{action.label}</Button>)}</div> : null}
          </article> : null}
          <div className="flex gap-2 rounded-lg border border-blue-100 bg-blue-50 p-3 text-xs leading-5 text-blue-950"><ShieldCheck className="mt-0.5 size-4 shrink-0" />The copilot can analyze and recommend. It cannot silently change assignments, prices, records, or completion status.</div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
