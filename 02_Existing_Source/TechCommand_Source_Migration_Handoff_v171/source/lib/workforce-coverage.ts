import { parseDisciplines } from "@/lib/service-disciplines";

export type CoverageTrack = "biomedical" | "dme_mobility";

export type CoverageTechnician = {
  id: string;
  disciplines: string | null;
  latitude: number | null;
  longitude: number | null;
  maxRadiusMiles: number;
};

export type CoverageLocation = {
  locationId: string;
  track: CoverageTrack;
  latitude: number | null;
  longitude: number | null;
};

export type GeographicCoverage = {
  matchingTechnicians: number;
  techniciansWithKnownOrigin: number;
  techniciansWithKnownReach: number;
  status:
    | "within_saved_radius"
    | "location_coordinates_missing"
    | "no_matching_discipline"
    | "technician_coordinates_missing"
    | "no_saved_radius_match";
};

export function haversineMiles(
  latitudeA: number,
  longitudeA: number,
  latitudeB: number,
  longitudeB: number,
) {
  const radians = (value: number) => (value * Math.PI) / 180;
  const latitudeDelta = radians(latitudeB - latitudeA);
  const longitudeDelta = radians(longitudeB - longitudeA);
  const value =
    Math.sin(latitudeDelta / 2) ** 2 +
    Math.cos(radians(latitudeA)) *
      Math.cos(radians(latitudeB)) *
      Math.sin(longitudeDelta / 2) ** 2;
  return 3958.8 * 2 * Math.atan2(Math.sqrt(value), Math.sqrt(1 - value));
}

export function geographicCoverage(
  location: CoverageLocation,
  technicians: CoverageTechnician[],
): GeographicCoverage {
  const matching = technicians.filter((technician) =>
    parseDisciplines(technician.disciplines).includes(location.track),
  );
  const knownOrigins = matching.filter(
    (technician) =>
      technician.latitude !== null && technician.longitude !== null,
  );
  const knownReach =
    location.latitude === null || location.longitude === null
      ? []
      : knownOrigins.filter(
          (technician) =>
            haversineMiles(
              technician.latitude!,
              technician.longitude!,
              location.latitude!,
              location.longitude!,
            ) <= technician.maxRadiusMiles,
        );
  const status: GeographicCoverage["status"] =
    location.latitude === null || location.longitude === null
      ? "location_coordinates_missing"
      : matching.length === 0
        ? "no_matching_discipline"
        : knownOrigins.length === 0
          ? "technician_coordinates_missing"
          : knownReach.length > 0
            ? "within_saved_radius"
            : "no_saved_radius_match";
  return {
    matchingTechnicians: matching.length,
    techniciansWithKnownOrigin: knownOrigins.length,
    techniciansWithKnownReach: knownReach.length,
    status,
  };
}
