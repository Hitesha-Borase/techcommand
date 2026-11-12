export type ScannerSettings = { prefix?: string; suffix?: string };
export type AssetScanIdentity = { kind: "label" | "asset_id"; value: string };

/** Scanner output is data, never a URL to navigate or a number to coerce. */
export function parseAssetScan(raw: string, settings: ScannerSettings = {}): AssetScanIdentity {
  if (typeof raw !== "string" || raw.length > 256) throw new Error("Scan one asset tag at a time (maximum 80 characters).");
  let value = raw.replace(/[\r\n\t]+$/, "").trim();
  if (settings.prefix) {
    if (!value.startsWith(settings.prefix)) throw new Error("The scan does not match the configured scanner prefix.");
    value = value.slice(settings.prefix.length);
  }
  if (settings.suffix) {
    if (!value.endsWith(settings.suffix)) throw new Error("The scan does not match the configured scanner suffix.");
    value = value.slice(0, -settings.suffix.length);
  }
  value = value.trim();
  if (/^techflex:asset:[A-Za-z0-9_-]{1,80}$/.test(value)) return { kind: "asset_id", value: value.slice("techflex:asset:".length) };
  if (!value || value.length > 80 || /[\x00-\x1f\x7f]/.test(value)) throw new Error("Scan or enter one complete asset tag, keeping all leading zeros.");
  if (/[:/\\<>]/.test(value) || /^www\./i.test(value)) throw new Error("Scan the asset label number. Website links and commands cannot open an asset.");
  return { kind: "label", value };
}

export function scannerPermissionMessage(error: unknown) {
  const name = error && typeof error === "object" && "name" in error ? error.name : "";
  if (name === "NotAllowedError" || name === "SecurityError") return "Camera access was denied. Allow camera access for this site in your browser settings, then retry, or use a scanner or type the tag.";
  if (name === "NotFoundError") return "No camera was found. Use a USB/Bluetooth scanner or type the tag.";
  if (name === "NotReadableError") return "The camera is busy. Close other camera apps and retry, or enter the tag manually.";
  return "Camera scanning is unavailable. Retry, take a clear photo of one barcode, or enter the tag manually.";
}

export type ScannedAsset = {
  pmDraftJson?: string | null; pmDraftUpdatedAt?:string | null; pmDraftVersion?:number | null;
  id: string; assetTag: string; customerAssetId: string | null;
  categoryId: string | null; categoryRevisionId: string | null; categoryName: string | null; categoryRevision: number | null;
  manufacturer: string; model: string; serialNumber: string | null; description: string | null;
  room: string | null; configuration: string | null; softwareVersion: string | null;
  riskClass: string; status: string; lastPmOn: string | null; nextPmDueOn: string | null; pmIntervalMonths: number | null;
  accountId: string; accountName: string; locationId: string; locationName: string; city: string; state: string;
  departmentId: string | null; departmentName: string | null; recordVersion: number;
};
export type ScannedJob = {
  id: string; externalId: string; serviceType: string; status: string;
  assignmentId: string | null; visitDate: string | null; scheduledStart: string | null;
};
export type AssetScanResult = { asset: ScannedAsset; jobs: ScannedJob[]; matchedBy: string; canManageLabels: boolean };
