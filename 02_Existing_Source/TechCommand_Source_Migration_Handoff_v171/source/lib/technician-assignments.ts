/** Keep route order while retaining assigned jobs that are not on that route. */
export function technicianAssignments<T extends { assignmentId: string }>(routeJobs: T[], scheduledJobs: T[]): T[] {
  const seen = new Set<string>();
  return [...routeJobs, ...scheduledJobs].filter(job => {
    if (seen.has(job.assignmentId)) return false;
    seen.add(job.assignmentId); return true;
  });
}
