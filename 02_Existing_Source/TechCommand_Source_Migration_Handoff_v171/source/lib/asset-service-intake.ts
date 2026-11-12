import type { IntakeData } from "@/lib/intake-completeness";

export type ServiceAsset = { id: string; accountId: string; locationId: string; assetTag: string; description?: string | null; manufacturer: string; model: string; serialNumber?: string | null };
export type ServiceLocation = { id: string; accountId: string; address1: string; address2?: string | null; city: string; state: string; postalCode: string; accessInstructions?: string | null };

export function assetServiceIntake(asset: ServiceAsset, location: ServiceLocation): IntakeData {
  if (asset.locationId !== location.id || asset.accountId !== location.accountId) throw new Error("The asset and facility do not match. Refresh the asset registry before planning service.");
  return {
    accountId: asset.accountId, locationId: asset.locationId, assetId: asset.id,
    externalSource: "manual", externalId: "", noticeType: "new_assignment", serviceType: "",
    summary: `Service request · ${asset.assetTag}`.slice(0, 240),
    equipmentType: asset.description || "", manufacturer: asset.manufacturer, model: asset.model,
    serialNumber: asset.serialNumber || "",
    serviceAddress: [location.address1, location.address2, location.city, location.state, location.postalCode].filter(Boolean).join(", "),
    accessInstructions: location.accessInstructions || "",
    rawText: `Prepared from asset registry ${asset.assetTag}. Confirm the requested scope, current equipment identity and partner work-order number before dispatch.`,
    customerComplaint: "", authorization: null, roundTripMiles: null, technicianCount: null,
    onsiteHours: 1, driveHours: 0, partsCount: 0, assetCount: 1,
  };
}
