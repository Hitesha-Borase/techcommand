export function assignmentSource(value: string) {
  const normalized = value.trim().toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "");
  if (normalized === "spin_life") return "spinlife";
  return normalized || "manual";
}
