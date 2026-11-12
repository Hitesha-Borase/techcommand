import {simpleChecks,type SpinLifeJob} from "./spinlife-simple";

export function dmeFieldProgress(job:SpinLifeJob,allowAttestation=true){
 const checks=simpleChecks(job.data,job.visit).filter(c=>allowAttestation||c.key!=="sl_attestation");
 const documented=checks.filter(c=>c.complete||(c.notApplicable&&!!c.result?.trim()));
 const remaining=checks.filter(c=>!documented.includes(c));
 return {checks,documented:documented.length,total:checks.length,remaining,percent:checks.length?Math.round(documented.length/checks.length*100):0};
}

/** A field-data preview, not a diagnosis or a substitute for manufacturer procedures. */
export function dmeRecordedActivity(job:SpinLifeJob){
 return simpleChecks(job.data,job.visit).map(check=>({
  key:check.key!,label:check.label,
  status:check.notApplicable?"Not applicable":check.outcome==="not_done"?"Not completed / issue recorded":check.complete?"Recorded as performed":"Not recorded",
  note:check.result||"",
 }));
}
