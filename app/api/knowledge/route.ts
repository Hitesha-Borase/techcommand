import { env } from "cloudflare:workers";
import { z } from "zod";
import {
  TECHFLEX_ORG_ID,
  apiError,
  requirePortalRole,
} from "@/lib/portal-auth";

type Runtime = { OPENAI_API_KEY?: string; OPENAI_MODEL?: string };

function outputText(result: Record<string, unknown>) {
  if (typeof result.output_text === "string") return result.output_text;
  const output = Array.isArray(result.output) ? result.output : [];
  for (const item of output) {
    const content = Array.isArray((item as { content?: unknown[] }).content)
      ? (item as { content: unknown[] }).content
      : [];
    for (const part of content) {
      const text = (part as { text?: unknown }).text;
      if (typeof text === "string") return text;
    }
  }
  throw new Error("The AI response did not contain an answer.");
}

const coreKnowledge = [
  {
    id: "core-margin",
    category: "pricing",
    title: "40% gross-margin authorization rule",
    content:
      "Every account must retain at least a 40% gross margin. Required revenue is direct costs divided by 0.60, compared against the account contract calculation; use the higher result. Underpriced work stays in pricing review, creates no technician payout, and requires a counteroffer.",
  },
  {
    id: "core-rates",
    category: "pricing",
    title: "TechFlex base job rates",
    content:
      "Diagnostic $100; single-part repair $120; multi-part repair $135 plus $12.50 for each additional part; frame repair $175; hourly service $125 per hour; consumer installation $175; manufacturer and retailer mileage $0.77 round trip; consumer mileage first 10 miles free then $0.67; stairs $100; additional technician $65.",
  },
  {
    id: "core-wgd",
    category: "delivery",
    title: "White-glove delivery pricing",
    content:
      "Basic WGD is $1.00 per pound through 225 pounds and $1.25 above 225. Complex WGD is $1.25 per pound through 225 and $1.50 above 225. Bed delivery has a $180 base minimum and normally requires two technicians. Freight over 500 pounds requires three technicians.",
  },
  {
    id: "core-biomed",
    category: "biomedical",
    title: "Biomedical PM rate tiers",
    content:
      "Annual PM list pricing: Tier A $18, Tier B $45, Tier C $65, Tier D $95 per asset, with a $295 facility minimum. Record the asset tag, manufacturer, model, serial, department, risk class, PM interval, measured results, disposition, label, and next due date.",
  },
  {
    id: "core-report",
    category: "service",
    title: "Strong service report standard",
    content:
      "Record the complaint in the customer’s words, equipment identity, condition on arrival, reproduced symptom, diagnostic sequence, measurements and fault codes, work performed, parts, post-service loaded functional test, safety result, final condition, recommendations, photos, and customer acknowledgement. Never claim a test or repair that was not performed.",
  },
  {
    id: "core-safety",
    category: "safety",
    title: "Safety-critical equipment rule",
    content:
      "Do not bypass an interlock or safety device. Follow manufacturer service procedures and facility policy. Quarantine and escalate any patient-care device that fails a safety-critical test or cannot be returned to a known safe operating condition.",
  },
];

function terms(value: string) {
  return new Set(
    value
      .toLowerCase()
      .replace(/[^a-z0-9$%.]+/g, " ")
      .split(" ")
      .filter((word) => word.length > 2),
  );
}

export async function GET(request: Request) {
  try {
    const identity = await requirePortalRole(request, [
      "owner_administrator",
      "operations_administrator",
      "dispatcher",
      "biomedical_lead",
      "finance",
      "technician",
      "auditor",
      "client_administrator",
      "client_location_user",
    ]);
    const isClient = ["client_administrator", "client_location_user"].includes(
      identity.role,
    );
    const rows = await env.DB.prepare(
      "SELECT id, category, title, content, keywords, source_type AS sourceType, source_id AS sourceId, updated_at AS updatedAt FROM knowledge_entries WHERE organization_id=? AND status='active' AND (?=0 OR audience='client') ORDER BY updated_at DESC LIMIT 500",
    )
      .bind(TECHFLEX_ORG_ID, isClient ? 1 : 0)
      .all<Record<string, unknown>>();
    const history = await env.DB.prepare(
      "SELECT id, question, answer, sources_json AS sourcesJson, created_at AS createdAt FROM assistant_questions WHERE organization_id=? AND asked_by=? ORDER BY created_at DESC LIMIT 20",
    )
      .bind(TECHFLEX_ORG_ID, identity.userId)
      .all();
    const core = isClient
      ? coreKnowledge.filter((entry) =>
          ["service", "safety"].includes(entry.category),
        )
      : coreKnowledge;
    return Response.json({
      entries: [...core, ...rows.results],
      history: history.results,
      technicalAccess: !isClient && identity.role !== "finance",
      engine: Boolean((env as unknown as Runtime).OPENAI_API_KEY)
        ? "OpenAI reasoning with TechFlex governed knowledge"
        : "TechFlex governed knowledge",
      aiReady: Boolean((env as unknown as Runtime).OPENAI_API_KEY),
    });
  } catch (error) {
    return apiError(error);
  }
}

export async function POST(request: Request) {
  try {
    const identity = await requirePortalRole(request, [
      "owner_administrator",
      "operations_administrator",
      "dispatcher",
      "biomedical_lead",
      "finance",
      "technician",
      "auditor",
      "client_administrator",
      "client_location_user",
    ]);
    const body = (await request.json()) as { action?: string };
    if (body.action === "add") {
      if (
        ![
          "owner_administrator",
          "operations_administrator",
          "biomedical_lead",
        ].includes(identity.role)
      )
        return Response.json(
          {
            error:
              "Only an administrative knowledge owner may publish guidance.",
          },
          { status: 403 },
        );
      const input = z
        .object({
          action: z.literal("add"),
          category: z.string().trim().min(2).max(80),
          title: z.string().trim().min(3).max(200),
          content: z.string().trim().min(10).max(20000),
          keywords: z.string().trim().max(1000).optional().nullable(),
        })
        .parse(body);
      const id = crypto.randomUUID();
      await env.DB.prepare(
        "INSERT INTO knowledge_entries (id, organization_id, category, title, content, keywords, source_type, created_by) VALUES (?, ?, ?, ?, ?, ?, 'internal', ?)",
      )
        .bind(
          id,
          TECHFLEX_ORG_ID,
          input.category,
          input.title,
          input.content,
          input.keywords || null,
          identity.userId,
        )
        .run();
      return Response.json({ entry: { id, ...input } }, { status: 201 });
    }
    const input = z
      .object({
        action: z.literal("ask").default("ask"),
        question: z.string().trim().min(4).max(5000),
      })
      .parse(body);
    const isClient = ["client_administrator", "client_location_user"].includes(
      identity.role,
    );
    const stored = await env.DB.prepare(
      "SELECT id, category, title, content, keywords FROM knowledge_entries WHERE organization_id=? AND status='active' AND (?=0 OR audience='client') ORDER BY updated_at DESC LIMIT 500",
    )
      .bind(TECHFLEX_ORG_ID, isClient ? 1 : 0)
      .all<Record<string, string>>();
    const allowedCore = isClient
      ? coreKnowledge.filter((entry) =>
          ["service", "safety"].includes(entry.category),
        )
      : coreKnowledge;
    const all = [
      ...allowedCore,
      ...stored.results.map((row: Record<string, string>) => ({
        id: row.id,
        category: row.category,
        title: row.title,
        content: row.content,
      })),
    ];
    const queryTerms = terms(input.question);
    const ranked = all
      .map((entry) => {
        const hay = terms(`${entry.title} ${entry.category} ${entry.content}`);
        let score = 0;
        queryTerms.forEach((term) => {
          if (hay.has(term)) score += 1;
        });
        return { ...entry, score };
      })
      .filter((entry) => entry.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, 4);
    const runtime = env as unknown as Runtime;
    let answer: string;
    let confidence: "grounded" | "limited" | "general_guidance" | "needs_review";
    if (runtime.OPENAI_API_KEY) {
      const approvedContext = ranked.length
        ? ranked.map((entry) => `[${entry.title}] ${entry.content}`).join("\n\n")
        : "No matching approved TechFlex entry was found.";
      const response = await fetch("https://api.openai.com/v1/responses", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${runtime.OPENAI_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: runtime.OPENAI_MODEL || "gpt-4.1-mini",
          input: [
            {
              role: "system",
              content: [{ type: "input_text", text: "You are Ask TechFlex, a technical and operational assistant for mobility equipment, biomedical service, field operations, dispatch, documentation, pricing, and partner workflows. Answer the question directly. Treat supplied approved TechFlex guidance as controlling internal policy. You may add useful general knowledge, but clearly label it as general guidance. Never invent a model-specific part number, fault code, measurement, contract term, or repair procedure. For safety-critical or exact unit-specific work, identify the manufacturer/model/serial facts or approved manual still needed. Do not claim an action or test occurred when it did not." }],
            },
            {
              role: "user",
              content: [{ type: "input_text", text: `QUESTION:\n${input.question}\n\nMATCHING APPROVED TECHFLEX GUIDANCE:\n${approvedContext}` }],
            },
          ],
        }),
      });
      const result = (await response.json()) as Record<string, unknown>;
      if (!response.ok) {
        const message = (result.error as { message?: string } | undefined)?.message;
        throw new Error(message || "OpenAI could not answer this question.");
      }
      answer = outputText(result);
      confidence = ranked.length >= 2 ? "grounded" : ranked.length ? "limited" : "general_guidance";
    } else {
      answer = ranked.length
        ? `Based on the current TechFlex knowledge base:\n\n${ranked.map((entry) => `${entry.title}: ${entry.content}`).join("\n\n")}\n\nUse the linked work-order, account, asset, and document records as the controlling facts. If a manufacturer procedure or contract conflicts with general guidance, the current approved manufacturer procedure or signed contract controls.`
        : "I could not find an approved TechFlex source that answers this yet. Add the verified answer to the knowledge base before anyone treats it as policy or technical instruction.";
      confidence = ranked.length >= 2 ? "grounded" : ranked.length ? "limited" : "needs_review";
    }
    const id = crypto.randomUUID();
    await env.DB.prepare(
      "INSERT INTO assistant_questions (id, organization_id, asked_by, role, question, answer, sources_json) VALUES (?, ?, ?, ?, ?, ?, ?)",
    )
      .bind(
        id,
        TECHFLEX_ORG_ID,
        identity.userId,
        identity.role,
        input.question,
        answer,
        JSON.stringify(
          ranked.map((entry) => ({
            id: entry.id,
            title: entry.title,
            category: entry.category,
          })),
        ),
      )
      .run();
    return Response.json({
      response: {
        id,
        answer,
        sources: ranked.map((entry) => ({
          id: entry.id,
          title: entry.title,
          category: entry.category,
        })),
        confidence,
      },
    });
  } catch (error) {
    if (error instanceof z.ZodError)
      return Response.json(
        { error: "Enter a complete question or knowledge entry." },
        { status: 400 },
      );
    return apiError(error);
  }
}
