import { env } from "cloudflare:workers";
import {
  TECHFLEX_ORG_ID,
  apiError,
  requirePortalRole,
} from "@/lib/portal-auth";
import {
  geographicCoverage,
  type CoverageTechnician,
  type CoverageTrack,
} from "@/lib/workforce-coverage";

const adminRoles = [
  "owner_administrator",
  "operations_administrator",
  "dispatcher",
  "biomedical_lead",
  "finance",
] as const;

const privateNoStore = { "Cache-Control": "private, no-store" } as const;

type NumberRow = Record<string, number | string | null>;
type CoverageLocationQueryRow = NumberRow & {
  locationId: string;
  track: string | null;
  latitude: number | null;
  longitude: number | null;
};

function businessDate(date = new Date()) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const part = (type: string) =>
    parts.find((item) => item.type === type)?.value || "00";
  return `${part("year")}-${part("month")}-${part("day")}`;
}

function number(row: NumberRow, key: string) {
  return Number(row[key] || 0);
}

export async function GET(request: Request) {
  try {
    await requirePortalRole(request, [...adminRoles]);
    const today = businessDate();
    const [
      workOrderResult,
      todayResult,
      pmResult,
      workforceResult,
      financeResult,
      payrollResult,
      intakeResult,
      integrationResult,
      feedbackResult,
      taskResult,
      dataQualityResult,
      activeOrdersResult,
      routesResult,
      coverageTrackResult,
      coverageLocationResult,
      coverageTechnicianResult,
    ] = await env.DB.batch([
      env.DB.prepare(
        `SELECT
          COUNT(CASE WHEN status NOT IN ('paid','cancelled','closed') THEN 1 END) AS openCount,
          COUNT(CASE WHEN status NOT IN ('paid','cancelled','closed') AND
            (status = 'pricing_review' OR
             (accepted_price_cents > 0 AND estimated_cost_cents IS NOT NULL AND
              (accepted_price_cents - estimated_cost_cents) * 10000 < accepted_price_cents * 4000))
            THEN 1 END) AS marginBlockedCount,
          COUNT(CASE WHEN status NOT IN ('paid','cancelled','closed')
            AND accepted_price_cents > 0 AND estimated_cost_cents IS NULL
            THEN 1 END) AS pricingIncompleteCount,
          COUNT(CASE WHEN status = 'ready_to_assign' THEN 1 END) AS unassignedCount,
          COUNT(CASE WHEN EXISTS(SELECT 1 FROM service_reports sr WHERE sr.work_order_id=w.id AND sr.submitted_at IS NOT NULL AND sr.qa_reviewed_at IS NULL) THEN 1 END) AS qaCount,
          COUNT(CASE WHEN status = 'ready_to_invoice' THEN 1 END) AS invoiceReadyCount,
          COUNT(CASE WHEN status NOT IN ('paid','cancelled','closed')
            AND opened_at < datetime('now', '-7 days') THEN 1 END) AS agedOpenCount,
          COALESCE(SUM(CASE WHEN status NOT IN ('paid','cancelled','closed')
            AND accepted_price_cents > 0 AND estimated_cost_cents IS NOT NULL
            THEN accepted_price_cents ELSE 0 END), 0) AS activeRevenueCents,
          COALESCE(SUM(CASE WHEN status NOT IN ('paid','cancelled','closed')
            AND accepted_price_cents > 0 AND estimated_cost_cents IS NOT NULL
            THEN estimated_cost_cents ELSE 0 END), 0) AS activeCostCents
         FROM work_orders w
        WHERE w.organization_id = ? AND EXISTS (
          SELECT 1 FROM accounts a JOIN locations l ON l.id=w.location_id AND l.account_id=a.id
           WHERE a.id=w.account_id AND a.organization_id=w.organization_id
        )`,
      ).bind(TECHFLEX_ORG_ID),
      env.DB.prepare(
        `SELECT COUNT(DISTINCT r.id) AS routeCount,
                COUNT(DISTINCT r.technician_id) AS routedTechnicianCount,
                COUNT(rs.id) AS stopCount,
                COALESCE(SUM(CASE WHEN rs.leg_miles IS NOT NULL THEN rs.leg_miles ELSE 0 END), 0) AS verifiedMiles,
                COUNT(CASE WHEN rs.leg_miles IS NULL OR rs.drive_minutes IS NULL THEN 1 END) AS missingTravelCount
           FROM routes r LEFT JOIN route_stops rs ON rs.route_id = r.id
          WHERE r.organization_id = ? AND r.route_date = ?`,
      ).bind(TECHFLEX_ORG_ID, today),
      env.DB.prepare(
        `SELECT COUNT(*) AS totalCount,
                COUNT(CASE WHEN p.next_due_on < ? THEN 1 END) AS overdueCount,
                COUNT(CASE WHEN p.next_due_on BETWEEN ? AND date(?, '+30 days') THEN 1 END) AS due30Count,
                COUNT(CASE WHEN p.next_due_on > date(?, '+30 days') AND p.next_due_on <= date(?, '+90 days') THEN 1 END) AS due90Count
           FROM pm_plans p JOIN assets s ON s.id = p.asset_id
          WHERE s.organization_id = ? AND p.status = 'active' AND s.status != 'retired'`,
      ).bind(today, today, today, today, today, TECHFLEX_ORG_ID),
      env.DB.prepare(
        `SELECT COUNT(*) AS activeCount,
                COUNT(CASE WHEN user_id IS NOT NULL THEN 1 END) AS loginLinkedCount,
                COUNT(CASE WHEN home_latitude IS NULL OR home_longitude IS NULL THEN 1 END) AS missingCoordinatesCount,
                COUNT(CASE WHEN
                  (SELECT COUNT(*) FROM service_reports sr WHERE sr.technician_id=technicians.id AND sr.qa_status IN ('approved','returned','changes_requested') AND date(COALESCE(sr.qa_reviewed_at,sr.updated_at))>=date('now','-90 days')) >= 5
                  AND
                  (SELECT COUNT(*) FROM service_reports sr WHERE sr.technician_id=technicians.id AND sr.qa_status='approved' AND date(COALESCE(sr.qa_reviewed_at,sr.updated_at))>=date('now','-90 days')) * 100
                  <
                  (SELECT COUNT(*) FROM service_reports sr WHERE sr.technician_id=technicians.id AND sr.qa_status IN ('approved','returned','changes_requested') AND date(COALESCE(sr.qa_reviewed_at,sr.updated_at))>=date('now','-90 days')) * CASE WHEN current_hourly_rate_cents>=3500 THEN 95 ELSE 80 END
                  THEN 1 END) AS compensationReviewCount
           FROM technicians WHERE organization_id = ? AND status = 'active'`,
      ).bind(TECHFLEX_ORG_ID),
      env.DB.prepare(
        `SELECT COUNT(CASE WHEN balance_cents > 0 THEN 1 END) AS openInvoiceCount,
                COALESCE(SUM(CASE WHEN balance_cents > 0 THEN balance_cents ELSE 0 END), 0) AS openBalanceCents,
                COUNT(CASE WHEN balance_cents > 0 AND due_on < ? THEN 1 END) AS overdueInvoiceCount,
                COALESCE(SUM(CASE WHEN balance_cents > 0 AND due_on < ? THEN balance_cents ELSE 0 END), 0) AS overdueBalanceCents
           FROM invoices WHERE organization_id = ?`,
      ).bind(today, today, TECHFLEX_ORG_ID),
      env.DB.prepare(
        `SELECT COALESCE(SUM(CASE WHEN p.status IN ('approved','included_in_stub') THEN p.payout_cents ELSE 0 END), 0) AS approvedPayCents,
                COALESCE(SUM(CASE WHEN p.collection_status = 'funds_received' AND p.status != 'paid' THEN p.payout_cents ELSE 0 END), 0) AS collectedUnpaidCents,
                COUNT(CASE WHEN p.collection_status = 'funds_received' AND p.status != 'paid' THEN 1 END) AS collectedUnpaidCount
           FROM technician_payouts p
           JOIN technicians t ON t.id=p.technician_id AND t.organization_id=?
           JOIN work_orders w ON w.id=p.work_order_id AND w.organization_id=?
           JOIN accounts a ON a.id=w.account_id AND a.organization_id=?
           LEFT JOIN invoices i ON i.id=p.invoice_id AND i.organization_id=?
          WHERE p.invoice_id IS NULL OR i.id IS NOT NULL`,
      ).bind(TECHFLEX_ORG_ID, TECHFLEX_ORG_ID, TECHFLEX_ORG_ID, TECHFLEX_ORG_ID),
      env.DB.prepare(
        `SELECT COUNT(CASE WHEN status IN ('needs_information','ready_for_review') THEN 1 END) AS openCount,
                COUNT(CASE WHEN status IN ('needs_information','ready_for_review')
                  AND response_due_at IS NOT NULL AND response_due_at < CURRENT_TIMESTAMP THEN 1 END) AS overdueCount,
                COUNT(CASE WHEN status = 'needs_information' THEN 1 END) AS incompleteCount
           FROM work_order_intakes WHERE organization_id = ?`,
      ).bind(TECHFLEX_ORG_ID),
      env.DB.prepare(
        `SELECT COUNT(CASE WHEN status IN ('retry','failed') THEN 1 END) AS failedCount,
                COUNT(CASE WHEN status IN ('pending','processing') THEN 1 END) AS pendingCount,
                MIN(CASE WHEN status IN ('pending','retry','failed') THEN created_at END) AS oldestOpenAt
           FROM integration_events WHERE organization_id = ?`,
      ).bind(TECHFLEX_ORG_ID),
      env.DB.prepare(
        `SELECT COUNT(CASE WHEN status = 'blocked_missing_information' THEN 1 END) AS blockedCount,
                COUNT(CASE WHEN status IN ('queued','admin_action_required') THEN 1 END) AS actionCount,
                COUNT(CASE WHEN status IN ('sent','enrolled') THEN 1 END) AS completedCount
           FROM customer_feedback_requests WHERE organization_id = ?`,
      ).bind(TECHFLEX_ORG_ID),
      env.DB.prepare(
        `SELECT COUNT(*) AS openCount,
                COUNT(CASE WHEN priority = 'urgent' THEN 1 END) AS urgentCount,
                COUNT(CASE WHEN due_at IS NOT NULL AND due_at < CURRENT_TIMESTAMP THEN 1 END) AS overdueCount
           FROM admin_tasks WHERE organization_id = ? AND status IN ('open','in_progress')`,
      ).bind(TECHFLEX_ORG_ID),
      env.DB.prepare(
        `SELECT
          (SELECT COUNT(*) FROM assets WHERE organization_id = ? AND status != 'retired'
            AND (serial_number IS NULL OR trim(serial_number) = '')) AS assetsMissingSerial,
          (SELECT COUNT(*) FROM locations l JOIN accounts a ON a.id = l.account_id
            WHERE a.organization_id = ? AND l.status = 'active'
              AND (l.latitude IS NULL OR l.longitude IS NULL)) AS locationsMissingCoordinates,
          (SELECT COUNT(*) FROM customers WHERE organization_id = ? AND status = 'active'
            AND ((email IS NULL OR trim(email) = '') OR (phone IS NULL OR trim(phone) = ''))) AS customersMissingContact,
          (SELECT COUNT(*) FROM accounts WHERE organization_id = ? AND status = 'active'
            AND (billing_email IS NULL OR trim(billing_email) = '')) AS accountsMissingBillingEmail`,
      ).bind(TECHFLEX_ORG_ID, TECHFLEX_ORG_ID, TECHFLEX_ORG_ID, TECHFLEX_ORG_ID),
      env.DB.prepare(
        `SELECT w.id, COALESCE(w.external_id, w.id) AS externalId,
                COALESCE(w.external_source, 'manual') AS externalSource,
                w.service_type AS serviceType, w.summary, w.priority, w.status,
                w.scheduled_start AS scheduledStart,
                COALESCE(w.accepted_price_cents, 0) AS acceptedPriceCents,
                w.estimated_cost_cents AS estimatedCostCents,
                w.gross_margin_basis_points AS grossMarginBasisPoints,
                w.required_technician_count AS requiredTechnicianCount,
                a.name AS accountName, l.name AS locationName, l.city, l.state,
                (SELECT COUNT(*) FROM work_order_assignments wa
                  WHERE wa.work_order_id = w.id AND wa.status IN
                    ('offered','assigned','accepted','dispatched','arrived','submitted')) AS assignedCount,
                (SELECT group_concat(name, ', ') FROM (
                  SELECT COALESCE(u.display_name, t.technician_code) AS name
                    FROM work_order_assignments wa JOIN technicians t ON t.id = wa.technician_id AND t.organization_id=w.organization_id
                    LEFT JOIN users u ON u.id = t.user_id
                   WHERE wa.work_order_id = w.id AND wa.status IN
                    ('offered','assigned','accepted','dispatched','arrived','submitted')
                   ORDER BY CASE wa.role WHEN 'primary' THEN 1 ELSE 2 END, name
                )) AS technicianNames
           FROM work_orders w JOIN accounts a ON a.id = w.account_id AND a.organization_id=w.organization_id
           JOIN locations l ON l.id = w.location_id AND l.account_id=a.id
          WHERE w.organization_id = ? AND w.status NOT IN ('paid','cancelled','closed')
          ORDER BY CASE w.status
            WHEN 'pricing_review' THEN 1 WHEN 'technician_submitted' THEN 2
            WHEN 'ready_to_assign' THEN 3 WHEN 'in_progress' THEN 4
            WHEN 'ready_to_invoice' THEN 5 ELSE 6 END,
            CASE WHEN w.scheduled_start IS NULL THEN 1 ELSE 0 END,
            w.scheduled_start, w.opened_at
          LIMIT 20`,
      ).bind(TECHFLEX_ORG_ID),
      env.DB.prepare(
        `SELECT r.id, r.status, r.total_miles AS totalMiles,
                r.total_drive_minutes AS totalDriveMinutes,
                COALESCE(u.display_name, t.technician_code) AS technicianName,
                t.technician_code AS technicianCode, t.home_postal_code AS homePostalCode,
                COUNT(rs.id) AS stopCount,
                COUNT(CASE WHEN rs.leg_miles IS NULL OR rs.drive_minutes IS NULL THEN 1 END) AS missingTravelCount,
                MIN(rs.planned_arrival) AS firstStopAt,
                MAX(rs.planned_departure) AS lastStopAt
           FROM routes r JOIN technicians t ON t.id = r.technician_id AND t.organization_id=r.organization_id
           LEFT JOIN users u ON u.id = t.user_id LEFT JOIN route_stops rs ON rs.route_id = r.id
          WHERE r.organization_id = ? AND r.route_date = ?
          GROUP BY r.id, r.status, r.total_miles, r.total_drive_minutes,
                   u.display_name, t.technician_code, t.home_postal_code
          ORDER BY firstStopAt, technicianName`,
      ).bind(TECHFLEX_ORG_ID, today),
      env.DB.prepare(
        `SELECT
          CASE WHEN w.service_type LIKE 'biomed_%' OR a.service_discipline='biomedical'
            THEN 'biomedical' ELSE 'dme_mobility' END AS track,
          COUNT(CASE WHEN w.status NOT IN ('paid','cancelled','closed') THEN 1 END) AS openWork,
          COUNT(CASE WHEN w.status NOT IN ('paid','cancelled','closed')
            AND date(w.scheduled_start) BETWEEN date('now') AND date('now','+30 days') THEN 1 END) AS scheduled30,
          COUNT(CASE WHEN w.status NOT IN ('paid','cancelled','closed')
            AND NOT EXISTS (SELECT 1 FROM work_order_assignments wa
              JOIN technicians at ON at.id=wa.technician_id AND at.organization_id=w.organization_id
             WHERE wa.work_order_id=w.id AND wa.status IN
              ('offered','assigned','accepted','dispatched','arrived','submitted')) THEN 1 END) AS unassigned,
          COUNT(CASE WHEN w.status IN ('paid','closed')
            AND date(COALESCE(w.completed_at,w.updated_at))>=date('now','-90 days') THEN 1 END) AS completed90
         FROM work_orders w JOIN accounts a ON a.id=w.account_id AND a.organization_id=w.organization_id
         JOIN locations l ON l.id=w.location_id AND l.account_id=a.id
        WHERE w.organization_id=?
        GROUP BY track`,
      ).bind(TECHFLEX_ORG_ID),
      env.DB.prepare(
        `SELECT l.id AS locationId,a.name AS accountName,l.name AS locationName,
                l.city,l.state,l.latitude,l.longitude,
                CASE WHEN a.service_discipline='biomedical'
                  OR EXISTS(SELECT 1 FROM assets x WHERE x.organization_id=a.organization_id AND x.location_id=l.id AND x.status NOT IN ('retired','removed','inventory_reference'))
                  OR EXISTS(SELECT 1 FROM work_orders bw WHERE bw.organization_id=a.organization_id AND bw.location_id=l.id AND bw.service_type LIKE 'biomed_%')
                  THEN 'biomedical'
                  WHEN a.service_discipline='dme_mobility'
                    OR EXISTS(SELECT 1 FROM work_orders dw WHERE dw.organization_id=a.organization_id AND dw.location_id=l.id AND dw.service_type NOT LIKE 'biomed_%')
                  THEN 'dme_mobility' ELSE NULL END AS track,
                (SELECT COUNT(*) FROM work_orders ow WHERE ow.organization_id=a.organization_id AND ow.location_id=l.id AND ow.status NOT IN ('paid','cancelled','closed')) AS openWork,
                (SELECT COUNT(*) FROM work_orders sw WHERE sw.organization_id=a.organization_id AND sw.location_id=l.id AND sw.status NOT IN ('paid','cancelled','closed') AND date(sw.scheduled_start) BETWEEN date('now') AND date('now','+30 days')) AS scheduled30,
                (SELECT COUNT(*) FROM work_orders uw WHERE uw.organization_id=a.organization_id AND uw.location_id=l.id AND uw.status NOT IN ('paid','cancelled','closed') AND NOT EXISTS(SELECT 1 FROM work_order_assignments wa JOIN technicians at ON at.id=wa.technician_id AND at.organization_id=uw.organization_id WHERE wa.work_order_id=uw.id AND wa.status IN ('offered','assigned','accepted','dispatched','arrived','submitted'))) AS unassigned,
                (SELECT COUNT(*) FROM work_orders cw WHERE cw.organization_id=a.organization_id AND cw.location_id=l.id AND cw.status IN ('paid','closed') AND date(COALESCE(cw.completed_at,cw.updated_at))>=date('now','-90 days')) AS completed90,
                (SELECT COUNT(*) FROM assets x WHERE x.organization_id=a.organization_id AND x.location_id=l.id AND x.status NOT IN ('retired','removed','inventory_reference')) AS activeAssets,
                (SELECT COUNT(*) FROM pm_plans p JOIN assets x ON x.id=p.asset_id AND x.organization_id=a.organization_id AND x.location_id=l.id WHERE p.status='active' AND p.next_due_on<=date('now','+90 days') AND x.status NOT IN ('retired','removed','inventory_reference')) AS pmDue90
           FROM locations l JOIN accounts a ON a.id=l.account_id
          WHERE a.organization_id=? AND a.status='active' AND l.status='active'
            AND (a.service_discipline IN ('biomedical','dme_mobility')
              OR EXISTS(SELECT 1 FROM work_orders ew WHERE ew.organization_id=a.organization_id AND ew.location_id=l.id)
              OR EXISTS(SELECT 1 FROM assets ex WHERE ex.organization_id=a.organization_id AND ex.location_id=l.id AND ex.status NOT IN ('retired','removed','inventory_reference')))
          ORDER BY openWork DESC,pmDue90 DESC,accountName,locationName`,
      ).bind(TECHFLEX_ORG_ID),
      env.DB.prepare(
        `SELECT id,service_disciplines_json AS disciplines,
                COALESCE(dispatch_latitude,home_latitude) AS latitude,
                COALESCE(dispatch_longitude,home_longitude) AS longitude,
                max_radius_miles AS maxRadiusMiles
           FROM technicians WHERE organization_id=? AND status='active'`,
      ).bind(TECHFLEX_ORG_ID),
    ]);

    const workOrders = (workOrderResult.results[0] || {}) as NumberRow;
    const todayPlan = (todayResult.results[0] || {}) as NumberRow;
    const pm = (pmResult.results[0] || {}) as NumberRow;
    const workforce = (workforceResult.results[0] || {}) as NumberRow;
    const finance = (financeResult.results[0] || {}) as NumberRow;
    const payroll = (payrollResult.results[0] || {}) as NumberRow;
    const intake = (intakeResult.results[0] || {}) as NumberRow;
    const integrations = (integrationResult.results[0] || {}) as NumberRow;
    const feedback = (feedbackResult.results[0] || {}) as NumberRow;
    const tasks = (taskResult.results[0] || {}) as NumberRow;
    const dataQuality = (dataQualityResult.results[0] || {}) as NumberRow;
    const coverageTechnicians = coverageTechnicianResult.results as unknown as CoverageTechnician[];
    const coverageLocations = (coverageLocationResult.results as unknown as CoverageLocationQueryRow[])
      .filter((row) => row.track === "biomedical" || row.track === "dme_mobility")
      .map((row) => ({
        ...row,
        ...geographicCoverage(
          {
            locationId: String(row.locationId),
            track: row.track as CoverageTrack,
            latitude: row.latitude === null ? null : Number(row.latitude),
            longitude: row.longitude === null ? null : Number(row.longitude),
          },
          coverageTechnicians,
        ),
      }));
    const trackRows = new Map(
      (coverageTrackResult.results as unknown as NumberRow[]).map((row) => [String(row.track), row]),
    );
    const coverageTracks = (["biomedical", "dme_mobility"] as const).map(
      (track) => {
        const row = (trackRows.get(track) || {}) as NumberRow;
        const technicians = coverageTechnicians.filter((technician) => {
          try {
            return JSON.parse(technician.disciplines || "[]").includes(track);
          } catch {
            return false;
          }
        });
        return {
          track,
          activeTechnicians: technicians.length,
          originsReady: technicians.filter(
            (technician) =>
              technician.latitude !== null && technician.longitude !== null,
          ).length,
          openWork: number(row, "openWork"),
          scheduled30: number(row, "scheduled30"),
          unassigned: number(row, "unassigned"),
          completed90: number(row, "completed90"),
        };
      },
    );
    const activeRevenueCents = number(workOrders, "activeRevenueCents");
    const activeCostCents = number(workOrders, "activeCostCents");
    const projectedMarginBps =
      activeRevenueCents > 0
        ? Math.floor(
            ((activeRevenueCents - activeCostCents) * 10000) /
              activeRevenueCents,
          )
        : null;

    const attention: Array<{
      id: string;
      title: string;
      detail: string;
      count: number;
      severity: "urgent" | "high" | "normal";
      module: string;
    }> = [];
    const addAttention = (
      id: string,
      count: number,
      title: string,
      detail: string,
      severity: "urgent" | "high" | "normal",
      module: string,
    ) => {
      if (count > 0)
        attention.push({ id, count, title, detail, severity, module });
    };
    addAttention(
      "margin-gate",
      number(workOrders, "marginBlockedCount"),
      "Pricing cannot clear the 40% margin floor",
      "Review the required counteroffer before dispatch.",
      "urgent",
      "work-orders",
    );
    addAttention(
      "pricing-cost-basis",
      number(workOrders, "pricingIncompleteCount"),
      "Accepted pricing is missing its cost basis",
      "Add direct costs before the margin can be trusted or dispatched.",
      "urgent",
      "work-orders",
    );
    addAttention(
      "intake-overdue",
      number(intake, "overdueCount"),
      "External intake deadlines are overdue",
      "Complete or disposition the held intake records.",
      "urgent",
      "work-orders",
    );
    addAttention(
      "crew-gap",
      number(workOrders, "unassignedCount"),
      "Work orders need technician coverage",
      "Assign the full required crew before scheduling.",
      "urgent",
      "dispatch",
    );
    addAttention(
      "qa-review",
      number(workOrders, "qaCount"),
      "Submissions are available in the administrator inbox",
      "Optional review only; field completion does not wait for approval.",
      "normal",
      "work-orders",
    );
    addAttention(
      "invoice-ready",
      number(workOrders, "invoiceReadyCount"),
      "Approved jobs are ready for invoice handling",
      "Review the generated packet and collection status.",
      "high",
      "finance",
    );
    addAttention(
      "overdue-ar",
      number(finance, "overdueInvoiceCount"),
      "Customer invoices are past due",
      "Follow up on the outstanding balance and record payment.",
      "high",
      "finance",
    );
    addAttention(
      "pm-overdue",
      number(pm, "overdueCount"),
      "Biomedical PM is overdue",
      "Schedule the affected assets and facilities.",
      "urgent",
      "assets",
    );
    // Credential evidence and CEUs belong to an explicitly requested career
    // review, not the routine operational queue. Keep saved evidence unchanged.
    addAttention(
      "compensation-review",
      number(workforce, "compensationReviewCount"),
      "Technician rate maintenance needs review",
      "Open the compensation scorecard; approved rates are never reduced automatically.",
      "high",
      "technicians",
    );
    addAttention(
      "sync-failures",
      number(integrations, "failedCount"),
      "Integration events need retry",
      "The event remains stored; resolve configuration and retry safely.",
      "high",
      "finance",
    );
    addAttention(
      "feedback-blocked",
      number(feedback, "blockedCount"),
      "Customer follow-up is missing required information",
      "Add the destination or Google review link before sending.",
      "normal",
      "finance",
    );
    addAttention(
      "route-travel",
      number(todayPlan, "missingTravelCount"),
      "Today’s route has unverified travel data",
      "Enter road miles and drive time before relying on route totals.",
      "high",
      "dispatch",
    );

    const severityOrder = { urgent: 1, high: 2, normal: 3 };
    attention.sort(
      (a, b) =>
        severityOrder[a.severity] - severityOrder[b.severity] ||
        b.count - a.count,
    );

    return Response.json({
      generatedAt: new Date().toISOString(),
      businessDate: today,
      metrics: {
        openWorkOrders: number(workOrders, "openCount"),
        marginBlocked: number(workOrders, "marginBlockedCount"),
        pricingIncomplete: number(workOrders, "pricingIncompleteCount"),
        projectedMarginBps,
        activeRevenueCents,
        scheduledStops: number(todayPlan, "stopCount"),
        routeCount: number(todayPlan, "routeCount"),
        verifiedMiles: number(todayPlan, "verifiedMiles"),
        missingTravelCount: number(todayPlan, "missingTravelCount"),
        pmDue30: number(pm, "due30Count"),
        pmOverdue: number(pm, "overdueCount"),
        openBalanceCents: number(finance, "openBalanceCents"),
        overdueBalanceCents: number(finance, "overdueBalanceCents"),
      },
      queues: {
        intakeOpen: number(intake, "openCount"),
        intakeIncomplete: number(intake, "incompleteCount"),
        qa: number(workOrders, "qaCount"),
        invoiceReady: number(workOrders, "invoiceReadyCount"),
        adminOpen: number(tasks, "openCount"),
        adminUrgent: number(tasks, "urgentCount"),
        adminOverdue: number(tasks, "overdueCount"),
        integrationPending: number(integrations, "pendingCount"),
        integrationFailed: number(integrations, "failedCount"),
        feedbackAction: number(feedback, "actionCount"),
        approvedPayCents: number(payroll, "approvedPayCents"),
        collectedUnpaidCents: number(payroll, "collectedUnpaidCents"),
        collectedUnpaidCount: number(payroll, "collectedUnpaidCount"),
        agedOpen: number(workOrders, "agedOpenCount"),
      },
      workforce: {
        active: number(workforce, "activeCount"),
        loginLinked: number(workforce, "loginLinkedCount"),
        routedToday: number(todayPlan, "routedTechnicianCount"),
        missingCoordinates: number(workforce, "missingCoordinatesCount"),
        ceuAction: 0, // Career-ladder only; never a routine service exception.
        compensationReview: number(workforce, "compensationReviewCount"),
      },
      preventiveMaintenance: {
        total: number(pm, "totalCount"),
        overdue: number(pm, "overdueCount"),
        due30: number(pm, "due30Count"),
        due90: number(pm, "due90Count"),
      },
      dataQuality: {
        assetsMissingSerial: number(dataQuality, "assetsMissingSerial"),
        locationsMissingCoordinates: number(
          dataQuality,
          "locationsMissingCoordinates",
        ),
        customersMissingContact: number(dataQuality, "customersMissingContact"),
        accountsMissingBillingEmail: number(
          dataQuality,
          "accountsMissingBillingEmail",
        ),
      },
      coveragePlanning: {
        tracks: coverageTracks,
        locations: coverageLocations,
        basis: "Straight-line distance from each saved dispatch origin, or home coordinates when no dispatch origin is saved, compared with that technician's saved maximum service radius.",
        limitation: "A geographic match is a planning indicator only. It does not prove availability, route time, technical authorization, competency, contract scope, or future demand.",
      },
      attention,
      activeOrders: activeOrdersResult.results,
      routes: routesResult.results,
    }, { headers: privateNoStore });
  } catch (error) {
    return apiError(error);
  }
}
