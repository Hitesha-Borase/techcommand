import { env } from "cloudflare:workers";
import { z } from "zod";
import { TECHFLEX_ORG_ID, apiError, requirePortalRole } from "@/lib/portal-auth";

const privateNoStore = { "Cache-Control": "private, no-store" } as const;

// Zod validation schemas
const createPartSchema = z.object({
  partNumber: z.string().trim().min(2, "Part number is required").max(80),
  name: z.string().trim().min(2, "Name is required").max(180),
  manufacturer: z.string().trim().max(120).default("Generic OEM"),
  category: z.enum([
    "Batteries",
    "Electronics",
    "Motors & Actuators",
    "Tires & Casters",
    "Hardware & Cables",
    "Biomedical",
  ]).default("Hardware & Cables"),
  warehouseStock: z.number().int().min(0).default(0),
  minThreshold: z.number().int().min(0).default(5),
  unitCost: z.number().min(0).default(0),
  retailPrice: z.number().min(0).default(0),
  status: z.enum(["In Stock", "Low Stock", "Critical"]).default("In Stock"),
  assignToVan: z.boolean().default(false),
  vanName: z.string().trim().optional(),
  technicianName: z.string().trim().optional(),
  binLocation: z.string().trim().optional(),
  vanQty: z.number().int().min(0).default(0),
});

const updatePartSchema = z.object({
  id: z.string().min(1, "Part ID is required"),
  name: z.string().trim().min(2).max(180).optional(),
  manufacturer: z.string().trim().max(120).optional(),
  category: z.enum([
    "Batteries",
    "Electronics",
    "Motors & Actuators",
    "Tires & Casters",
    "Hardware & Cables",
    "Biomedical",
  ]).optional(),
  warehouseStock: z.number().int().min(0).optional(),
  minThreshold: z.number().int().min(0).optional(),
  unitCost: z.number().min(0).optional(),
  retailPrice: z.number().min(0).optional(),
  status: z.enum(["In Stock", "Low Stock", "Critical"]).optional(),
  // For van stock adjustments
  action: z.enum(["update_catalog", "adjust_van_stock", "transfer_van_stock"]).optional(),
  vanStockId: z.string().optional(),
  qtyChange: z.number().int().optional(),
});

async function getAuthenticatedUser(request: Request) {
  try {
    return await requirePortalRole(request, [
      "owner_administrator",
      "operations_administrator",
      "dispatcher",
      "biomedical_lead",
      "finance",
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
// 1. GET: Fetch master catalog, van stock, installed parts, and purchase orders
// ------------------------------------------------------------------------------
export async function GET(request: Request) {
  try {
    await getAuthenticatedUser(request);
    const url = new URL(request.url);
    const type = url.searchParams.get("type") || "all";
    const search = url.searchParams.get("search")?.trim().toLowerCase() || "";
    const category = url.searchParams.get("category") || "all";
    const vanId = url.searchParams.get("vanId") || "all";

    // 1. Catalog Parts
    let catalogQuery = `
      SELECT id, part_number AS partNumber, name, manufacturer, category,
             warehouse_stock AS warehouseStock, total_van_stock AS totalVanStock,
             min_threshold AS minThreshold, unit_cost AS unitCost, retail_price AS retailPrice,
             status, created_at AS createdAt, updated_at AS updatedAt
      FROM parts_catalog
      WHERE organization_id = ?
    `;
    const catalogBindings: unknown[] = [TECHFLEX_ORG_ID];
    if (category !== "all") {
      catalogQuery += " AND category = ?";
      catalogBindings.push(category);
    }
    if (search) {
      catalogQuery += " AND (lower(part_number) LIKE ? OR lower(name) LIKE ? OR lower(manufacturer) LIKE ?)";
      catalogBindings.push(`%${search}%`, `%${search}%`, `%${search}%`);
    }
    catalogQuery += " ORDER BY name ASC";

    const catalogRows = await env.DB.prepare(catalogQuery).bind(...catalogBindings).all();

    // 2. Van Stock Items
    let vanQuery = `
      SELECT id, van_id AS vanId, van_name AS vanName, technician_name AS technicianName,
             technician_id AS technicianId, part_id AS partId, part_number AS partNumber,
             name, category, qty_on_hand AS qtyOnHand, par_level AS parLevel,
             unit_cost AS unitCost, retail_price AS retailPrice, bin_location AS binLocation
      FROM van_stock
      WHERE organization_id = ?
    `;
    const vanBindings: unknown[] = [TECHFLEX_ORG_ID];
    if (vanId !== "all") {
      vanQuery += " AND van_id = ?";
      vanBindings.push(vanId);
    }
    if (category !== "all") {
      vanQuery += " AND category = ?";
      vanBindings.push(category);
    }
    if (search) {
      vanQuery += " AND (lower(part_number) LIKE ? OR lower(name) LIKE ? OR lower(technician_name) LIKE ?)";
      vanBindings.push(`%${search}%`, `%${search}%`, `%${search}%`);
    }
    vanQuery += " ORDER BY van_name ASC, bin_location ASC";
    const vanRows = await env.DB.prepare(vanQuery).bind(...vanBindings).all();

    // 3. Installed on Work Orders
    const installedRows = await env.DB.prepare(`
      SELECT id, work_order_id AS workOrderId, technician_name AS technicianName,
             equipment_model AS equipmentModel, serial_number AS serialNumber,
             part_number AS partNumber, part_name AS partName, qty, unit_price AS unitPrice,
             warranty_status AS warrantyStatus, installed_date AS installedDate
      FROM installed_parts
      WHERE organization_id = ?
      ORDER BY created_at DESC LIMIT 50
    `).bind(TECHFLEX_ORG_ID).all();

    // 4. Purchase Orders & RMAs
    const poRows = await env.DB.prepare(`
      SELECT id, po_number AS poNumber, vendor, part_number AS partNumber,
             part_name AS partName, qty, total_cost AS totalCost, status,
             tracking_number AS trackingNumber, order_date AS orderDate
      FROM parts_purchase_orders
      WHERE organization_id = ?
      ORDER BY created_at DESC LIMIT 50
    `).bind(TECHFLEX_ORG_ID).all();

    return Response.json(
      {
        success: true,
        catalog: catalogRows.results || [],
        vanStock: vanRows.results || [],
        installed: installedRows.results || [],
        purchaseOrders: poRows.results || [],
      },
      { headers: privateNoStore }
    );
  } catch (error) {
    return apiError(error);
  }
}

// ------------------------------------------------------------------------------
// 2. POST: Add a new part to master parts catalog
// ------------------------------------------------------------------------------
export async function POST(request: Request) {
  try {
    await getAuthenticatedUser(request);
    const body = await request.json();
    const input = createPartSchema.parse(body);

    const id = `cat-${crypto.randomUUID().slice(0, 8)}`;
    const normalizedPartNumber = input.partNumber.trim().toUpperCase();

    // Check duplicate part number
    const existing = await env.DB.prepare(
      "SELECT id FROM parts_catalog WHERE organization_id = ? AND part_number = ? LIMIT 1"
    ).bind(TECHFLEX_ORG_ID, normalizedPartNumber).first();

    if (existing) {
      return Response.json(
        { success: false, error: `Part number ${normalizedPartNumber} already exists in catalog.` },
        { status: 409 }
      );
    }

    await env.DB.prepare(`
      INSERT INTO parts_catalog (
        id, organization_id, part_number, name, manufacturer, category,
        warehouse_stock, total_van_stock, min_threshold, unit_cost, retail_price, status
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(
      id,
      TECHFLEX_ORG_ID,
      normalizedPartNumber,
      input.name.trim(),
      input.manufacturer.trim(),
      input.category,
      input.warehouseStock,
      input.vanQty || 0,
      input.minThreshold,
      input.unitCost,
      input.retailPrice,
      input.status
    ).run();

    // If assigned to a vehicle/technician, create van stock entry
    if (input.assignToVan && input.vanName && input.vanName.trim() && (input.vanQty || 0) > 0) {
      const vsId = `vs-${crypto.randomUUID().slice(0, 8)}`;
      const cleanVanId = `van-${input.vanName.trim().toLowerCase().replace(/[^a-z0-9]/g, "-")}`;
      await env.DB.prepare(`
        INSERT INTO van_stock (
          id, organization_id, van_id, van_name, technician_name, part_id,
          part_number, name, category, qty_on_hand, par_level, unit_cost, retail_price, bin_location
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).bind(
        vsId,
        TECHFLEX_ORG_ID,
        cleanVanId,
        input.vanName.trim(),
        input.technicianName?.trim() || "Service Technician",
        id,
        normalizedPartNumber,
        input.name.trim(),
        input.category,
        input.vanQty,
        Math.max(2, input.vanQty),
        input.unitCost,
        input.retailPrice,
        input.binLocation?.trim() || "BIN-A1"
      ).run();
    }

    const created = await env.DB.prepare(
      "SELECT * FROM parts_catalog WHERE id = ?"
    ).bind(id).first();

    return Response.json(
      {
        success: true,
        message: `Part ${normalizedPartNumber} created successfully`,
        part: created,
      },
      { status: 201, headers: privateNoStore }
    );
  } catch (error) {
    return apiError(error);
  }
}

// ------------------------------------------------------------------------------
// 3. PATCH: Update part catalog fields OR adjust technician van stock
// ------------------------------------------------------------------------------
export async function PATCH(request: Request) {
  try {
    await getAuthenticatedUser(request);
    const body = await request.json();
    const input = updatePartSchema.parse(body);

    // Sub-Action: Adjust Van Stock quantity
    if (input.action === "adjust_van_stock" && input.vanStockId && typeof input.qtyChange === "number") {
      const current = await env.DB.prepare(
        "SELECT id, qty_on_hand AS qtyOnHand, part_number AS partNumber FROM van_stock WHERE id = ? AND organization_id = ? LIMIT 1"
      ).bind(input.vanStockId, TECHFLEX_ORG_ID).first<{ id: string; qtyOnHand: number; partNumber: string }>();

      if (!current) {
        return Response.json({ success: false, error: "Van stock item not found" }, { status: 404 });
      }

      const nextQty = Math.max(0, current.qtyOnHand + input.qtyChange);
      await env.DB.prepare(
        "UPDATE van_stock SET qty_on_hand = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?"
      ).bind(nextQty, input.vanStockId).run();

      return Response.json(
        {
          success: true,
          message: `Van stock for ${current.partNumber} updated to ${nextQty}`,
          vanStockId: input.vanStockId,
          qtyOnHand: nextQty,
        },
        { headers: privateNoStore }
      );
    }

    // Default Action: Update Master Catalog item
    const updates: string[] = [];
    const bindings: unknown[] = [];

    if (input.name !== undefined) { updates.push("name = ?"); bindings.push(input.name.trim()); }
    if (input.manufacturer !== undefined) { updates.push("manufacturer = ?"); bindings.push(input.manufacturer.trim()); }
    if (input.category !== undefined) { updates.push("category = ?"); bindings.push(input.category); }
    if (input.warehouseStock !== undefined) { updates.push("warehouse_stock = ?"); bindings.push(input.warehouseStock); }
    if (input.minThreshold !== undefined) { updates.push("min_threshold = ?"); bindings.push(input.minThreshold); }
    if (input.unitCost !== undefined) { updates.push("unit_cost = ?"); bindings.push(input.unitCost); }
    if (input.retailPrice !== undefined) { updates.push("retail_price = ?"); bindings.push(input.retailPrice); }
    if (input.status !== undefined) { updates.push("status = ?"); bindings.push(input.status); }

    if (updates.length === 0) {
      return Response.json({ success: false, error: "No fields provided to update" }, { status: 400 });
    }

    updates.push("updated_at = CURRENT_TIMESTAMP");
    bindings.push(input.id, TECHFLEX_ORG_ID);

    const updateSql = `UPDATE parts_catalog SET ${updates.join(", ")} WHERE id = ? AND organization_id = ?`;
    await env.DB.prepare(updateSql).bind(...bindings).run();

    const updated = await env.DB.prepare("SELECT * FROM parts_catalog WHERE id = ?").bind(input.id).first();

    return Response.json(
      {
        success: true,
        message: "Catalog part updated successfully",
        part: updated,
      },
      { headers: privateNoStore }
    );
  } catch (error) {
    return apiError(error);
  }
}

// ------------------------------------------------------------------------------
// 4. DELETE: Remove part from master catalog
// ------------------------------------------------------------------------------
export async function DELETE(request: Request) {
  try {
    await getAuthenticatedUser(request);
    const url = new URL(request.url);
    const id = url.searchParams.get("id");

    if (!id) {
      return Response.json({ success: false, error: "Query parameter 'id' is required" }, { status: 400 });
    }

    // Verify part exists
    const existing = await env.DB.prepare(
      "SELECT id, part_number AS partNumber FROM parts_catalog WHERE id = ? AND organization_id = ? LIMIT 1"
    ).bind(id, TECHFLEX_ORG_ID).first<{ id: string; partNumber: string }>();

    if (!existing) {
      return Response.json({ success: false, error: "Part not found" }, { status: 404 });
    }

    // Delete part
    await env.DB.prepare(
      "DELETE FROM parts_catalog WHERE id = ? AND organization_id = ?"
    ).bind(id, TECHFLEX_ORG_ID).run();

    return Response.json(
      {
        success: true,
        message: `Part ${existing.partNumber} deleted successfully from master catalog`,
        id,
      },
      { headers: privateNoStore }
    );
  } catch (error) {
    return apiError(error);
  }
}

