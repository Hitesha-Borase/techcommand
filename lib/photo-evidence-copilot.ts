import { z } from "zod";

export const photoEvidenceProposal = z.object({
  visibleDetails: z.array(z.string().trim().min(1).max(160)).max(6),
  suggestedCaption: z.string().trim().min(3).max(240),
  uncertainties: z.array(z.string().trim().min(1).max(160)).max(6),
  manualChecks: z.array(z.string().trim().min(1).max(160)).max(6),
  detectedSerial: z.string().trim().max(160).optional(),
  detectedModel: z.string().trim().max(160).optional(),
  reviewRequired: z.literal(true),
}).strict();

export type PhotoEvidenceProposal = z.infer<typeof photoEvidenceProposal>;

export const photoEvidenceProposalJsonSchema = {
  type: "object",
  additionalProperties: false,
  required: ["visibleDetails", "suggestedCaption", "uncertainties", "manualChecks", "reviewRequired"],
  properties: {
    visibleDetails: { type: "array", maxItems: 6, items: { type: "string" } },
    suggestedCaption: { type: "string" },
    uncertainties: { type: "array", maxItems: 6, items: { type: "string" } },
    manualChecks: { type: "array", maxItems: 6, items: { type: "string" } },
    detectedSerial: { type: "string" },
    detectedModel: { type: "string" },
    reviewRequired: { type: "boolean", enum: [true] },
  },
} as const;

const unsupportedClaim = /\b(?:pass(?:ed|es)?|fail(?:ed|s)?|safe|unsafe|compliant|compliance|within\s+(?:manufacturer\s+)?limits?|operational|functional|working|calibrated|repaired|installed|diagnos(?:is|ed)|no\s+(?:damage|defect|issue|problem))\b/i;

export function photoEvidenceProposalProblem(value: PhotoEvidenceProposal) {
  if (unsupportedClaim.test(value.suggestedCaption))
    return "AI cannot turn a photo into a diagnosis, completed action, safety claim or pass/fail result.";
  return null;
}

export async function imageDataUrl(bytes: ArrayBuffer, contentType: string) {
  const input = new Uint8Array(bytes);
  let binary = "";
  for (let index = 0; index < input.length; index += 0x8000)
    binary += String.fromCharCode(...input.subarray(index, index + 0x8000));
  return `data:${contentType};base64,${btoa(binary)}`;
}

export async function sha256Hex(bytes: ArrayBuffer) {
  const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", bytes));
  return [...digest].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}
