import { z } from "zod";
import { executeStructuredAi, type AiProviderName } from "./ai-provider";

export async function structuredAi<T>(options: {
  key?: string;
  provider?: AiProviderName;
  model?: string;
  reasoning?: "medium";
  name: string;
  instruction: string;
  content: Array<Record<string, unknown>>;
  schema: Record<string, unknown>;
  validate: z.ZodType<T>;
}): Promise<T> {
  return executeStructuredAi(options);
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
