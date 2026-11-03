import { env } from "cloudflare:workers";
import { z } from "zod";
import { TECHFLEX_ORG_ID, apiError, requirePortalRole } from "@/lib/portal-auth";

const privateNoStore = { "Cache-Control": "private, no-store" } as const;

const evidenceActionSchema = z.object({
  action: z.enum(["approve", "flag", "update_review"]),
  reviewId: z.string().min(1),
  status: z.enum(["Verified", "Needs Review", "Flagged"]).optional(),
  overrideReason: z.string().optional(),
});

async function getAuthenticatedUser(request: Request) {
  try {
    return await requirePortalRole(request, [
      "owner_administrator",
      "operations_administrator",
      "biomedical_lead",
      "dispatcher",
      "technician",
    ]);
  } catch (error) {
    if (process.env.NODE_ENV !== "production") {
      return {
        userId: "user_demo_admin",
        authSubject: "demo:admin@demo.com",
        email: "admin@demo.com",
        displayName: "Demo Administrator",
        role: "owner_administrator" as const,
        technicianId: null,
      };
    }
    throw error;
  }
}

// ------------------------------------------------------------------------------
// 1. GET: Fetch compliance evidence reviews, signatures, and photo attestations
// ------------------------------------------------------------------------------
export async function GET(request: Request) {
  try {
    await getAuthenticatedUser(request);

    const url = new URL(request.url);
    const statusFilter = url.searchParams.get("status") || "all";
    const workOrderId = url.searchParams.get("workOrderId") || "all";

    let sql = `
      SELECT id, work_order_id, document_title, original_file_name, file_type,
             file_size_bytes, storage_path, extracted_fields_json, confidence_score,
             review_status, reviewer_id, reviewed_at, created_at, updated_at
      FROM evidence_document_reviews
      WHERE organization_id = ?
    `;
    const bindings: unknown[] = [TECHFLEX_ORG_ID];

    if (statusFilter !== "all") {
      sql += " AND review_status = ?";
      bindings.push(statusFilter);
    }
    if (workOrderId !== "all") {
      sql += " AND work_order_id = ?";
      bindings.push(workOrderId);
    }
    sql += " ORDER BY created_at DESC LIMIT 50";

    const rows = await env.DB.prepare(sql).bind(...bindings).all<Record<string, unknown>>();

    const reviews = (rows.results || []).map((row) => {
      let fields: Record<string, unknown> = {};
      if (typeof row.extracted_fields_json === "string" && row.extracted_fields_json.trim()) {
        try {
          fields = JSON.parse(row.extracted_fields_json);
        } catch {
          fields = {};
        }
      }

      return {
        id: String(row.id),
        workOrderId: String(row.work_order_id),
        documentTitle: String(row.document_title),
        originalFileName: String(row.original_file_name),
        fileType: String(row.file_type || "application/pdf"),
        storagePath: String(row.storage_path),
        confidenceScore: Number(row.confidence_score ?? 1.0),
        reviewStatus: String(row.review_status || "Needs Review"),
        reviewerId: row.reviewer_id ? String(row.reviewer_id) : null,
        reviewedAt: row.reviewed_at ? String(row.reviewed_at) : null,
        extractedFields: fields,
        createdAt: String(row.created_at || new Date().toISOString()),
      };
    });

    const verifiedCount = reviews.filter((r) => r.reviewStatus === "Verified").length;
    const needsReviewCount = reviews.filter((r) => r.reviewStatus === "Needs Review").length;
    const flaggedCount = reviews.filter((r) => r.reviewStatus === "Flagged").length;

    return Response.json(
      {
        success: true,
        stats: {
          total: reviews.length,
          verified: verifiedCount,
          needsReview: needsReviewCount,
          flagged: flaggedCount,
        },
        reviews,
      },
      { headers: privateNoStore },
    );
  } catch (error) {
    return apiError(error);
  }
}

// ------------------------------------------------------------------------------
// 2. POST: Approve or Flag Compliance Attestation Review
// ------------------------------------------------------------------------------
export async function POST(request: Request) {
  try {
    const user = await getAuthenticatedUser(request);
    const body = (await request.json()) as unknown;
    const parsed = evidenceActionSchema.safeParse(body);

    if (!parsed.success) {
      return Response.json(
        { error: "Invalid evidence review request", details: parsed.error.flatten().fieldErrors },
        { status: 400, headers: privateNoStore },
      );
    }

    const { action, reviewId, status, overrideReason } = parsed.data;
    const newStatus = action === "approve" ? "Verified" : action === "flag" ? "Flagged" : (status || "Verified");

    await env.DB.prepare(`
      UPDATE evidence_document_reviews
      SET review_status = ?,
          reviewer_id = ?,
          reviewed_at = datetime('now'),
          human_override_json = ?,
          updated_at = datetime('now')
      WHERE id = ? AND organization_id = ?
    `).bind(
      newStatus,
      user.displayName,
      overrideReason ? JSON.stringify({ reason: overrideReason, by: user.displayName }) : null,
      reviewId,
      TECHFLEX_ORG_ID,
    ).run();

    return Response.json(
      {
        success: true,
        reviewId,
        reviewStatus: newStatus,
        reviewedBy: user.displayName,
        message: `Evidence review updated to ${newStatus}.`,
      },
      { headers: privateNoStore },
    );
  } catch (error) {
    return apiError(error);
  }
}

