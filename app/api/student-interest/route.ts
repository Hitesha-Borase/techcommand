import { SupabaseBucket } from "@/lib/supabase-storage";
import { env } from "cloudflare:workers";
import { z } from "zod";
import { apiError, requirePortalRole, TECHFLEX_ORG_ID } from "@/lib/portal-auth";

const institutions = {
  dacc: "Delaware Area Career Center (DACC)",
} as const;

const allowedResumeTypes = new Set([
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
]);
const maxResumeBytes = 8 * 1024 * 1024;
const field = z.string().trim().min(1).max(200);

function responseError(error: string, status = 400) {
  return Response.json({ error }, { status });
}

export async function POST(request: Request) {
  try {
    const contentLength = Number(request.headers.get("content-length") || 0);
    if (contentLength > maxResumeBytes + 100_000) return responseError("Resume file is too large.", 413);
    const form = await request.formData();
    if (String(form.get("website") || "").trim()) return Response.json({ submitted: true });
    const input = z.object({
      institution: z.enum(["dacc"]),
      fullName: field,
      email: z.string().trim().email().max(254).transform((value) => value.toLowerCase()),
      phone: field.max(40),
      program: z.string().trim().max(200),
      graduationDate: z.string().trim().max(30),
      availability: field.max(2000),
      transportation: field.max(500),
      tools: field.max(2000),
    }).parse(Object.fromEntries(form.entries()));
    const resume = form.get("resume");
    if (!(resume instanceof File) || resume.size === 0) return responseError("Please attach your rÃ©sumÃ©.");
    if (resume.size > maxResumeBytes) return responseError("RÃ©sumÃ© files must be 8 MB or smaller.", 413);
    if (!allowedResumeTypes.has(resume.type)) return responseError("Attach a PDF, DOC, or DOCX rÃ©sumÃ©.");
    const id = crypto.randomUUID();
    const extension = resume.name.split(".").pop()?.toLowerCase().replace(/[^a-z0-9]/g, "") || "file";
    const resumeKey = `school-interest/${input.institution}/${id}/resume.${extension}`;
    await SupabaseBucket.put(resumeKey, await resume.arrayBuffer(), {
      httpMetadata: { contentType: resume.type, contentDisposition: `attachment; filename="${resume.name.replace(/["\\]/g, "_")}"` },
    });
    try {
      await env.DB.prepare(`INSERT INTO school_interest_submissions
        (id,organization_id,institution_slug,institution_name,full_name,email,phone,program,graduation_date,availability,transportation,tools,resume_key,resume_name,resume_content_type)
        VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).bind(
        id, TECHFLEX_ORG_ID, input.institution, institutions[input.institution], input.fullName, input.email,
        input.phone, input.program || null, input.graduationDate || null, input.availability, input.transportation,
        input.tools, resumeKey, resume.name.slice(0, 200), resume.type,
      ).run();
    } catch (error) {
      await SupabaseBucket.delete(resumeKey);
      throw error;
    }
    return Response.json({ submitted: true });
  } catch (error) {
    if (error instanceof z.ZodError) return responseError(error.issues[0]?.message || "Review the required fields.");
    return apiError(error);
  }
}

export async function GET(request: Request) {
  try {
    await requirePortalRole(request, ["owner_administrator", "operations_administrator"]);
    const url = new URL(request.url);
    const id = url.searchParams.get("resume");
    if (id) {
      const row = await env.DB.prepare("SELECT resume_key AS resumeKey,resume_name AS resumeName,resume_content_type AS resumeContentType FROM school_interest_submissions WHERE id=? AND organization_id=?").bind(id, TECHFLEX_ORG_ID).first<{resumeKey:string|null;resumeName:string|null;resumeContentType:string|null}>();
      if (!row?.resumeKey) return responseError("RÃ©sumÃ© not found.", 404);
      const object = await SupabaseBucket.get(row.resumeKey);
      if (!object) return responseError("RÃ©sumÃ© file is unavailable.", 404);
      return new Response(object.body, { headers: { "Content-Type": row.resumeContentType || "application/octet-stream", "Content-Disposition": `attachment; filename="${(row.resumeName || "resume").replace(/["\\]/g, "_")}"`, "Cache-Control": "private, no-store" } });
    }
    const results = await env.DB.prepare(`SELECT id,institution_slug AS institutionSlug,institution_name AS institutionName,full_name AS fullName,email,phone,program,graduation_date AS graduationDate,availability,transportation,tools,resume_name AS resumeName,status,created_at AS createdAt FROM school_interest_submissions WHERE organization_id=? ORDER BY institution_name,created_at DESC`).bind(TECHFLEX_ORG_ID).all();
    return Response.json({ submissions: results.results }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) { return apiError(error); }
}

export async function DELETE(request: Request) {
  try {
    const identity = await requirePortalRole(request, ["owner_administrator", "operations_administrator"]);
    const id = new URL(request.url).searchParams.get("id");
    if (!id || !z.string().uuid().safeParse(id).success) return responseError("A valid student-interest record is required.");
    const row = await env.DB.prepare("SELECT id,resume_key AS resumeKey FROM school_interest_submissions WHERE id=? AND organization_id=?").bind(id, TECHFLEX_ORG_ID).first<{id:string;resumeKey:string|null}>();
    if (!row) return responseError("Student-interest record not found.", 404);
    if (row.resumeKey) await SupabaseBucket.delete(row.resumeKey);
    const result = await env.DB.batch([
      env.DB.prepare("DELETE FROM school_interest_submissions WHERE id=? AND organization_id=?").bind(id, TECHFLEX_ORG_ID),
      env.DB.prepare("INSERT INTO audit_logs(id,organization_id,actor_user_id,action,entity_type,entity_id,after_json) VALUES(?,?,?,?,?,?,?)").bind(crypto.randomUUID(), TECHFLEX_ORG_ID, identity.userId, "school_interest.deleted", "school_interest_submission", id, JSON.stringify({ resumeDeleted: Boolean(row.resumeKey) })),
    ]);
    if (!result[0].meta.changes) return responseError("Student-interest record was not removed.", 409);
    return Response.json({ deleted: true });
  } catch (error) { return apiError(error); }
}
