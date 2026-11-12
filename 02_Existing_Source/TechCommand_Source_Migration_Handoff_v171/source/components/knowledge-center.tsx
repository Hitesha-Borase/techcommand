"use client";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  BookOpen,
  BrainCircuit,
  CheckCircle2,
  MessageSquarePlus,
  ShieldAlert,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {TechnicalKnowledge} from "@/components/technical-knowledge";
type Entry = { id: string; category: string; title: string; content: string };
type Response = {
  answer: string;
  sources: { id: string; title: string; category: string }[];
  confidence: string;
};
async function api<T>(url: string, init?: RequestInit): Promise<T> {
  const r = await fetch(url, {
    ...init,
    headers: { "Content-Type": "application/json", ...(init?.headers || {}) },
  });
  const d = (await r.json()) as T & { error?: string };
  if (!r.ok) throw new Error(d.error || "Knowledge request failed.");
  return d;
}
export function KnowledgeCenter() {
  const client = useQueryClient();
  const [question, setQuestion] = useState("");
  const [result, setResult] = useState<Response | null>(null);
  const [entry, setEntry] = useState({
    category: "operations",
    title: "",
    content: "",
    keywords: "",
  });
  const knowledge = useQuery({
    queryKey: ["knowledge"],
    queryFn: () =>
      api<{
        entries: Entry[];
        history: {
          id: string;
          question: string;
          answer: string;
          createdAt: string;
        }[];
        engine: string;
        aiReady: boolean;
        technicalAccess: boolean;
      }>("/api/knowledge"),
  });
  const ask = useMutation({
    mutationFn: () =>
      api<{ response: Response }>("/api/knowledge", {
        method: "POST",
        body: JSON.stringify({ action: "ask", question }),
      }),
    onSuccess: (d) => {
      setResult(d.response);
      client.invalidateQueries({ queryKey: ["knowledge"] });
    },
    onError: (e) => toast.error(e.message),
  });
  const add = useMutation({
    mutationFn: () =>
      api("/api/knowledge", {
        method: "POST",
        body: JSON.stringify({ action: "add", ...entry }),
      }),
    onSuccess: async () => {
      await client.invalidateQueries({ queryKey: ["knowledge"] });
      setEntry({ ...entry, title: "", content: "", keywords: "" });
      toast.success("Approved knowledge added");
    },
    onError: (e) => toast.error(e.message),
  });
  return (
    <div className="space-y-5">
      <section className="grid gap-4 lg:grid-cols-[1.2fr_.8fr]">
        <article className="rounded-xl border bg-[#102748] p-5 text-white">
          <div className="flex items-start gap-3">
            <BrainCircuit className="mt-0.5 size-6 text-blue-300" />
            <div>
              <h2 className="font-bold">Ask TechFlex</h2>
              <p className="mt-1 text-sm leading-6 text-blue-100">
                Ask about pricing, intake, documentation, biomedical PM, service
                reporting, dispatch, or workflow. Answers are grounded in
                approved TechFlex records and show their sources.
              </p>
            </div>
          </div>
          <Textarea
            className="mt-5 min-h-28 border-white/20 bg-white/10 text-white placeholder:text-blue-200"
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            placeholder="Example: What must be documented on a biomedical PM visit?"
          />
          <Button
            className="mt-3 bg-white text-[#102748] hover:bg-blue-50"
            disabled={ask.isPending || question.trim().length < 4}
            onClick={() => ask.mutate()}
          >
            <MessageSquarePlus />
            {ask.isPending ? "Checking approved knowledge…" : "Ask the system"}
          </Button>
        </article>
        <article className="rounded-xl border bg-white p-5">
          <ShieldAlert className="size-6 text-amber-600" />
          <h2 className="mt-3 font-bold">Governed memory</h2>
          <p className="mt-2 text-sm leading-6 text-slate-600">
            The portal remembers approved records, visit history, documents,
            questions, and answers. It does not silently rewrite policy or
            invent manufacturer instructions. New guidance becomes authoritative
            only after an administrator adds or approves it.
          </p>
          <div className="mt-4 flex items-center gap-2 text-sm font-semibold text-emerald-700">
            <CheckCircle2 className="size-4" />
            Source-backed answers active
          </div>
          <p className="mt-2 text-xs text-slate-500">{knowledge.data?.aiReady ? "OpenAI reasoning is connected. Approved TechFlex guidance remains controlling, and general model knowledge is labeled separately." : "External OpenAI reasoning is waiting for the portal-specific API credential."}</p>
        </article>
      </section>
      {result ? (
        <article
          className={`rounded-xl border p-5 ${result.confidence === "needs_review" ? "border-amber-200 bg-amber-50" : "border-emerald-200 bg-emerald-50"}`}
        >
          <div className="flex items-center justify-between">
            <h2 className="font-bold">Answer</h2>
            <span className="rounded-full bg-white px-3 py-1 text-xs font-bold capitalize">
              {result.confidence.replaceAll("_", " ")}
            </span>
          </div>
          <p className="mt-4 whitespace-pre-wrap text-sm leading-7 text-slate-800">
            {result.answer}
          </p>
          {result.sources.length ? (
            <div className="mt-4 border-t pt-3">
              <p className="text-xs font-bold uppercase tracking-wide text-slate-500">
                Sources used
              </p>
              <div className="mt-2 flex flex-wrap gap-2">
                {result.sources.map((s) => (
                  <span
                    key={s.id}
                    className="rounded-full border bg-white px-3 py-1 text-xs"
                  >
                    {s.title}
                  </span>
                ))}
              </div>
            </div>
          ) : null}
        </article>
      ) : null}
      <Tabs defaultValue="library">
        <TabsList>
          <TabsTrigger value="library">
            <BookOpen />
            Knowledge library
          </TabsTrigger>
          <TabsTrigger value="teach">
            <BrainCircuit />
            Teach the system
          </TabsTrigger>
          {knowledge.data?.technicalAccess ? <TabsTrigger value="technical"><ShieldAlert />Technical procedures</TabsTrigger> : null}
        </TabsList>
        <TabsContent value="library" className="mt-4">
          <div className="grid gap-3 md:grid-cols-2">
            {knowledge.data?.entries.map((e) => (
              <article key={e.id} className="rounded-xl border bg-white p-4">
                <span className="text-xs font-bold uppercase tracking-wide text-blue-600">
                  {e.category}
                </span>
                <h3 className="mt-2 font-bold">{e.title}</h3>
                <p className="mt-2 line-clamp-4 text-sm leading-6 text-slate-600">
                  {e.content}
                </p>
              </article>
            ))}
          </div>
        </TabsContent>
        <TabsContent value="teach" className="mt-4">
          <article className="rounded-xl border bg-white p-5">
            <h2 className="font-bold">Add verified TechFlex guidance</h2>
            <p className="mt-1 text-sm text-slate-500">
              Use only signed contract terms, approved policies, confirmed
              workflows, or verified technical sources.
            </p>
            <div className="mt-5 space-y-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <label className="space-y-1.5 text-sm font-semibold">
                  Category
                  <Input
                    value={entry.category}
                    onChange={(e) =>
                      setEntry({ ...entry, category: e.target.value })
                    }
                  />
                </label>
                <label className="space-y-1.5 text-sm font-semibold">
                  Title
                  <Input
                    value={entry.title}
                    onChange={(e) =>
                      setEntry({ ...entry, title: e.target.value })
                    }
                  />
                </label>
              </div>
              <label className="block space-y-1.5 text-sm font-semibold">
                Approved guidance
                <Textarea
                  className="min-h-40"
                  value={entry.content}
                  onChange={(e) =>
                    setEntry({ ...entry, content: e.target.value })
                  }
                />
              </label>
              <label className="block space-y-1.5 text-sm font-semibold">
                Search keywords
                <Input
                  value={entry.keywords}
                  onChange={(e) =>
                    setEntry({ ...entry, keywords: e.target.value })
                  }
                />
              </label>
              <Button
                disabled={
                  add.isPending ||
                  entry.title.length < 3 ||
                  entry.content.length < 10
                }
                onClick={() => add.mutate()}
              >
                {add.isPending ? "Adding…" : "Add to knowledge base"}
              </Button>
            </div>
          </article>
        </TabsContent>
        {knowledge.data?.technicalAccess ? <TabsContent value="technical" className="mt-4"><TechnicalKnowledge /></TabsContent> : null}
      </Tabs>
    </div>
  );
}
