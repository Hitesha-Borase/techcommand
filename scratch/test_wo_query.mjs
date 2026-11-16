import { DatabaseSync } from 'node:sqlite';

const db = new DatabaseSync('02_Existing_Source/TechCommand_Source_Migration_Handoff_v171/source/.local-dev.sqlite');
const TECHFLEX_ORG_ID = 'techflex';

const query = `SELECT w.id, w.external_id AS externalId, w.external_source AS externalSource,
              w.service_type AS serviceType, w.priority, w.status, w.summary, w.description,
              w.required_technician_count AS technicianCount, w.product_weight_lb AS weightLb,
              w.stairs_count AS stairsCount, w.scheduled_start AS scheduledStart,
              w.offered_payment_cents AS offeredPaymentCents,
              w.accepted_price_cents AS acceptedPriceCents, w.estimated_cost_cents AS estimatedCostCents,
              w.gross_margin_basis_points AS grossMarginBasisPoints, a.name AS accountName,
              l.name AS locationName, l.city, l.state, t.id AS technicianId,
              COALESCE(u.display_name, t.technician_code) AS technicianName, p.payout_cents AS technicianPayCents
         FROM work_orders w
         JOIN accounts a ON a.id = w.account_id AND a.organization_id = w.organization_id
         JOIN locations l ON l.id = w.location_id AND l.account_id = w.account_id
         LEFT JOIN work_order_assignments wa ON wa.work_order_id = w.id AND wa.status != 'declined'
         LEFT JOIN technicians t ON t.id = wa.technician_id AND t.organization_id = w.organization_id
         LEFT JOIN users u ON u.id = t.user_id AND EXISTS (
           SELECT 1 FROM memberships tm WHERE tm.user_id = t.user_id AND tm.organization_id = w.organization_id AND tm.status = 'active'
         )
         LEFT JOIN technician_payouts p ON p.work_order_id = w.id AND p.technician_id = t.id
        WHERE w.organization_id = ?
        ORDER BY CASE w.status WHEN 'new' THEN 1 WHEN 'pricing_review' THEN 2 WHEN 'ready_to_assign' THEN 3 WHEN 'assigned' THEN 4 ELSE 8 END, w.created_at DESC LIMIT 200`;

const rows = db.prepare(query).all(TECHFLEX_ORG_ID);
console.log('Work orders query count:', rows.length);
console.table(rows);
