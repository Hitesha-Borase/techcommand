import { z } from "zod";

export const websiteWorkflows = [
  "service_request",
  "quote_request",
  "contact",
  "career",
  "partnership",
  "newsletter",
] as const;

const optionalText = (maximum: number) =>
  z.string().trim().max(maximum).optional().nullable();

const optionalEmail = z
  .string()
  .trim()
  .email()
  .max(320)
  .optional()
  .nullable()
  .or(z.literal(""));

export const websiteIntakeSchema = z
  .object({
    workflow: z.enum(websiteWorkflows),
    submissionId: z.string().trim().min(8).max(180),
    name: optionalText(240),
    email: optionalEmail,
    phone: optionalText(80),
    company: optionalText(240),
    jobTitle: optionalText(160),
    serviceType: optionalText(120),
    equipmentType: optionalText(240),
    manufacturer: optionalText(160),
    model: optionalText(160),
    serialNumber: optionalText(160),
    address: optionalText(1000),
    message: optionalText(10000),
    sourcePageUrl: z.string().trim().url().max(2000).optional().nullable(),
    marketingConsent: z.boolean().optional().default(false),
    consentText: optionalText(1000),
    honeypot: optionalText(200),
  })
  .superRefine((value, context) => {
    if (value.honeypot)
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["honeypot"],
        message: "Automated submission rejected.",
      });
    if (["career", "newsletter"].includes(value.workflow) && !value.email)
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["email"],
        message: "Email is required for this form.",
      });
    if (value.workflow === "newsletter" && !value.marketingConsent)
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["marketingConsent"],
        message: "Affirmative marketing consent is required.",
      });
    if (
      value.workflow !== "newsletter" &&
      !value.name &&
      !value.email &&
      !value.phone
    )
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["name"],
        message: "At least one contact method is required.",
      });
  });

export type WebsiteIntake = z.infer<typeof websiteIntakeSchema>;

export const websiteFileTypes = new Set([
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/heic",
]);

export function taskForWebsiteIntake(input: WebsiteIntake) {
  const labels: Record<WebsiteIntake["workflow"], string> = {
    service_request: "Review website service request",
    quote_request: "Prepare website quote response",
    contact: "Respond to website contact",
    career: "Review website candidate",
    partnership: "Review website partnership inquiry",
    newsletter: "Verify website newsletter enrollment",
  };
  const categories: Record<WebsiteIntake["workflow"], string> = {
    service_request: "Website leads",
    quote_request: "Website leads",
    contact: "Inbox",
    career: "Recruiting",
    partnership: "Partnerships",
    newsletter: "Marketing",
  };
  return {
    title: labels[input.workflow],
    category: categories[input.workflow],
    priority: ["service_request", "quote_request"].includes(input.workflow)
      ? "high"
      : "normal",
  };
}

export function isOperationalWorkflow(workflow: WebsiteIntake["workflow"]) {
  return ["service_request", "quote_request", "contact"].includes(workflow);
}

export function cleanWebsitePayload(input: WebsiteIntake) {
  const safe: Partial<WebsiteIntake> = { ...input };
  delete safe.honeypot;
  return safe;
}
