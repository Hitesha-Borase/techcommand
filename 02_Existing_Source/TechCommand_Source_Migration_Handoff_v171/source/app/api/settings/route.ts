import { env } from "cloudflare:workers";
import { z } from "zod";
import { TECHFLEX_ORG_ID, apiError, requirePortalRole } from "@/lib/portal-auth";

const privateNoStore = { "Cache-Control": "private, no-store" } as const;

// Schema for updating settings
const updateSettingsSchema = z.object({
  companyName: z.string().trim().min(1).max(180).optional(),
  legalName: z.string().trim().max(180).optional(),
  taxId: z.string().trim().max(50).optional(),
  phone: z.string().trim().max(40).optional(),
  supportEmail: z.string().trim().email().optional(),
  billingEmail: z.string().trim().email().optional(),
  addressLine1: z.string().trim().max(180).optional(),
  addressLine2: z.string().trim().max(180).optional(),
  city: z.string().trim().max(80).optional(),
  state: z.string().trim().max(20).optional(),
  postalCode: z.string().trim().max(20).optional(),

  // Rate Cards
  standardLaborRate: z.coerce.number().min(0).optional(),
  biomedicalLaborRate: z.coerce.number().min(0).optional(),
  emergencyLaborRate: z.coerce.number().min(0).optional(),
  standardMileageRate: z.coerce.number().min(0).optional(),
  metroTripFee: z.coerce.number().min(0).optional(),
  extendedZoneFee: z.coerce.number().min(0).optional(),
  defaultPartsMarkup: z.coerce.number().min(0).optional(),
  minLaborHours: z.coerce.number().min(0).optional(),

  // Dispatch & Automation
  autoDispatchRadius: z.coerce.number().min(1).optional(),
  maxStopsPerTech: z.coerce.number().int().min(1).optional(),
  enableCustomerSms: z.boolean().optional(),
  enableAutoPdfInvoice: z.boolean().optional(),
  enableGeofenceArrival: z.boolean().optional(),
  slaWarningMinutes: z.coerce.number().int().min(1).optional(),

  // Security & Compliance
  timezone: z.string().optional(),
  sessionTimeoutHours: z.coerce.number().min(1).optional(),
  auditLogRetentionDays: z.coerce.number().min(1).optional(),
  require2faAdmins: z.boolean().optional(),
  enforce40PercentMarginFloor: z.boolean().optional(),
  requirePhotoAttestation: z.boolean().optional(),
  autoSyncQuickBooks: z.boolean().optional(),
});

async function getAuthenticatedUser(request: Request) {
  try {
    return await requirePortalRole(request, [
      "owner_administrator",
      "operations_administrator",
      "dispatcher",
      "biomedical_lead",
      "finance",
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
// 1. GET: Fetch tenant system settings and rate cards
// ------------------------------------------------------------------------------
export async function GET(request: Request) {
  try {
    await getAuthenticatedUser(request);

    let row = await env.DB.prepare(`
      SELECT id, organization_id, company_name, address, city, state, zip_code, phone, email,
             hub_latitude, hub_longitude, standard_hourly_rate, overtime_hourly_rate,
             weekend_hourly_rate, travel_mileage_rate, fixed_trip_fee,
             emergency_dispatch_surcharge, min_billable_hours, max_daily_route_miles,
             max_jobs_per_tech, origin_precedence, default_travel_buffer_minutes,
             require_photo_attestation, enforce_40_percent_margin_floor, auto_sync_quickbooks,
             custom_config_json, created_at, updated_at
      FROM system_settings
      WHERE organization_id = ?
      LIMIT 1
    `).bind(TECHFLEX_ORG_ID).first<Record<string, unknown>>();

    if (!row) {
      // Create initial settings if not present
      await env.DB.prepare(`
        INSERT INTO system_settings (
          id, organization_id, company_name, address, city, state, zip_code,
          phone, email, standard_hourly_rate, overtime_hourly_rate, weekend_hourly_rate,
          travel_mileage_rate, fixed_trip_fee, emergency_dispatch_surcharge,
          min_billable_hours, max_jobs_per_tech, require_photo_attestation,
          enforce_40_percent_margin_floor, auto_sync_quickbooks
        ) VALUES (
          'settings-1', ?, 'TechFlex Mobility Solutions LLC', '611 Park Meadow Road',
          'Westerville', 'OH', '43081', '(614) 890-7600', 'support@techflexmobility.com',
          85.0, 125.0, 145.0, 0.65, 45.0, 75.0, 1.0, 6, 1, 1, 0
        )
      `).bind(TECHFLEX_ORG_ID).run();

      row = await env.DB.prepare(`
        SELECT * FROM system_settings WHERE organization_id = ? LIMIT 1
      `).bind(TECHFLEX_ORG_ID).first<Record<string, unknown>>();
    }

    let customConfig: Record<string, unknown> = {};
    if (typeof row?.custom_config_json === "string" && row.custom_config_json.trim()) {
      try {
        customConfig = JSON.parse(row.custom_config_json);
      } catch {
        customConfig = {};
      }
    }

    const payload = {
      id: row?.id ?? "settings-1",
      organizationId: TECHFLEX_ORG_ID,

      // Profile
      companyName: String(row?.company_name || "TechFlex Mobility Solutions LLC"),
      legalName: String(customConfig.legalName || "TechFlex Medical Services Group LLC"),
      taxId: String(customConfig.taxId || "84-2910482"),
      phone: String(row?.phone || "(614) 890-7600"),
      supportEmail: String(row?.email || "support@techflexmobility.com"),
      billingEmail: String(customConfig.billingEmail || "billing@techflexmobility.com"),
      addressLine1: String(row?.address || "611 Park Meadow Road"),
      addressLine2: String(customConfig.addressLine2 || "Suite B"),
      city: String(row?.city || "Westerville"),
      state: String(row?.state || "OH"),
      postalCode: String(row?.zip_code || "43081"),

      // Rate Cards
      standardLaborRate: Number(row?.standard_hourly_rate ?? 85.0).toFixed(2),
      biomedicalLaborRate: Number(row?.overtime_hourly_rate ?? 125.0).toFixed(2),
      emergencyLaborRate: Number(row?.weekend_hourly_rate ?? 145.0).toFixed(2),
      standardMileageRate: Number(row?.travel_mileage_rate ?? 0.65).toFixed(2),
      metroTripFee: Number(row?.fixed_trip_fee ?? 45.0).toFixed(2),
      extendedZoneFee: Number(row?.emergency_dispatch_surcharge ?? 75.0).toFixed(2),
      defaultPartsMarkup: String(customConfig.defaultPartsMarkup ?? "35.0"),
      minLaborHours: Number(row?.min_billable_hours ?? 1.0).toFixed(1),

      // Dispatch & Automation
      autoDispatchRadius: String(customConfig.autoDispatchRadius ?? "35"),
      maxStopsPerTech: String(row?.max_jobs_per_tech ?? "6"),
      enableCustomerSms: customConfig.enableCustomerSms !== false,
      enableAutoPdfInvoice: customConfig.enableAutoPdfInvoice !== false,
      enableGeofenceArrival: customConfig.enableGeofenceArrival !== false,
      slaWarningMinutes: String(customConfig.slaWarningMinutes ?? "30"),

      // Security
      timezone: String(customConfig.timezone || "America/New_York"),
      sessionTimeoutHours: String(customConfig.sessionTimeoutHours ?? "8"),
      auditLogRetentionDays: String(customConfig.auditLogRetentionDays ?? "365"),
      require2faAdmins: Boolean(customConfig.require2faAdmins ?? false),

      // Compliance
      enforce40PercentMarginFloor: Boolean(row?.enforce_40_percent_margin_floor ?? 1),
      requirePhotoAttestation: Boolean(row?.require_photo_attestation ?? 1),
      autoSyncQuickBooks: Boolean(row?.auto_sync_quickbooks ?? 0),

      updatedAt: String(row?.updated_at || new Date().toISOString()),
    };

    return Response.json(
      {
        success: true,
        settings: payload,
      },
      { headers: privateNoStore },
    );
  } catch (error) {
    return apiError(error);
  }
}

// ------------------------------------------------------------------------------
// 2. PATCH: Update system settings and rate cards
// ------------------------------------------------------------------------------
export async function PATCH(request: Request) {
  try {
    const user = await getAuthenticatedUser(request);
    const body = (await request.json()) as unknown;
    const parsed = updateSettingsSchema.safeParse(body);

    if (!parsed.success) {
      return Response.json(
        {
          error: "Invalid settings payload",
          details: parsed.error.flatten().fieldErrors,
        },
        { status: 400, headers: privateNoStore },
      );
    }

    const data = parsed.data;

    // Fetch existing settings
    const existing = await env.DB.prepare(`
      SELECT * FROM system_settings WHERE organization_id = ? LIMIT 1
    `).bind(TECHFLEX_ORG_ID).first<Record<string, unknown>>();

    let customConfig: Record<string, unknown> = {};
    if (typeof existing?.custom_config_json === "string" && existing.custom_config_json.trim()) {
      try {
        customConfig = JSON.parse(existing.custom_config_json);
      } catch {
        customConfig = {};
      }
    }

    // Merge custom config keys
    if (data.legalName !== undefined) customConfig.legalName = data.legalName;
    if (data.taxId !== undefined) customConfig.taxId = data.taxId;
    if (data.billingEmail !== undefined) customConfig.billingEmail = data.billingEmail;
    if (data.addressLine2 !== undefined) customConfig.addressLine2 = data.addressLine2;
    if (data.defaultPartsMarkup !== undefined) customConfig.defaultPartsMarkup = data.defaultPartsMarkup;
    if (data.autoDispatchRadius !== undefined) customConfig.autoDispatchRadius = data.autoDispatchRadius;
    if (data.enableCustomerSms !== undefined) customConfig.enableCustomerSms = data.enableCustomerSms;
    if (data.enableAutoPdfInvoice !== undefined) customConfig.enableAutoPdfInvoice = data.enableAutoPdfInvoice;
    if (data.enableGeofenceArrival !== undefined) customConfig.enableGeofenceArrival = data.enableGeofenceArrival;
    if (data.slaWarningMinutes !== undefined) customConfig.slaWarningMinutes = data.slaWarningMinutes;
    if (data.timezone !== undefined) customConfig.timezone = data.timezone;
    if (data.sessionTimeoutHours !== undefined) customConfig.sessionTimeoutHours = data.sessionTimeoutHours;
    if (data.auditLogRetentionDays !== undefined) customConfig.auditLogRetentionDays = data.auditLogRetentionDays;
    if (data.require2faAdmins !== undefined) customConfig.require2faAdmins = data.require2faAdmins;

    // Compute updated values for standard DB columns
    const companyName = data.companyName ?? existing?.company_name ?? "TechFlex Mobility Solutions LLC";
    const address = data.addressLine1 ?? existing?.address ?? "611 Park Meadow Road";
    const city = data.city ?? existing?.city ?? "Westerville";
    const state = data.state ?? existing?.state ?? "OH";
    const zipCode = data.postalCode ?? existing?.zip_code ?? "43081";
    const phone = data.phone ?? existing?.phone ?? "(614) 890-7600";
    const email = data.supportEmail ?? existing?.email ?? "support@techflexmobility.com";

    const standardHourlyRate = data.standardLaborRate ?? existing?.standard_hourly_rate ?? 85.0;
    const overtimeHourlyRate = data.biomedicalLaborRate ?? existing?.overtime_hourly_rate ?? 125.0;
    const weekendHourlyRate = data.emergencyLaborRate ?? existing?.weekend_hourly_rate ?? 145.0;
    const travelMileageRate = data.standardMileageRate ?? existing?.travel_mileage_rate ?? 0.65;
    const fixedTripFee = data.metroTripFee ?? existing?.fixed_trip_fee ?? 45.0;
    const emergencyDispatchSurcharge = data.extendedZoneFee ?? existing?.emergency_dispatch_surcharge ?? 75.0;
    const minBillableHours = data.minLaborHours ?? existing?.min_billable_hours ?? 1.0;
    const maxJobsPerTech = data.maxStopsPerTech ?? existing?.max_jobs_per_tech ?? 6;

    const enforceMargin = data.enforce40PercentMarginFloor !== undefined
      ? (data.enforce40PercentMarginFloor ? 1 : 0)
      : (existing?.enforce_40_percent_margin_floor ?? 1);

    const requireAttestation = data.requirePhotoAttestation !== undefined
      ? (data.requirePhotoAttestation ? 1 : 0)
      : (existing?.require_photo_attestation ?? 1);

    const autoSyncQb = data.autoSyncQuickBooks !== undefined
      ? (data.autoSyncQuickBooks ? 1 : 0)
      : (existing?.auto_sync_quickbooks ?? 0);

    const customConfigJson = JSON.stringify(customConfig);

    await env.DB.prepare(`
      UPDATE system_settings
      SET company_name = ?,
          address = ?,
          city = ?,
          state = ?,
          zip_code = ?,
          phone = ?,
          email = ?,
          standard_hourly_rate = ?,
          overtime_hourly_rate = ?,
          weekend_hourly_rate = ?,
          travel_mileage_rate = ?,
          fixed_trip_fee = ?,
          emergency_dispatch_surcharge = ?,
          min_billable_hours = ?,
          max_jobs_per_tech = ?,
          enforce_40_percent_margin_floor = ?,
          require_photo_attestation = ?,
          auto_sync_quickbooks = ?,
          custom_config_json = ?,
          updated_at = datetime('now')
      WHERE organization_id = ?
    `).bind(
      companyName,
      address,
      city,
      state,
      zipCode,
      phone,
      email,
      standardHourlyRate,
      overtimeHourlyRate,
      weekendHourlyRate,
      travelMileageRate,
      fixedTripFee,
      emergencyDispatchSurcharge,
      minBillableHours,
      maxJobsPerTech,
      enforceMargin,
      requireAttestation,
      autoSyncQb,
      customConfigJson,
      TECHFLEX_ORG_ID,
    ).run();

    return Response.json(
      {
        success: true,
        message: "System settings updated successfully",
        updatedBy: user.displayName,
      },
      { headers: privateNoStore },
    );
  } catch (error) {
    return apiError(error);
  }
}
