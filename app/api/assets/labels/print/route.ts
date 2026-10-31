import { env } from "cloudflare:workers";
import { z } from "zod";
import { assetManageRoles, requireAssetIdentity } from "@/lib/asset-access";
import { generatePermanentAssetLabelPdf, type PermanentAssetLabelSnapshot } from "@/lib/permanent-asset-label";
import { TECHFLEX_ORG_ID, PortalHttpError, apiError, requirePortalRole } from "@/lib/portal-auth";

const headers = { "Cache-Control": "private, no-store" };
const inputSchema = z.object({
  assetId: z.string().min(1).max(80), labelId: z.string().min(1).max(80), requestId: z.string().uuid(),
  expectedRecordVersion: z.number().int().positive(), widthMils: z.number().int().min(2000).max(6000),
  heightMils: z.number().int().min(1000).max(4000), physicalMatch: z.literal(true), reason: z.string().trim().max(500).nullable(),
});
type Input = z.infer<typeof inputSchema>;
type EventRow = { id: string; assetId: string; labelId: string; requestFingerprint: string; printNumber: number; labelWidthMils: number; labelHeightMils: number; snapshotJson: string; createdAt: string };
type LabelRow = PermanentAssetLabelSnapshot & { labelId: string; assetVersion: number; status: string; printCount: number };

async function fingerprint(input: Input) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(JSON.stringify(input)));
  return Array.from(new Uint8Array(digest), (value) => value.toString(16).padStart(2, "0")).join("");
}

async function eventForRequest(requestId: string) {
  return env.DB.prepare(`SELECT id,asset_id AS assetId,label_id AS labelId,request_fingerprint AS requestFingerprint,
    print_number AS printNumber,label_width_mils AS labelWidthMils,label_height_mils AS labelHeightMils,
    snapshot_json AS snapshotJson,created_at AS createdAt FROM asset_label_print_events WHERE organization_id=? AND request_id=?`)
    .bind(TECHFLEX_ORG_ID, requestId).first<EventRow>();
}

async function responseFor(event: EventRow, replayed: boolean) {
  const snapshot = z.object({ labelCode: z.string(), assetTag: z.string(), manufacturer: z.string(), model: z.string(), serialNumber: z.string().nullable(), locationName: z.string() }).parse(JSON.parse(event.snapshotJson));
  const bytes = await generatePermanentAssetLabelPdf({ ...snapshot, widthMils: event.labelWidthMils, heightMils: event.labelHeightMils, printNumber: event.printNumber, printedAt: event.createdAt, eventId: event.id });
  const filename = `TechFlex-${snapshot.assetTag}-${snapshot.labelCode}-permanent-label-print-${event.printNumber}.pdf`.replace(/[^a-zA-Z0-9._-]/g, "_");
  return new Response(bytes as BodyInit, { headers: { ...headers, "Content-Type": "application/pdf", "Content-Disposition": `attachment; filename="${filename}"`, "X-TechCommand-Label-Print": String(event.printNumber), "X-TechCommand-Replayed": replayed ? "true" : "false" } });
}

export async function POST(request: Request) {
  let parsed: Input | null = null;
  let digest = "";
  try {
    const identity = await requirePortalRole(request, [...assetManageRoles]);
    parsed = inputSchema.parse(await request.json());
    digest = await fingerprint(parsed);
    const prior = await eventForRequest(parsed.requestId);
    if (prior) {
      if (prior.requestFingerprint !== digest || prior.assetId !== parsed.assetId || prior.labelId !== parsed.labelId) throw new PortalHttpError(409, "This print request identity was already used for different label details.");
      return responseFor(prior, true);
    }
    const asset = await requireAssetIdentity(parsed.assetId, identity);
    if (asset.recordVersion !== parsed.expectedRecordVersion) throw new PortalHttpError(409, "The asset changed. Refresh and confirm the physical equipment again before printing.");
    const label = await env.DB.prepare(`SELECT al.id AS labelId,al.label_code AS labelCode,al.status,a.asset_tag AS assetTag,a.manufacturer,a.model,a.serial_number AS serialNumber,
      a.record_version AS assetVersion,l.name AS locationName,
      (SELECT COUNT(*) FROM asset_label_print_events p WHERE p.organization_id=al.organization_id AND p.label_id=al.id) AS printCount
      FROM asset_labels al JOIN assets a ON a.id=al.asset_id AND a.organization_id=al.organization_id
      JOIN accounts account ON account.id=a.account_id AND account.organization_id=a.organization_id
      JOIN locations l ON l.id=a.location_id AND l.account_id=a.account_id
      WHERE al.organization_id=? AND al.id=? AND al.asset_id=? AND a.status!='retired' AND account.status='active' AND l.status='active'`)
      .bind(TECHFLEX_ORG_ID, parsed.labelId, parsed.assetId).first<LabelRow>();
    if (!label) throw new PortalHttpError(404, "The active label and equipment identity could not be matched.");
    if (label.status !== "active") throw new PortalHttpError(409, "A retired label cannot be printed. Use the current active equipment label.");
    if (label.assetVersion !== parsed.expectedRecordVersion) throw new PortalHttpError(409, "The asset changed. Refresh and confirm the physical equipment again before printing.");
    if (label.printCount > 0 && (!parsed.reason || parsed.reason.length < 5)) throw new PortalHttpError(400, "Record why this permanent label is being reprinted.");
    const snapshot: PermanentAssetLabelSnapshot = { labelCode: label.labelCode, assetTag: label.assetTag, manufacturer: label.manufacturer, model: label.model, serialNumber: label.serialNumber, locationName: label.locationName };
    const id = crypto.randomUUID();
    const printNumber = label.printCount + 1;
    try {
      await generatePermanentAssetLabelPdf({ ...snapshot, widthMils: parsed.widthMils, heightMils: parsed.heightMils, printNumber, printedAt: new Date().toISOString(), eventId: id });
    } catch {
      throw new PortalHttpError(400, "This label cannot be rendered safely on the selected stock. Use a wider label or review unsupported characters.");
    }
    const result = await env.DB.batch([
      env.DB.prepare(`INSERT INTO asset_label_print_events(id,organization_id,asset_id,label_id,request_id,request_fingerprint,print_number,label_width_mils,label_height_mils,symbology,reason,asset_version,snapshot_json,printed_by)
        SELECT ?,?,?,?,?,?,?,?,?,'code128b',?,?,?,? WHERE EXISTS (
          SELECT 1 FROM asset_labels al JOIN assets a ON a.id=al.asset_id AND a.organization_id=al.organization_id
          WHERE al.id=? AND al.organization_id=? AND al.asset_id=? AND al.status='active' AND a.status!='retired' AND a.record_version=?
        )`).bind(id, TECHFLEX_ORG_ID, parsed.assetId, parsed.labelId, parsed.requestId, digest, printNumber, parsed.widthMils, parsed.heightMils, parsed.reason, parsed.expectedRecordVersion, JSON.stringify(snapshot), identity.userId, parsed.labelId, TECHFLEX_ORG_ID, parsed.assetId, parsed.expectedRecordVersion),
      env.DB.prepare(`INSERT INTO audit_logs(id,organization_id,actor_user_id,action,entity_type,entity_id,after_json)
        SELECT ?,?,?,'asset_label.printed','asset',?,? WHERE EXISTS (SELECT 1 FROM asset_label_print_events WHERE id=?)`)
        .bind(crypto.randomUUID(), TECHFLEX_ORG_ID, identity.userId, parsed.assetId, JSON.stringify({ labelId: parsed.labelId, printNumber, widthMils: parsed.widthMils, heightMils: parsed.heightMils, symbology: "code128b", reason: parsed.reason }), id),
    ]);
    if (result[0].meta.changes !== 1 || result[1].meta.changes !== 1) throw new PortalHttpError(409, "The label, asset or print history changed. Refresh before printing.");
    const event = await eventForRequest(parsed.requestId);
    if (!event) throw new Error("The saved print event could not be reloaded.");
    return responseFor(event, false);
  } catch (error) {
    if (parsed && digest) {
      const replay = await eventForRequest(parsed.requestId);
      if (replay && replay.requestFingerprint === digest && replay.assetId === parsed.assetId && replay.labelId === parsed.labelId) return responseFor(replay, true);
    }
    if (error instanceof z.ZodError) return Response.json({ error: "Confirm the exact active label, physical equipment and label-stock dimensions." }, { status: 400, headers });
    if (error instanceof Error && /uidx_asset_label_print|UNIQUE constraint failed: asset_label_print_events/.test(error.message)) return Response.json({ error: "Another label print was recorded first. Refresh the print history before continuing." }, { status: 409, headers });
    const response = apiError(error); response.headers.set("Cache-Control", headers["Cache-Control"]); return response;
  }
}
