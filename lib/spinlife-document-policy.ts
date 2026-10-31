/** Digital field mapping derived from the four September 2026 supplied references.
 * Source documents remain private attachments; no customer fixture or signature is bundled. */
export type FieldCheck = { key?: string; label: string; complete: boolean; notApplicable?: boolean; reason?: string; result?: string; outcome?: string };
export const isSpinLife = (account: string) => /spin\s*life/i.test(account);
export const isDelivery = (service: string) => service.startsWith('wgd') || service === 'bed_delivery';
export function packetStatus(disposition: string) {
  if (['passed','returned_to_service','delivery_completed'].includes(disposition)) return 'COMPLETED';
  if (disposition === 'parts_required') return 'NEEDS PART';
  if (['needs_resolution','follow_up_required'].includes(disposition)) return 'NEEDS RESOLUTION';
  return 'NEEDS REVIEW';
}
export function packetName(customer: string | null, reference: string, disposition: string, facility?: string | null) {
  const words = (customer || '').trim().split(/\s+/).filter(Boolean);
  const facilityName = (facility || '').replace(/[\\/:*?"<>|\x00-\x1f]/g, '-').trim();
  const facilityLabel = facilityName.length > 32 ? facilityName.split(/\s+/).filter(Boolean).map(word => word[0]).join('').toUpperCase() : facilityName;
  const initials = words.length ? [words[0][0], ...(words.length > 1 ? [words.at(-1)![0]] : [])].join('').toUpperCase() : facilityLabel || 'CU';
  const safeReference = reference.replace(/[\\/:*?"<>|\x00-\x1f]/g, '-');
  return `${initials} Work Order #${safeReference} - ${packetStatus(disposition)}.pdf`;
}
export function workOrderPacketName(workOrder: {customerName: string | null; locationName: string; locationType?: string | null; serviceType: string; externalId: string}, disposition: string) {
  const facilityJob = workOrder.serviceType.startsWith('biomed') || /facility|hospital|clinic|rehab|nursing|medical.center/i.test(workOrder.locationType || '');
  // Older residential jobs store the customer's name only in the location record.
  const customer = workOrder.customerName || (facilityJob ? null : workOrder.locationName);
  return packetName(customer, workOrder.externalId, disposition, facilityJob ? workOrder.locationName : null);
}
/** New DME field packets use the owner's technician-initial + full suffix rule. */
export function dmePacketName(technician:string|null,reference:string,disposition:string){
  const words=(technician||'').trim().split(/\s+/).filter(Boolean);
  const initials=words.length?[words[0][0],...(words.length>1?[words.at(-1)![0]]:[])].join('').toUpperCase().replace(/[^A-Z0-9]/g,''):'UNASSIGNED';
  const status=packetStatus(disposition),label=status==='COMPLETED'?'Completed':status==='NEEDS PART'?'NeedsParts':status==='NEEDS RESOLUTION'?'NeedsResolution':'NeedsReview';
  return `${initials||'TECH'}_${reference.replace(/[\\/:*?"<>|\x00-\x1f]/g,'-')}_${label}.pdf`;
}
export const spinlifeDeliveryChecks = [
  ['sl_damage','Unit free of damage'], ['sl_demo','Brief demonstration provided'],
  ['sl_comfort','Comfort adjustments made (if applicable)'], ['sl_working','Unit in working order'],
  ['sl_photo','Photo of final delivered product'], ['sl_charging','Proper charging habits explained (if applicable)'],
  ['sl_manual','Owner’s manual provided'], ['sl_packaging','Packaging removed'],
  ['sl_accessories','Accessories delivered and installed listed in work performed'], ['sl_serial','Serial number verified'],
] as const;
export const spinlifeRepairChecks = [
  ['sl_installed','Installed parts and tested'], ['sl_battery_rest','Battery reading at rest (record value and unit)'],
  ['sl_battery_load','Battery reading under load (record value and unit)'], ['sl_codes','Error codes'],
  ['sl_ohms','Motor resistance (record ohms and test conditions)'], ['sl_joystick','Check joystick'],
  ['sl_pendant','Check hand pendant'], ['sl_frame','Check frame'], ['sl_hardware','Check loose hardware'],
  ['sl_motor','Check motor'], ['sl_connections','Check connections'],
  ['sl_arm_worn','Arm pads worn (record yes/no)'], ['sl_tires_worn','Tires/casters worn (record yes/no)'],
  ['sl_upholstery_worn','Upholstery worn (record yes/no)'], ['sl_photo','Photos/video documented'],
] as const;
export function partnerChecks(service: string): FieldCheck[] {
  return [...(isDelivery(service) ? spinlifeDeliveryChecks : spinlifeRepairChecks),
    ['sl_quote','Vendor parts quote number (or not applicable)'] as const,
    ['sl_return','Returned parts, carrier and tracking (or not applicable)'] as const,
    ['sl_attestation','I attest that this report accurately records the work I performed and the tests and final condition I observed.'] as const,
  ].map(([key,label]) => ({key,label,complete:false,notApplicable:false,reason:'',result:''}));
}
export function resolvedCheck(item: FieldCheck) {
  return item.notApplicable ? !item.complete && Boolean((item.reason || '').trim().length >= 5) : item.complete;
}
export function mergePartnerChecks(saved: FieldCheck[], service: string) {
  const required = partnerChecks(service);
  return [...saved.filter(x => !x.key?.startsWith('sl_')), ...required.map(x => {
    const previous = saved.find(s => s.key === x.key);
    return previous ? {...previous, key:x.key, label:x.label} : x;
  })];
}
export function partnerCheckProblems(checks: FieldCheck[], service: string) {
  return partnerChecks(service).filter(required => {
    const item = checks.find(x => x.key === required.key);
    if (!item || !resolvedCheck(item)) return true;
    if (['sl_attestation','sl_serial','sl_photo'].includes(required.key!)) return item.notApplicable || !item.complete;
    if (!isDelivery(service) && !item.notApplicable && required.key !== 'sl_photo') return !(item.result || '').trim();
    return false;
  }).map(x => x.label);
}
