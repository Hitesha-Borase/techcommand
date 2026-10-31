export type WorkOrderAssetProgress = {
  assetId: string;
  assetTag: string;
  manufacturer: string | null;
  model: string | null;
  serialNumber: string | null;
  procedureSnapshotJson?:string|null;
  procedureAnswersJson?:string|null;
  status: string;
  notes?: string | null;
  recordVersion?: number;
  findings: string | null;
  workPerformed: string | null;
  testResults: string | null;
  disposition: string | null;
  notApplicableReason: string | null;
};

export function facilityAssetException(
  serviceType: string,
  item: Pick<WorkOrderAssetProgress, "status" | "disposition" | "notApplicableReason">,
) {
  if (item.status === "not_started") return "Not started";
  if (item.status === "in_progress") return "Work remains in progress";
  if (item.status === "not_applicable")
    return `Not applicable${item.notApplicableReason?.trim() ? `: ${item.notApplicableReason.trim()}` : " - reason not recorded"}`;
  if (item.status !== "completed") return `Unresolved status: ${item.status.replaceAll("_", " ")}`;
  if (!item.disposition) return "Completed status has no recorded disposition";
  const expected = serviceType === "biomed_cataloging"
    ? new Set(["cataloged"])
    : new Set(["passed", "returned_to_service"]);
  return expected.has(item.disposition)
    ? null
    : `Disposition: ${item.disposition.replaceAll("_", " ")}`;
}

export function multiAssetPmProblems(
  serviceType: string,
  items: WorkOrderAssetProgress[],
) {
  if (!serviceType.startsWith("biomed_")) return [];
  const cataloging=serviceType==="biomed_cataloging";
  const problems: string[] = [];
  for (const item of items) {
    const label = `Equipment ${item.assetTag}`;
    if(cataloging&&["passed","returned_to_service"].includes(item.disposition||""))problems.push(`${label}: cataloging does not establish a passing test or return to service`);
    if (!cataloging && item.status === "completed" && ["passed","returned_to_service"].includes(item.disposition || "") && !item.testResults?.trim()) problems.push(`${label}: record actual verification results for the passing / return-to-service outcome`);
    if (item.status === "not_started" || item.status === "in_progress")
      problems.push(`${label}: finish it or mark it N/A`);
    else if (
      item.status === "completed" &&
      (![item.notes,item.findings,item.workPerformed,item.testResults].some(value=>value?.trim()) || !item.disposition)
    )
      problems.push(`${label}: review the recorded narrative and choose a disposition`);
    else if (item.status === "not_applicable" && !item.notApplicableReason?.trim())
      problems.push(`${label}: explain why it is N/A`);
    else if (!["completed", "not_applicable"].includes(item.status))
      problems.push(`${label}: choose Completed or N/A`);
  }
  return problems;
}
