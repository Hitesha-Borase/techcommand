import { env } from "cloudflare:workers";
import { TECHFLEX_ORG_ID, apiError, requirePortalRole } from "@/lib/portal-auth";

type RawJob = Record<string, string | number | boolean | null>;
type Job = RawJob & { paidCents: number; directCostCents: number; profitCents: number; marginBps: number; countered: boolean };

function median(values: number[]) {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : Math.round((sorted[middle - 1] + sorted[middle]) / 2);
}

export async function GET(request: Request) {
  try {
    await requirePortalRole(request, ["owner_administrator", "operations_administrator", "finance"]);
    const rows = await env.DB.prepare(
      `SELECT w.id, w.external_id AS externalId, w.external_source AS source,
              w.service_type AS serviceType, w.completed_at AS completedAt,
              w.offered_payment_cents AS offeredCents, w.accepted_price_cents AS acceptedCents,
              w.estimated_cost_cents AS estimatedCostCents,
              a.name AS accountName, l.state, sr.manufacturer, sr.model,
              i.invoice_number AS invoiceNumber, i.total_cents AS invoicedCents,
              i.issued_on AS issuedOn, i.paid_at AS paidAt,
              COALESCE((SELECT SUM(ip.amount_cents) FROM invoice_payments ip WHERE ip.invoice_id=i.id), 0) AS paidCents,
              COALESCE((SELECT SUM(tp.payout_cents) FROM technician_payouts tp WHERE tp.work_order_id=w.id), 0) AS technicianCostCents,
              e.total_cents AS recommendedCents, e.pricing_snapshot_json AS pricingSnapshotJson
         FROM work_orders w
         JOIN accounts a ON a.id=w.account_id JOIN locations l ON l.id=w.location_id
         JOIN invoices i ON i.work_order_id=w.id AND i.status='paid'
         LEFT JOIN service_reports sr ON sr.work_order_id=w.id AND sr.qa_status='approved'
         LEFT JOIN estimates e ON e.work_order_id=w.id
        WHERE w.organization_id=? AND w.status='paid'
        ORDER BY i.paid_at DESC LIMIT 1000`,
    ).bind(TECHFLEX_ORG_ID).all<RawJob>();

    const jobs: Job[] = rows.results.map((row) => {
      let travelAndOtherCents = 0;
      try {
        const snapshot = JSON.parse(String(row.pricingSnapshotJson || "{}"));
        travelAndOtherCents = Math.round((Number(snapshot?.calculation?.roundTripMileage || 0) + Number(snapshot?.calculation?.otherExpenses || 0)) * 100);
      } catch {}
      const paidCents = Number(row.paidCents || 0);
      const directCostCents = Math.max(Number(row.estimatedCostCents || 0), Number(row.technicianCostCents || 0) + travelAndOtherCents);
      const profitCents = paidCents - directCostCents;
      const offered = Number(row.offeredCents || 0);
      const accepted = Number(row.acceptedCents || 0);
      return { ...row, paidCents, directCostCents, profitCents, marginBps: paidCents ? Math.round(profitCents / paidCents * 10000) : 0, countered: accepted > offered };
    });

    const grouped = new Map<string, Job[]>();
    for (const job of jobs) {
      const key = `${job.accountName}|${job.serviceType}`;
      grouped.set(key, [...(grouped.get(key) || []), job]);
    }
    const recommendations = [...grouped.entries()].map(([key, items]) => {
      const [accountName, serviceType] = key.split("|");
      const costs = items.map((item) => item.directCostCents);
      const accepted = items.map((item) => Number(item.acceptedCents || item.invoicedCents || 0));
      const sortedCosts = [...costs].sort((a, b) => a - b);
      const p75CostCents = sortedCosts[Math.min(sortedCosts.length - 1, Math.floor(sortedCosts.length * .75))] || 0;
      const minimumCents = Math.ceil(p75CostCents / .6);
      return {
        accountName, serviceType, jobCount: items.length,
        medianCostCents: median(costs), medianAcceptedCents: median(accepted), p75CostCents,
        recommendedCents: Math.max(minimumCents, median(accepted)),
        averageMarginBps: Math.round(items.reduce((sum, item) => sum + item.marginBps, 0) / items.length),
        counterRateBps: Math.round(items.filter((item) => item.countered).length / items.length * 10000),
      };
    }).sort((a, b) => b.jobCount - a.jobCount);

    const revenueCents = jobs.reduce((sum, item) => sum + item.paidCents, 0);
    const directCostCents = jobs.reduce((sum, item) => sum + item.directCostCents, 0);
    return Response.json({
      summary: { paidJobs: jobs.length, revenueCents, directCostCents, profitCents: revenueCents - directCostCents, marginBps: revenueCents ? Math.round((revenueCents - directCostCents) / revenueCents * 10000) : 0 },
      recommendations,
      jobs: jobs.slice(0, 200),
      methodology: "Recommendations use paid jobs only, the 75th-percentile recorded direct cost, and a 40% minimum margin floor. More complete actual time and expense capture improves accuracy.",
    });
  } catch (error) { return apiError(error); }
}
