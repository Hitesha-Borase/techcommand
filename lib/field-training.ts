export const trainingSkills = ['Safety & equipment handling','Equipment identification','Diagnostic reasoning','Repair procedure','Preventive maintenance','Function testing','Service documentation','Customer communication'] as const;
export const trainingStages = ['Observe','Assist','Perform under supervision','Approved for defined task'] as const;
export type School = {id:string;name:string;coordinatorEmail:string;active:number;version:number;program:string;coordinatorName:string;requirements:string};
export type Placement = {id:string;schoolId:string;studentName:string;technicianId:string|null;mentorId:string;mentorName?:string;status:string;version:number;program:string;startDate:string;endDate:string;targetHours:number;objectives:string;restrictions:string;skills:string[];requirementsConfirmed:boolean};
export type TrainingLog = {id:string;placementId:string;workOrderId?:string|null;status:string;date:string;skill:string;stage:string;task:string;handsMinutes:number;travelMinutes:number;reflection:string;evidence:string;evidenceUrl:string;feedback?:string;reviewer?:string;reviewedAt?:string|null;createdAt:string};
export function trainingProgress(logs:TrainingLog[]) {
  const verified=logs.filter(l=>l.status==='verified');
  const latest=new Map<string,TrainingLog>();
  for(const l of verified.slice().sort((a,b)=>(a.date+(a.reviewedAt||'')).localeCompare(b.date+(b.reviewedAt||''))))latest.set(l.skill,l);
  return {hours:verified.reduce((n,l)=>n+l.handsMinutes,0)/60,travelHours:verified.reduce((n,l)=>n+l.travelMinutes,0)/60,approved:[...latest.values()].filter(l=>l.stage==='Approved for defined task').map(l=>l.skill),pending:logs.filter(l=>l.status==='pending').length};
}
