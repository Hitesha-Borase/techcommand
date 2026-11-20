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

/**
 * Unifies technician assigned jobs from scheduled and available queues,
 * ensuring no assigned SpinLife or commercial jobs are missed by the technician dashboard.
 */
export function unifyTechnicianAssignedJobs(
  scheduledJobs: ScheduleJobItem[] = [],
  availableJobs: ScheduleJobItem[] = [],
  targetTechnicianId?: string | null
): ScheduleJobItem[] {
  const seenIds = new Set<string>();
  const unified: ScheduleJobItem[] = [];

  for (const job of scheduledJobs) {
    const key = job.assignmentId || job.id;
    if (!seenIds.has(key)) {
      seenIds.add(key);
      unified.push(job);
    }
  }

  for (const job of availableJobs) {
    // Only include if assigned to this technician (or any assignment if no technician filter)
    if (job.technicianId && (!targetTechnicianId || job.technicianId === targetTechnicianId)) {
      const key = job.assignmentId || job.id;
      if (!seenIds.has(key)) {
        seenIds.add(key);
        unified.push({
          ...job,
          assignmentId: job.assignmentId || `spinlife-wa-${job.id}`,
          assignmentRole: job.assignmentRole || "primary",
          assignmentStatus: job.assignmentStatus || "assigned",
          stopOrder: job.stopOrder || 1,
          stopStatus: job.stopStatus || "planned",
        });
      }
    }
  }

  return unified;
}

/**
 * Calculates accurate queue counters across all assigned work orders.
 */
export function calculateTechnicianQueueCounters(
  jobs: ScheduleJobItem[],
  todayDateStr: string
) {
  const completedJobsCount = jobs.filter(
    (j) =>
      j.status === "completed" ||
      j.assignmentStatus === "submitted" ||
      j.status === "technician_submitted"
  ).length;

  const activeJobsCount = jobs.length - completedJobsCount;

  const todayJobsCount = jobs.filter((j) => {
    if (!j.scheduledStart) return false;
    return j.scheduledStart.slice(0, 10) === todayDateStr;
  }).length;

  const upcomingJobsCount = jobs.filter((j) => {
    if (!j.scheduledStart) return false;
    return j.scheduledStart.slice(0, 10) > todayDateStr;
  }).length;

  const pastJobsCount = jobs.filter((j) => {
    if (!j.scheduledStart) return false;
    return j.scheduledStart.slice(0, 10) < todayDateStr;
  }).length;

  const unscheduledJobsCount = jobs.filter((j) => !j.scheduledStart).length;

  return {
    totalWork: jobs.length,
    completedJobsCount,
    activeJobsCount,
    todayJobsCount,
    upcomingJobsCount,
    pastJobsCount,
    unscheduledJobsCount,
  };
}
