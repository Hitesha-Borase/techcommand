export type FieldProgressState = "en_route" | "arrived" | "service_in_progress";
export type FieldProgressInput = {
  workOrderId: string;
  technicianId: string;
  state: FieldProgressState;
};
export type FieldProgressConfirmation = Pick<FieldProgressInput, "workOrderId" | "state">;

type LaunchableJob = { assignmentStatus: string; status: string };

const activeAssignmentStatuses = ["offered", "assigned", "accepted", "dispatched", "arrived"];

/** Starting assigned work is the primary action; travel tracking stays optional. */
export function startWorkOrderAction(job: LaunchableJob) {
  return ["ready_to_assign", "assigned"].includes(job.status) && activeAssignmentStatuses.includes(job.assignmentStatus)
    ? { state: "service_in_progress" as const, label: "Start Work Order" }
    : null;
}

export function optionalTravelAction(job: LaunchableJob) {
  if (!["ready_to_assign", "assigned"].includes(job.status)) return null;
  if (["offered", "assigned", "accepted"].includes(job.assignmentStatus))
    return { state: "en_route" as const, label: "Start travel (optional)" };
  if (job.assignmentStatus === "dispatched")
    return { state: "arrived" as const, label: "Mark arrived (optional)" };
  return null;
}

/** Open the existing authorized workflow only after this job's start is confirmed. */
export async function recordFieldProgress<Job extends { id: string; technicianId: string }>(
  job: Job,
  state: FieldProgressState,
  record: (input: FieldProgressInput) => Promise<FieldProgressConfirmation>,
  openWorkflow: (job: Job) => void,
) {
  const confirmation = await record({ workOrderId: job.id, technicianId: job.technicianId, state });
  if (confirmation.workOrderId !== job.id || confirmation.state !== state) {
    throw new Error("The job update was not confirmed. Refresh your assignments before retrying.");
  }
  if (state === "service_in_progress") openWorkflow(job);
  return confirmation;
}
