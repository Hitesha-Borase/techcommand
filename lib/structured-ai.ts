import { z } from "zod";

export async function structuredAi<T>(options: {
  key: string; model?: string; reasoning?: "medium"; name: string; instruction: string;
  content: Array<Record<string, unknown>>; schema: Record<string, unknown>; validate: z.ZodType<T>;
}): Promise<T> {
  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST", signal: AbortSignal.timeout(options.reasoning ? 110000 : 45000),
    headers: { Authorization: `Bearer ${options.key}`, "Content-Type": "application/json" },
    body: JSON.stringify({ model: options.model || "gpt-4.1-mini", store: false, ...(options.reasoning ? {reasoning:{effort:options.reasoning},max_output_tokens:12000}:{}),
      input: [{ role: "system", content: [{ type: "input_text", text: options.instruction }] }, { role: "user", content: options.content }],
      text: { format: { type: "json_schema", name: options.name, strict: true, schema: options.schema } },
    }),
  });
  if (!response.ok) throw new Error(response.status === 429 ? "AI is temporarily busy or its project limit has been reached. Your work is preserved; try again later." : "AI could not complete this request. Your work is preserved; try again or continue manually.");
  const body = await response.json() as { status?: string; output_text?: string; output?: { content?: { type?: string; text?: string }[] }[] };
  if (body.status && body.status !== "completed") throw new Error("AI returned an incomplete response. Nothing was applied; try again.");
  const content = body.output?.flatMap(item => item.content || []) || [];
  if (content.some(item => item.type === "refusal")) throw new Error("AI could not help with this request. Continue with approved documentation or contact technical support.");
  const raw = body.output_text || content.filter(item => item.type === "output_text").map(item => item.text || "").join("");
  try { return options.validate.parse(JSON.parse(raw)); }
  catch { throw new Error("AI returned information that could not be verified. Nothing was applied; review the source and try again."); }
}

export async function fileAiContent(file: File): Promise<Record<string, unknown>> {
  const type = file.type === "application/pdf" || /\.pdf$/i.test(file.name) ? "application/pdf" : file.type;
  if (!["application/pdf", "image/jpeg", "image/png", "image/webp"].includes(type)) throw new Error("Choose PDF, JPEG, PNG or WEBP for document extraction.");
  const bytes = new Uint8Array(await file.arrayBuffer());
  let binary = "";
  for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  const data = `data:${type};base64,${btoa(binary)}`;
  return type === "application/pdf" ? { type: "input_file", filename: file.name, file_data: data } : { type: "input_image", image_url: data, detail: "high" };
}
