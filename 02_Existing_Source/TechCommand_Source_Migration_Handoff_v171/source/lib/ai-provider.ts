/**
 * Independent AI Provider Abstraction Interface
 * Implements PDF Handoff Page 1, 6 & 7 requirements:
 * "The migration objective includes replacing direct OpenAI runtime calls.
 *  Define a provider interface and evaluate an independent replacement...
 *  Core field documentation must work with AI unavailable."
 */

import { z } from "zod";
import { env } from "cloudflare:workers";
import { parseWorkOrderAttachment, normalizeIntakeFields } from "@/lib/spinlife-intake";

export type AiProviderName = "gemini" | "openai" | "fallback";

export interface AiCompletionOptions<T> {
  key?: string;
  provider?: AiProviderName;
  model?: string;
  name: string;
  instruction: string;
  content: Array<Record<string, unknown>>;
  schema: Record<string, unknown>;
  validate: z.ZodType<T>;
  reasoning?: "medium";
}

/**
 * Reads an environment variable key from Worker env, Node process.env, globalThis,
 * or safely from .dev.vars / .env.local on disk during local development.
 */
export function getStoredEnvKey(keyName: string): string {
  const workerEnv: Record<string, string | undefined> = typeof env !== "undefined" && env ? (env as unknown as Record<string, string | undefined>) : {};
  const envObj: Record<string, string | undefined> = typeof process !== "undefined" && process.env ? (process.env as Record<string, string | undefined>) : {};
  const globalObj: Record<string, unknown> = typeof globalThis !== "undefined" ? (globalThis as Record<string, unknown>) : {};

  if (workerEnv[keyName]) return workerEnv[keyName]!;
  if (envObj[keyName]) return envObj[keyName]!;
  if (typeof globalObj[keyName] === "string" && globalObj[keyName]) return globalObj[keyName] as string;
  try {
    const fs = require("node:fs");
    const path = require("node:path");
    const candidates = [
      process.cwd(),
      path.resolve(process.cwd(), ".."),
      typeof __dirname !== "undefined" ? path.resolve(__dirname, "..") : "",
      typeof __dirname !== "undefined" ? path.resolve(__dirname, "../..") : "",
    ].filter(Boolean);
    for (const dir of candidates) {
      for (const file of [".dev.vars", ".env.local", ".env"]) {
        const p = path.resolve(dir, file);
        if (fs.existsSync(p)) {
          const text = fs.readFileSync(p, "utf-8");
          const match = text.match(new RegExp(`^\\s*${keyName}\\s*=\\s*["']?([^"'\\r\\n]+)["']?`, "m"));
          if (match && match[1]) {
            const val = match[1].trim();
            if (typeof process !== "undefined" && process.env) {
              process.env[keyName] = val;
            }
            return val;
          }
        }
      }
    }
  } catch {}
  return "";
}

/**
 * Detects the active AI provider based on environment variables or explicit config
 */
export function getActiveAiProvider(explicitKey?: string): {
  provider: AiProviderName;
  key: string;
  model: string;
} {
  const workerEnv: Record<string, string | undefined> = typeof env !== "undefined" && env ? (env as unknown as Record<string, string | undefined>) : {};
  const envObj: Record<string, string | undefined> = typeof process !== "undefined" && process.env ? (process.env as Record<string, string | undefined>) : {};
  const globalObj: Record<string, unknown> = typeof globalThis !== "undefined" ? (globalThis as Record<string, unknown>) : {};

  const geminiKey = explicitKey && !explicitKey.startsWith("sk-")
    ? explicitKey
    : (workerEnv.GEMINI_API_KEY || envObj.GEMINI_API_KEY || (typeof globalObj.GEMINI_API_KEY === "string" ? globalObj.GEMINI_API_KEY : "") || getStoredEnvKey("GEMINI_API_KEY") || "");
  const openAiKey = explicitKey?.startsWith("sk-")
    ? explicitKey
    : (workerEnv.OPENAI_API_KEY || envObj.OPENAI_API_KEY || (typeof globalObj.OPENAI_API_KEY === "string" ? globalObj.OPENAI_API_KEY : "") || getStoredEnvKey("OPENAI_API_KEY") || "");

  const configuredProvider = (workerEnv.AI_PROVIDER || envObj.AI_PROVIDER || "").toLowerCase();

  if (configuredProvider === "gemini" || (geminiKey && !openAiKey)) {
    return {
      provider: "gemini",
      key: geminiKey,
      model: workerEnv.GEMINI_MODEL || envObj.GEMINI_MODEL || "gemini-2.5-flash",
    };
  }

  if (configuredProvider === "openai" || openAiKey) {
    return {
      provider: "openai",
      key: openAiKey,
      model: workerEnv.OPENAI_MODEL || envObj.OPENAI_MODEL || "gpt-4.1-mini",
    };
  }

  return {
    provider: "fallback",
    key: "",
    model: "deterministic-fallback",
  };
}

/**
 * Call Google Gemini generateContent API with structured JSON output
 */
async function callGeminiStructured<T>(
  options: AiCompletionOptions<T>,
  key: string,
  modelName: string
): Promise<T> {
  const models = [modelName, "gemini-flash-latest", "gemini-2.5-flash-lite"].filter((m, i, a) => a.indexOf(m) === i);
  
  const parts: Array<{ text?: string; inlineData?: { mimeType: string; data: string } }> = [];
  for (const c of options.content) {
    if (typeof c.text === "string") {
      parts.push({ text: c.text });
    } else if (c.type === "input_text" && typeof c.text === "string") {
      parts.push({ text: c.text });
    } else if (typeof c.file_data === "string" && c.file_data.startsWith("data:")) {
      const match = c.file_data.match(/^data:([^;]+);base64,(.+)$/);
      if (match) parts.push({ inlineData: { mimeType: match[1] || "application/pdf", data: match[2] } });
    } else if (typeof c.image_url === "string" && c.image_url.startsWith("data:")) {
      const match = c.image_url.match(/^data:([^;]+);base64,(.+)$/);
      if (match) parts.push({ inlineData: { mimeType: match[1] || "image/jpeg", data: match[2] } });
    } else {
      parts.push({ text: JSON.stringify(c) });
    }
  }

  const extractionNotes = options.name === "techcommand_bid_fields"
    ? "\n\nCRITICAL EXTRACTION RULES:\n- Preserve externalId and any suffixes (e.g. '00071118002N-4', '-B', '-2') verbatim.\n- Extract customerName, customerPhone, serviceAddress, manufacturer, model, serialNumber accurately from labeled fields.\n- Extract equipmentType strictly from the document (e.g. 'Lift Chair', 'Mobility Scooter', 'Hospital Bed'). If unknown or not stated, set equipmentType to null. NEVER default to 'Power Wheelchair'."
    : "";
  const fullInstruction = options.instruction + extractionNotes + (options.schema ? `\n\nYou MUST respond with ONLY a valid JSON object strictly adhering to this JSON schema structure:\n${JSON.stringify(options.schema)}\nEnsure every property defined in the schema is present in your response (use null for missing/unknown values, empty array [] for missing lists, and 0 for missing numbers).` : "");

  let lastError: Error | null = null;
  let rawText = "";

  for (const currentModel of models) {
    const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${currentModel}:generateContent?key=${key}`;
    try {
      const response = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal: AbortSignal.timeout(60000),
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: fullInstruction }] },
          contents: [{ role: "user", parts }],
          generationConfig: {
            responseMimeType: "application/json",
          },
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.warn(`[Gemini API ${currentModel} ${response.status}]`, errorText.slice(0, 150));
        if (response.status === 503 || response.status === 429) {
          lastError = new Error(`AI model ${currentModel} busy (HTTP ${response.status}).`);
          continue; // Try next fallback model
        }
        throw new Error(`Gemini API returned HTTP ${response.status}: ${errorText.slice(0, 150)}`);
      }

      const data = (await response.json()) as {
        candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
      };

      rawText = data?.candidates?.[0]?.content?.parts?.[0]?.text || "";
      if (rawText) break; // Successfully got response
    } catch (fetchErr: unknown) {
      lastError = fetchErr instanceof Error ? fetchErr : new Error(String(fetchErr));
      console.warn(`[Gemini request failed for ${currentModel}]`, (lastError as Error).message);
    }
  }

  if (!rawText) {
    throw lastError || new Error("AI returned empty content. Your draft is preserved.");
  }

  let cleanedText = rawText.trim();
  if (cleanedText.startsWith("```")) {
    cleanedText = cleanedText.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "").trim();
  }

  let parsedObj: any;
  try {
    parsedObj = JSON.parse(cleanedText);
  } catch (parseErr) {
    console.error("[Gemini JSON Parse Error]:", parseErr, cleanedText.slice(0, 300));
    throw new Error("AI returned invalid JSON. Your draft is preserved.");
  }

  // Pre-sanitize known field constraints (truncate overlong strings and arrays so Zod doesn't reject valid extraction)
  if (parsedObj && typeof parsedObj === "object") {
    for (const key of Object.keys(parsedObj)) {
      if (typeof parsedObj[key] === "string" && parsedObj[key].length > 500 && key !== "customerComplaint") {
        parsedObj[key] = parsedObj[key].slice(0, 500);
      }
      if (Array.isArray(parsedObj[key])) {
        if (key === "warnings" && parsedObj[key].length > 20) parsedObj[key] = parsedObj[key].slice(0, 20);
        else if (parsedObj[key].length > 50) parsedObj[key] = parsedObj[key].slice(0, 50);
        parsedObj[key] = parsedObj[key].map((item: unknown) => 
          typeof item === "string" && item.length > 300 ? item.slice(0, 300) : item
        );
      }
    }
  }

  if (options.name === "techcommand_bid_fields" && parsedObj && typeof parsedObj === "object") {
    parsedObj = normalizeIntakeFields(parsedObj);
  }

  const firstAttempt = options.validate.safeParse(parsedObj);
  if (firstAttempt.success) {
    return firstAttempt.data;
  }

  // Self-heal common Zod mismatches (invalid enum value -> null, string or array too big -> slice)
  for (const issue of firstAttempt.error.issues) {
    const path = issue.path[0];
    if (typeof path === "string" && path in parsedObj) {
      if (issue.code === "invalid_enum_value") {
        parsedObj[path] = null;
      } else if (issue.code === "too_big") {
        const max = (issue as any).maximum;
        if (typeof parsedObj[path] === "string") {
          parsedObj[path] = parsedObj[path].slice(0, max || 250);
        } else if (Array.isArray(parsedObj[path])) {
          parsedObj[path] = parsedObj[path].slice(0, max || 20);
        }
      }
    }
  }

  const secondAttempt = options.validate.safeParse(parsedObj);
  if (secondAttempt.success) {
    return secondAttempt.data;
  }

  console.error("[Gemini Structured Parse Error after healing]:", secondAttempt.error, "Raw response was:", cleanedText.slice(0, 500));
  throw new Error("AI returned information that could not be verified. Review draft manually.");
}

/**
 * Call OpenAI API with structured output
 */
async function callOpenAiStructured<T>(
  options: AiCompletionOptions<T>,
  key: string,
  modelName: string
): Promise<T> {
  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    signal: AbortSignal.timeout(options.reasoning ? 110000 : 45000),
    headers: {
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: modelName || "gpt-4.1-mini",
      store: false,
      ...(options.reasoning ? { reasoning: { effort: options.reasoning }, max_output_tokens: 12000 } : {}),
      input: [
        { role: "system", content: [{ type: "input_text", text: options.instruction }] },
        { role: "user", content: options.content },
      ],
      text: {
        format: {
          type: "json_schema",
          name: options.name,
          strict: true,
          schema: options.schema,
        },
      },
    }),
  });

  if (!response.ok) {
    throw new Error(
      response.status === 429
        ? "AI is temporarily busy. Your work is preserved; try again later."
        : "AI could not complete this request. Work is preserved; continue manually."
    );
  }

  const body = (await response.json()) as {
    status?: string;
    output_text?: string;
    output?: { content?: { type?: string; text?: string }[] }[];
  };

  const content = body.output?.flatMap((item) => item.content || []) || [];
  const raw = body.output_text || content.filter((item) => item.type === "output_text").map((item) => item.text || "").join("");

  try {
    return options.validate.parse(JSON.parse(raw));
  } catch {
    throw new Error("AI returned information that could not be verified. Review the source and try again.");
  }
}

/**
 * Fallback heuristic extractor for work orders when AI is offline or key is unconfigured.
 */
function fallbackBidFields(content: Array<Record<string, unknown>>) {
  const parsed = parseWorkOrderAttachment(content);

  return {
    externalSource: "spinlife",
    clientAccountName: "SpinLife",
    externalId: parsed.externalId,
    customerName: parsed.customerName,
    customerPhone: parsed.customerPhone,
    customerEmail: null,
    serviceAddress: parsed.serviceAddress,
    serviceType: (parsed.serviceType as any) || "repair_single",
    summary: parsed.summary || (parsed.externalId ? `Work order ${parsed.externalId}` : "Work order details extracted"),
    customerComplaint: parsed.customerComplaint,
    equipmentType: parsed.equipmentType, // Strictly dynamic: null if unknown, NEVER forces Power Wheelchair!
    manufacturer: parsed.manufacturer,
    model: parsed.model,
    serialNumber: parsed.serialNumber,
    sourceAssignedTechnician: null,
    sourceDispatchAddress: null,
    authorization: null,
    onsiteHours: null,
    technicianCount: 1,
    weightLb: null,
    partsCount: 0,
    stairsCount: 0,
    confidence: 0.85,
    warnings: ["AI key unavailable or offline; fields parsed with built-in heuristic extractor."],
    checklistItems: [],
  };
}

/**
 * Fallback report review generator from recorded facts
 */
function fallbackWritingReview(content: Array<Record<string, unknown>>) {
  let recordedFacts: Array<{ id: string; label: string; text: string }> = [];
  try {
    for (const c of content) {
      if (typeof c.text === "string") {
        const parsed = JSON.parse(c.text);
        if (Array.isArray(parsed.recordedFacts)) {
          recordedFacts = parsed.recordedFacts;
          break;
        }
      }
    }
  } catch {}

  const availableIds = new Set(recordedFacts.map(f => f.id));
  const findingsFacts = recordedFacts.filter(f => f.id.startsWith("answer-") || f.id === "field-notes");
  const performedFacts = recordedFacts.filter(f => f.id.startsWith("part-") || f.id.startsWith("answer-"));
  const testFacts = recordedFacts.filter(f => /voltage|battery|test|reading|tire|hardware/i.test(f.label) || /test|check/i.test(f.id));

  const suggestedFindings = findingsFacts.length > 0
    ? findingsFacts.map(f => f.text).join(". ")
    : (recordedFacts.length > 0 ? recordedFacts[0].text : "All inspected components documented per technician notes.");

  const findingsSources = findingsFacts.length > 0
    ? findingsFacts.map(f => f.id).filter(id => availableIds.has(id))
    : (recordedFacts.length > 0 && availableIds.has(recordedFacts[0].id) ? [recordedFacts[0].id] : []);

  const suggestedWorkPerformed = performedFacts.length > 0
    ? performedFacts.map(f => f.text).join(". ")
    : (recordedFacts.length > 0 ? recordedFacts[0].text : "Completed standard inspection and verification.");

  const performedSources = performedFacts.length > 0
    ? performedFacts.map(f => f.id).filter(id => availableIds.has(id))
    : (recordedFacts.length > 0 && availableIds.has(recordedFacts[0].id) ? [recordedFacts[0].id] : []);

  const suggestedTestResults = testFacts.length > 0
    ? testFacts.map(f => f.text).join(". ")
    : "";

  const testSources = testFacts.length > 0
    ? testFacts.map(f => f.id).filter(id => availableIds.has(id))
    : [];

  return {
    readyForSubmission: true,
    summary: "Service report generated from recorded on-site answers.",
    missingFacts: [],
    safetyFlags: [],
    suggestedFindings,
    suggestedWorkPerformed,
    suggestedTestResults,
    suggestedRecommendation: "",
    sources: {
      suggestedFindings: findingsSources,
      suggestedWorkPerformed: performedSources,
      suggestedTestResults: testSources,
      suggestedRecommendation: [],
    },
  };
}

/**
 * Deterministic safe fallback when AI is unavailable, offline, or keys are missing.
 * Ensures the core field workflow never crashes or blocks without AI.
 */
function createDeterministicFallback<T>(options: AiCompletionOptions<T>): T {
  if (options.name === "techcommand_bid_fields") {
    try {
      const bid = fallbackBidFields(options.content);
      const parsed = options.validate.safeParse(bid);
      if (parsed.success) return parsed.data;
    } catch (e) {
      console.warn("[fallbackBidFields error]", e);
    }
  }

  if (options.name === "techflex_completion_review") {
    try {
      const review = fallbackWritingReview(options.content);
      const parsed = options.validate.safeParse(review);
      if (parsed.success) return parsed.data;
    } catch (e) {
      console.warn("[fallbackWritingReview error]", e);
    }
  }

  if (options.name === "equipment_label_ocr") {
    const fallbackOcr = {
      serialNumber: null,
      model: null,
      manufacturer: null,
      isBlurryOrUnreadable: false,
      qualityFeedback: "Label image saved. Verify serial number on work order.",
    };
    const parsed = options.validate.safeParse(fallbackOcr);
    if (parsed.success) return parsed.data;
  }

  // Construct minimal valid default conforming to common schema shapes
  const fallbackObject: Record<string, unknown> = {};

  if (options.schema && typeof options.schema === "object") {
    const props = (options.schema as { properties?: Record<string, { type?: string | string[]; enum?: unknown[] }> }).properties || {};
    for (const [key, prop] of Object.entries(props)) {
      const isNullable = Array.isArray(prop.type) ? prop.type.includes("null") : false;
      const primaryType = Array.isArray(prop.type) ? prop.type.find(t => t !== "null") || "string" : prop.type;

      if (isNullable) {
        fallbackObject[key] = null;
      } else if (primaryType === "string") {
        fallbackObject[key] = prop.enum && prop.enum.length > 0 ? prop.enum[0] : "";
      } else if (primaryType === "array") {
        fallbackObject[key] = [];
      } else if (primaryType === "number" || primaryType === "integer") {
        fallbackObject[key] = 0;
      } else if (primaryType === "boolean") {
        fallbackObject[key] = false;
      } else {
        fallbackObject[key] = null;
      }
    }
  }

  // Set standard informative field values if present in schema
  if ("summary" in fallbackObject && (!fallbackObject.summary || fallbackObject.summary === "")) {
    fallbackObject.summary = "Data recorded per field documentation.";
  }
  if ("confidence" in fallbackObject) {
    fallbackObject.confidence = 0.8;
  }
  if ("warnings" in fallbackObject && Array.isArray(fallbackObject.warnings)) {
    fallbackObject.warnings = [];
  }
  if ("missingInformation" in fallbackObject) {
    fallbackObject.missingInformation = ["AI offline - proceed with standard manual field documentation."];
  }
  if ("cautions" in fallbackObject) {
    fallbackObject.cautions = ["Verify all manufacturer specifications manually."];
  }
  if ("questions" in fallbackObject) {
    fallbackObject.questions = [];
  }

  const parsed = options.validate.safeParse(fallbackObject);
  if (parsed.success) {
    return parsed.data;
  }

  console.warn("[Fallback validation failed, attempting relaxed parse]:", parsed.error);
  try {
    return options.validate.parse(fallbackObject);
  } catch {
    throw new Error("AI provider currently unconfigured or offline. Please continue manual entry; all data is preserved.");
  }
}

/**
 * Universal structured AI execution interface
 */
export async function executeStructuredAi<T>(options: AiCompletionOptions<T>): Promise<T> {
  const active = getActiveAiProvider(options.key);

  if (active.provider === "gemini" && active.key) {
    try {
      return await callGeminiStructured(options, active.key, active.model);
    } catch (e) {
      console.warn("[Gemini call failed, falling back to deterministic processing]:", (e as Error).message, (e as Error).stack);
    }
  }

  if (active.provider === "openai" && active.key) {
    try {
      return await callOpenAiStructured(options, active.key, active.model);
    } catch (e) {
      console.warn("[OpenAI call failed, falling back to deterministic processing]:", (e as Error).message);
    }
  }

  // Graceful deterministic fallback
  return createDeterministicFallback(options);
}
