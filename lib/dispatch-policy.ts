// Dispatch planning must not reopen service, review, billing, or cancelled work.
// Keep this shared by the API and the route-card controls.
export function canEditDispatchPlan(workStatus: string, assignmentStatus?: string) {
  return ["ready_to_assign", "assigned"].includes(workStatus) &&
    (assignmentStatus === undefined ||
      ["offered", "assigned", "accepted", "dispatched", "arrived"].includes(assignmentStatus));
}

export function canRecordDispatchProgress(workStatus: string) {
  return ["ready_to_assign", "assigned", "in_progress"].includes(workStatus);
}

export const dispatchPlanLockedMessage =
  "This assignment can no longer be edited in Dispatch. Refresh to see its latest status, then review the work order in the completion workflow. No route changes were saved.";

export const dispatchProgressLockedMessage =
  "This work order is no longer accepting travel or service updates. Refresh to see its latest status, then review it in the completion workflow. No progress changes were saved.";
