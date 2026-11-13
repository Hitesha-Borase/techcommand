import { env } from "cloudflare:workers";
import { TECHFLEX_ORG_ID, apiError, requirePortalRole } from "@/lib/portal-auth";

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const identity = await requirePortalRole(request, [
      "owner_administrator",
      "operations_administrator",
    ]);
    const { id } = await params;
    if (!id) return Response.json({ error: "Customer ID required." }, { status: 400 });

    const result = await env.DB.prepare(
      `UPDATE customers SET status = 'archived', updated_at = CURRENT_TIMESTAMP
        WHERE id = ? AND organization_id = ? AND status != 'archived'`,
    ).bind(id, TECHFLEX_ORG_ID).run();

    if (result.meta.changes !== 1)
      return Response.json({ error: "Customer not found or already removed." }, { status: 404 });

    await env.DB.prepare(
      `INSERT INTO audit_logs (id, organization_id, actor_user_id, action, entity_type, entity_id, after_json)
       VALUES (?, ?, ?, 'customer.archived', 'customer', ?, ?)`,
    ).bind(crypto.randomUUID(), TECHFLEX_ORG_ID, identity.userId, id, JSON.stringify({ status: "archived" })).run();

    return Response.json({ success: true });
  } catch (error) {
    return apiError(error);
  }
}

