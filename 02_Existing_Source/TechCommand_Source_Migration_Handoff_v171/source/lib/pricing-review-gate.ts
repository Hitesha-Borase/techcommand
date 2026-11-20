/**
 * Pricing Review Gate
 *
 * Evaluates whether a work order (standard commercial, biomedical, or partner DME / SpinLife)
 * has cleared pricing review and is eligible to be scheduled and routed.
 *
 * - Standard Commercial / Biomedical work orders require:
 *   - Status is not in ['new', 'needs_information', 'pricing_review', 'estimate_draft', 'awaiting_authorization']
 *   - Gross margin is at or above the 40% floor (4000 basis points) or meets minimum authorization threshold.
 *
 * - Partner / SpinLife work orders:
 *   - Pre-negotiated commercial partner agreements (SpinLife) with assigned technician
 *     or technician pay automatically clear the pricing review gate.
 */

export interface PricingGateSubject {
  id?: string;
  externalId?: string | null;
  externalSource?: string | null;
  status?: string | null;
  grossMarginBasisPoints?: number | null;
  acceptedPriceCents?: number | null;
  offeredPaymentCents?: number | null;
  technicianPayCents?: number | null;
  technicianId?: string | null;
  isSpinLife?: boolean;
}

export function isPricingReviewCleared(order: PricingGateSubject): boolean {
  if (!order) return false;

  // SpinLife / Partner DME work orders
  const isSpinLife =
    Boolean(order.isSpinLife) ||
    Boolean(order.externalSource && /spinlife/i.test(order.externalSource)) ||
    Boolean(order.status && String(order.status).startsWith("spinlife_"));

  if (isSpinLife) {
    // SpinLife work orders clear the pricing gate when assigned or with recorded technician pay / planned date
    return Boolean(
      order.technicianId ||
      (order.technicianPayCents !== null && order.technicianPayCents !== undefined && Number(order.technicianPayCents) > 0) ||
      order.status === "spinlife_assigned" ||
      order.status === "assigned"
    );
  }

  // Standard work orders
  const blockedStatuses = [
    "new",
    "needs_information",
    "pricing_review",
    "estimate_draft",
    "awaiting_authorization",
  ];
  if (order.status && blockedStatuses.includes(order.status)) {
    return false;
  }

  const effectiveAcceptedPrice = Number(
    order.acceptedPriceCents || order.offeredPaymentCents || 0
  );
  const effectiveMargin =
    Number(order.grossMarginBasisPoints || 0) >= 4000
      ? Number(order.grossMarginBasisPoints)
      : effectiveAcceptedPrice >= 10000
        ? 4000
        : Number(order.grossMarginBasisPoints || 0);

  return effectiveMargin >= 4000;
}

export function isScheduleEligibleWorkOrder(order: PricingGateSubject): boolean {
  return isPricingReviewCleared(order);
}
