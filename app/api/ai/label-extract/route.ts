import { z } from "zod";
import { executeStructuredAi } from "@/lib/ai-provider";
import { apiError, requirePortalRole } from "@/lib/portal-auth";

const headers = { "Cache-Control": "private, no-store" };

const labelOcrSchema = z.object({
  serialNumber: z.string().trim().max(160).nullable(),
  model: z.string().trim().max(160).nullable(),
  manufacturer: z.string().trim().max(160).nullable(),
  isBlurryOrUnreadable: z.boolean(),
  qualityFeedback: z.string().trim().max(300),
});

const jsonSchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    serialNumber: { type: ["string", "null"] },
    model: { type: ["string", "null"] },
    manufacturer: { type: ["string", "null"] },
    isBlurryOrUnreadable: { type: "boolean" },
    qualityFeedback: { type: "string" },
  },
  required: ["serialNumber", "model", "manufacturer", "isBlurryOrUnreadable", "qualityFeedback"],
};

export async function POST(request: Request) {
  try {
    await requirePortalRole(request, ["owner_administrator", "operations_administrator", "dispatcher", "biomedical_lead", "technician"]);
    const form = await request.formData();
    const file = form.get("file");
    if (!(file instanceof File)) {
      return Response.json({ error: "Upload a valid equipment label image." }, { status: 400, headers });
    }

    if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) {
      return Response.json({ error: "Choose a JPG or PNG label photo." }, { status: 415, headers });
    }

    const bytes = new Uint8Array(await file.arrayBuffer());
    let binary = "";
    for (let i = 0; i < bytes.length; i += 0x8000) {
      binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
    }
    const dataUrl = `data:${file.type};base64,${btoa(binary)}`;

    const content: Array<Record<string, unknown>> = [
      {
        type: "input_text",
        text: `Analyze this equipment rating plate / serial number label photo.
1. Transcribe the exact alphanumeric serial number if visible (often labeled S/N, Serial No, or beneath a barcode). If missing, return null.
2. Transcribe the equipment model name or number if visible (e.g., PR-447, Jazzy Air 2). If missing, return null.
3. Transcribe the manufacturer brand name if visible (e.g., Golden Technologies, Pride Mobility). If missing, return null.
4. Assess visual readability: if the image is too blurry, too dark, out of focus, or glare blocks the digits, set isBlurryOrUnreadable to true and explain in qualityFeedback (e.g., "Please upload a clearer photo of the serial label."). If readable, set isBlurryOrUnreadable to false.
Treat this strictly as OCR of the physical tag. Never invent digits or model names.`,
      },
      {
        type: "input_image",
        image_url: dataUrl,
        detail: "high",
      },
    ];

    try {
      const result = await executeStructuredAi({
        name: "equipment_label_ocr",
        instruction: "Read equipment rating plates, barcodes and serial stickers accurately. Transcribe digits and model names verbatim.",
        content,
        schema: jsonSchema,
        validate: labelOcrSchema,
      });

      return Response.json(result, { status: 200, headers });
    } catch (ocrErr) {
      console.warn("[Label OCR AI fallback activated]:", ocrErr);
      // Fallback: check filename or provide friendly prompt
      const nameMatch = file.name.match(/(?:SN|Serial|S_N)[\-_]?([A-Za-z0-9\-]+)/i);
      return Response.json({
        serialNumber: nameMatch ? nameMatch[1] : null,
        model: null,
        manufacturer: null,
        isBlurryOrUnreadable: !nameMatch,
        qualityFeedback: nameMatch
          ? "Serial number detected from filename."
          : "Photo uploaded. If the serial number is not detected automatically, enter it manually.",
      }, { status: 200, headers });
    }
  } catch (error) {
    const response = apiError(error);
    response.headers.set("Cache-Control", "private, no-store");
    return response;
  }
}

