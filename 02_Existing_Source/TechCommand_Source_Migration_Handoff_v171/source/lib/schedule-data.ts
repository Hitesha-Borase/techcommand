/**
 * Schedule Data Management & Filtering
 *
 * Unifies scheduling choices across standard commercial/biomedical work orders
 * and partner SpinLife work orders, ensuring assigned orders with planned dates
 * appear dynamically in the schedule appointment selector and day board.
 */

import { isPricingReviewCleared, type PricingGateSubject } from "./pricing-review-gate.ts";

export interface ScheduleJobItem extends PricingGateSubject {
  id: string;
  externalId: string;
  externalSource: string;
  serviceType: string;
  summary: string;
  priority: string;
  status: string;
  requiredTechnicianCount: number;
  assignedCount?: number;
  grossMarginBasisPoints?: number;
  scheduledStart: string | null;
  scheduledEnd?: string | null;
  accountName: string;
  locationId: string;
  locationName: string;
  address: string;
  latitude?: number | null;
  longitude?: number | null;
  technicianId?: string | null;
  technicianName?: string | null;
  technicianCode?: string | null;
  assignmentId?: string | null;
  assignmentRole?: "primary" | "support";
  assignmentStatus?: string;
  routeId?: string | null;
  stopId?: string | null;
  stopOrder?: number | null;
  plannedArrival?: string | null;
  plannedDeparture?: string | null;
  legMiles?: number | null;
  driveMinutes?: number | null;
  travelSource?: string | null;
  stopStatus?: string | null;
  nearestTechnician?: {
    technicianId: string;
    technicianName: string;
    miles: number;
  } | null;
  isSpinLife?: boolean;
}

export function filterEligibleWorkOrders(
  availableJobs: ScheduleJobItem[] = [],
  scheduledJobs: ScheduleJobItem[] = [],
  selectedDate?: string
): ScheduleJobItem[] {
  const choicesMap = new Map<string, ScheduleJobItem>();

  // Available jobs that clear pricing review
  for (const job of availableJobs) {
    if (isPricingReviewCleared(job)) {
      choicesMap.set(job.id, job);
    }
  }

  // Scheduled jobs (eligible for appointment adjustments or day board display)
  for (const job of scheduledJobs) {
    if (!choicesMap.has(job.id) && isPricingReviewCleared(job)) {
      choicesMap.set(job.id, job);
    }
  }

  return [...choicesMap.values()];
}
