import { env } from "cloudflare:workers";
import { z } from "zod";
import { academyTechnician } from "@/lib/academy";
import { safeJson } from "@/lib/academy-learning";
import { generateAcademyPortfolioPdf } from "@/lib/academy-portfolio-pdf";
import { apiError, PortalHttpError, requirePortalRole, TECHFLEX_ORG_ID } from "@/lib/portal-auth";

const roles = ["owner_administrator", "operations_administrator", "biomedical_lead", "technician"] as const;
const trackSchema = z.enum(["biomedical", "dme_mobility"]);
type EnrollmentRow = {
  title: string;
  revision: number;
  status: string;
  trainingStatus: string | null;
  progressJson: string;
  snapshotJson: string;
};

function filePart(value: string) {
  return value.replace(/[^A-Za-z0-9_-]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 80) || "learner";
}

export async function GET(request: Request) {
  try {
    const identity = await requirePortalRole(request, [...roles]);
    const params = new URL(request.url).searchParams;
    const track = trackSchema.parse(params.get("track") || "biomedical");
    const technicianId = params.get("technicianId") || identity.technicianId;
    if (!technicianId) throw new PortalHttpError(403, "A linked technician profile is required.");
    if (identity.role === "biomedical_lead" && track !== "biomedical") throw new PortalHttpError(403, "Biomedical lead access does not manage DME learning.");
    const technician = await academyTechnician(technicianId, track);
    if (technician.userId !== identity.userId) throw new PortalHttpError(403, "Only the learner may download their own Academy progress portfolio.");

    const enrollments = await env.DB.prepare(`SELECT c.title,r.revision,e.status,tr.status AS trainingStatus,e.progress_json AS progressJson,r.snapshot_json AS snapshotJson
      FROM academy_enrollments e
      JOIN academy_course_revisions r ON r.id=e.revision_id AND r.organization_id=e.organization_id AND r.track=e.track
      JOIN academy_courses c ON c.id=r.course_id AND c.organization_id=e.organization_id AND c.track=e.track
      LEFT JOIN academy_training_records tr ON tr.id=e.training_record_id AND tr.organization_id=e.organization_id AND tr.technician_id=e.technician_id AND tr.track=e.track
      WHERE e.organization_id=? AND e.track=? AND e.technician_id=?
      ORDER BY c.title,r.revision,e.id`).bind(TECHFLEX_ORG_ID, track, technician.id).all<EnrollmentRow>();
    const verified = await env.DB.prepare(`SELECT title,provider,completed_on AS completedOn
      FROM academy_training_records
      WHERE organization_id=? AND track=? AND technician_id=? AND status='verified'
      ORDER BY completed_on DESC,created_at DESC,id`).bind(TECHFLEX_ORG_ID, track, technician.id).all<{ title: string; provider: string; completedOn: string | null }>();
    const bytes = await generateAcademyPortfolioPdf({
      learnerName: technician.name,
      technicianCode: technician.technicianCode,
      track,
      generatedAt: new Date().toISOString(),
      courses: enrollments.results.map((row) => {
        const progress = safeJson<{ completedLessonIds?: string[] }>(row.progressJson, {});
        const snapshot = safeJson<{ lessons?: unknown[] }>(row.snapshotJson, {});
        return {
          title: row.title,
          revision: row.revision,
          status: row.status,
          trainingStatus: row.trainingStatus,
          completedLessons: new Set(progress.completedLessonIds || []).size,
          totalLessons: Array.isArray(snapshot.lessons) ? snapshot.lessons.length : 0,
        };
      }),
      verifiedTraining: verified.results,
    });
    const filename = `TechFlex-Academy-${track === "biomedical" ? "Biomedical" : "DME-Mobility"}-${filePart(technician.name)}.pdf`;
    return new Response(Uint8Array.from(bytes).buffer, {
      headers: {
        "Cache-Control": "private, no-store",
        "Content-Disposition": `attachment; filename="${filename}"`,
        "Content-Type": "application/pdf",
        "X-Content-Type-Options": "nosniff",
        "X-TechCommand-Portfolio-Scope": "learner-owned",
      },
    });
  } catch (error) {
    const response = error instanceof z.ZodError
      ? Response.json({ error: error.issues.map((issue) => issue.message).join(" ") }, { status: 400 })
      : apiError(error);
    response.headers.set("Cache-Control", "private, no-store");
    return response;
  }
}
