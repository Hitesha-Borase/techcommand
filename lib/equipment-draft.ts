/** First edits must start from the saved row, including its identity and version. */
export function editEquipmentDraft<T extends { assetId: string; recordVersion: number }>(saved:T, current:T | undefined, fields:Partial<T>):T {
  return { ...saved, ...current, ...fields, assetId:saved.assetId, recordVersion:current?.recordVersion ?? saved.recordVersion };
}
