export type ServiceDiscipline = "biomedical" | "dme_mobility";
export const disciplineLabels = { biomedical: "Biomedical / PM", dme_mobility: "DME / Mobility field service" };
export function parseDisciplines(value: unknown): ServiceDiscipline[] {
  try { const parsed = typeof value === "string" ? JSON.parse(value) : value;
    return Array.isArray(parsed) ? [...new Set(parsed.filter((v): v is ServiceDiscipline => v === "biomedical" || v === "dme_mobility"))] : [];
  } catch { return []; }
}
export function jobDiscipline(serviceType: string): ServiceDiscipline {
  return serviceType.startsWith("biomed_") ? "biomedical" : "dme_mobility";
}
