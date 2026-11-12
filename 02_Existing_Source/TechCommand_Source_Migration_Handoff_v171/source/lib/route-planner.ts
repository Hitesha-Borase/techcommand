export type NavigationApp = "google" | "apple" | "waze";

export function navigationUrl(app: NavigationApp, destination: string, origin?: string) {
  if (!destination.trim()) return null;
  if (app === "apple") {
    const query = new URLSearchParams({ daddr: destination, dirflg: "d" });
    if (origin?.trim()) query.set("saddr", origin);
    return `https://maps.apple.com/?${query}`;
  }
  if (app === "waze") return `https://waze.com/ul?${new URLSearchParams({ q: destination, navigate: "yes" })}`;
  const query = new URLSearchParams({ api: "1", destination, travelmode: "driving" });
  if (origin?.trim()) query.set("origin", origin);
  else query.set("dir_action", "navigate");
  return `https://www.google.com/maps/dir/?${query}`;
}

export type PlannedStop = { stopId: string; serviceMinutes: number; driveMinutes: number | null };
export const validServiceMinutes = (value: number) => Number.isInteger(value) && value >= 1 && value <= 720;
export const validDriveMinutes = (value: number | null): value is number => value !== null && Number.isInteger(value) && value >= 0 && value <= 1440;

export function routeEstimateErrors(stops: PlannedStop[], includeReturn: boolean, returnMinutes: number | null) {
  const errors = stops.flatMap((stop, index) => [
    ...(!validServiceMinutes(stop.serviceMinutes) ? [`On-site minutes for stop ${index + 1} must be a whole number from 1 to 720.`] : []),
    ...(stop.driveMinutes !== null && !validDriveMinutes(stop.driveMinutes) ? [`Drive minutes for stop ${index + 1} must be a whole number from 0 to 1440, or left blank.`] : []),
  ]);
  if (includeReturn && returnMinutes !== null && !validDriveMinutes(returnMinutes))
    errors.push("Return drive minutes must be a whole number from 0 to 1440, or left blank.");
  return errors;
}

export function routeTotals(stops: PlannedStop[], includeReturn: boolean, returnMinutes: number | null) {
  const onsite = stops.every(stop => validServiceMinutes(stop.serviceMinutes))
    ? stops.reduce((sum, stop) => sum + stop.serviceMinutes, 0) : null;
  const missing = stops.filter(stop => !validDriveMinutes(stop.driveMinutes)).length + (includeReturn && !validDriveMinutes(returnMinutes) ? 1 : 0);
  const drive = stops.reduce((sum, stop) => sum + (validDriveMinutes(stop.driveMinutes) ? stop.driveMinutes : 0), 0) +
    (includeReturn && validDriveMinutes(returnMinutes) ? returnMinutes : 0);
  return { onsite, drive, missing, total: missing || onsite === null || !stops.length ? null : onsite + drive };
}

export type ProjectedStop = { stopId: string; arrivalMinutes: number | null; departureMinutes: number | null };

function clockMinutes(value: string) {
  const match = /^(\d{2}):(\d{2})$/.exec(value);
  if (!match) return null;
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  return hours <= 23 && minutes <= 59 ? hours * 60 + minutes : null;
}

export function routeTimeline(stops: PlannedStop[], startTime: string, includeReturn: boolean, returnMinutes: number | null) {
  let cursor = clockMinutes(startTime);
  const projectedStops: ProjectedStop[] = stops.map(stop => {
    if (cursor === null || !validDriveMinutes(stop.driveMinutes) || !validServiceMinutes(stop.serviceMinutes)) {
      cursor = null;
      return { stopId: stop.stopId, arrivalMinutes: null, departureMinutes: null };
    }
    const arrivalMinutes = cursor + stop.driveMinutes;
    const departureMinutes = arrivalMinutes + stop.serviceMinutes;
    cursor = departureMinutes;
    return { stopId: stop.stopId, arrivalMinutes, departureMinutes };
  });
  const finishMinutes = !stops.length || cursor === null || (includeReturn && !validDriveMinutes(returnMinutes))
    ? null
    : cursor + (includeReturn ? returnMinutes ?? 0 : 0);
  return { stops: projectedStops, finishMinutes };
}

export function formatProjectedTime(minutes: number) {
  const day = Math.floor(minutes / 1440);
  const normalized = ((minutes % 1440) + 1440) % 1440;
  const hours = Math.floor(normalized / 60);
  const minute = normalized % 60;
  const clock = `${hours % 12 || 12}:${String(minute).padStart(2, "0")} ${hours < 12 ? "AM" : "PM"}`;
  return day === 0 ? clock : `${clock} · ${day === 1 ? "next day" : `+${day} days`}`;
}
