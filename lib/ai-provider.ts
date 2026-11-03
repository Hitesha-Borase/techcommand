/**
 * Independent AI Provider Abstraction Interface
 * Implements PDF Handoff Page 1, 6 & 7 requirements:
 * "The migration objective includes replacing direct OpenAI runtime calls.
 *  Define a provider interface and evaluate an independent replacement...
 *  Core field documentation must work with AI unavailable."
 */

import { z } from "zod";
import { env } from "cloudflare:workers";

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
    : (workerEnv.GEMINI_API_KEY || envObj.GEMINI_API_KEY || (typeof globalObj.GEMINI_API_KEY === "string" ? globalObj.GEMINI_API_KEY : "") || "");
  const openAiKey = explicitKey?.startsWith("sk-")
    ? explicitKey
    : (workerEnv.OPENAI_API_KEY || envObj.OPENAI_API_KEY || (typeof globalObj.OPENAI_API_KEY === "string" ? globalObj.OPENAI_API_KEY : "") || "");

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

  const fullInstruction = options.instruction + (options.schema ? `\n\nYou MUST respond with ONLY a valid JSON object strictly adhering to this JSON schema structure:\n${JSON.stringify(options.schema)}\nEnsure every property defined in the schema is present in your response (use null for missing/unknown values, empty array [] for missing lists, and 0 for missing numbers).` : "");

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
 * Deterministic safe fallback when AI is unavailable, offline, or keys are missing.
 * Ensures the core field workflow never crashes or blocks without AI.
 */
function createDeterministicFallback<T>(options: AiCompletionOptions<T>): T {
  // Construct minimal valid default conforming to common schema shapes
  const fallbackObject: Record<string, unknown> = {};

  if (options.schema && typeof options.schema === "object") {
    const props = (options.schema as { properties?: Record<string, { type?: string }> }).properties || {};
    for (const [key, prop] of Object.entries(props)) {
      if (prop.type === "string") fallbackObject[key] = "";
      else if (prop.type === "array") fallbackObject[key] = [];
      else if (prop.type === "number") fallbackObject[key] = 0;
      else if (prop.type === "boolean") fallbackObject[key] = false;
      else fallbackObject[key] = null;
    }
  }

  // Set standard informative field values if present in schema
  if ("summary" in fallbackObject) {
    fallbackObject.summary = "Manual review required. AI provider offline or unconfigured.";
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

  try {
    return options.validate.parse(fallbackObject);
  } catch {
    // If strict zod parse fails, throw polite recovery instruction
    throw new Error("AI provider currently unconfigured or offline. Please continue manual entry; all data is preserved.");
  }
}

/**
 * Universal structured AI execution interface
 */
export async function executeStructuredAi<T>(options: AiCompletionOptions<T>): Promise<T> {
  const active = getActiveAiProvider(options.key);

  if (active.provider === "gemini" && active.key) {
    return await callGeminiStructured(options, active.key, active.model);
  }

  if (active.provider === "openai" && active.key) {
    return await callOpenAiStructured(options, active.key, active.model);
  }

  // Graceful deterministic fallback
  return createDeterministicFallback(options);
}
