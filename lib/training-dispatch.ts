import { env } from 'cloudflare:workers';
import { TECHFLEX_ORG_ID } from '@/lib/portal-auth';
const active="('offered','assigned','accepted','dispatched','arrived')";
export async function trainingAssignmentError(technicianId:string,workOrderId:string,role:string){
 const p=await env.DB.prepare("SELECT mentor_id AS mentorId,status FROM training_placements WHERE organization_id=? AND technician_id=? AND status IN ('active','paused') LIMIT 1").bind(TECHFLEX_ORG_ID,technicianId).first<{mentorId:string;status:string}>();
 if(p){if(p.status==='paused')return 'This student placement is paused. Review the training plan before assigning work.';if(role!=='support')return 'Students in active placements must be assigned as support with their field mentor.';
 const mentor=await env.DB.prepare(`SELECT id FROM work_order_assignments WHERE work_order_id=? AND technician_id=? AND status IN ${active}`).bind(workOrderId,p.mentorId).first();if(!mentor)return 'Assign the student’s field mentor to this work order first.';
 const crew=await env.DB.prepare(`SELECT w.required_technician_count AS required,(SELECT COUNT(*) FROM work_order_assignments wa WHERE wa.work_order_id=w.id AND wa.status IN ${active} AND NOT EXISTS(SELECT 1 FROM training_placements tp WHERE tp.technician_id=wa.technician_id AND tp.organization_id=? AND tp.status IN ('active','paused'))) AS qualified FROM work_orders w WHERE w.id=? AND w.organization_id=?`).bind(TECHFLEX_ORG_ID,workOrderId,TECHFLEX_ORG_ID).first<{required:number;qualified:number}>();
 if(!crew||crew.qualified<crew.required)return 'Assign the full qualified crew first. A student placement does not replace required technicians.';
 }
 if(role==='primary'){
 const dependent=await env.DB.prepare(`SELECT p.id FROM training_placements p JOIN work_order_assignments student ON student.technician_id=p.technician_id AND student.work_order_id=? AND student.status IN ${active} JOIN work_order_assignments mentor ON mentor.technician_id=p.mentor_id AND mentor.work_order_id=student.work_order_id AND mentor.role='primary' AND mentor.status IN ${active} WHERE p.organization_id=? AND p.status='active' AND p.mentor_id!=? LIMIT 1`).bind(workOrderId,TECHFLEX_ORG_ID,technicianId).first();if(dependent)return 'Remove the student assignment before replacing their mentor.';}
 return null;
}
export async function trainingRemovalError(technicianId:string,workOrderId:string){
 const dependent=await env.DB.prepare(`SELECT p.id FROM training_placements p JOIN work_order_assignments wa ON wa.technician_id=p.technician_id AND wa.work_order_id=? AND wa.status IN ${active} WHERE p.organization_id=? AND p.mentor_id=? AND p.status='active' LIMIT 1`).bind(workOrderId,TECHFLEX_ORG_ID,technicianId).first();
 if(dependent)return 'Remove the student assignment before removing their mentor.';
 const crew=await env.DB.prepare(`SELECT w.required_technician_count AS required,(SELECT COUNT(*) FROM work_order_assignments wa WHERE wa.work_order_id=w.id AND wa.technician_id!=? AND wa.status IN ${active} AND NOT EXISTS(SELECT 1 FROM training_placements tp WHERE tp.technician_id=wa.technician_id AND tp.organization_id=? AND tp.status IN ('active','paused'))) AS remaining FROM work_orders w WHERE w.id=? AND w.organization_id=? AND EXISTS(SELECT 1 FROM work_order_assignments wa JOIN training_placements tp ON tp.technician_id=wa.technician_id AND tp.status='active' WHERE wa.work_order_id=w.id AND wa.technician_id!=? AND wa.status IN ${active})`).bind(technicianId,TECHFLEX_ORG_ID,workOrderId,TECHFLEX_ORG_ID,technicianId).first<{required:number;remaining:number}>();
 return crew&&crew.remaining<crew.required?'Remove student assignments before reducing the required qualified crew.':null;
}
