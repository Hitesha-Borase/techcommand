export const careerLevels = [
  {id:"explorer",name:"HTM Explorer / Student",focus:"Explore equipment, safety and HTM careers. No independent service."},
  {id:"foundations",name:"Biomedical Foundations",focus:"Electrical fundamentals, AC/DC, Ohm’s law, multimeter, safety, mechanics, pneumatics, hydraulics, batteries, medical terminology, A&P, infection control, ESD, CMMS and manufacturer documentation."},
  {id:"trainee",name:"BMET Trainee / Apprentice",focus:"Observed and assisted work, supervised PM, practical demonstrations and documented safety skills."},
  {id:"bmet_1",name:"BMET I",focus:"Independent work only on specifically authorized equipment and tasks."},
  {id:"bmet_2",name:"BMET II",focus:"Advanced troubleshooting, calibration, safety testing, connectivity, failure analysis, mentoring and quality documentation."},
  {id:"specialty",name:"Specialty BMET",focus:"Verified specialty and manufacturer/platform-specific competency."},
  {id:"advanced",name:"Advanced Specialty / Imaging Technician",focus:"OEM/platform training and separate imaging task authorization."},
  {id:"lead",name:"Lead / Senior BMET",focus:"Technical leadership, qualified supervision and quality review."},
  {id:"leadership",name:"HTM Leadership",focus:"Workforce development, equipment lifecycle and quality management."},
] as const;
export const specialties = ["General Biomedical","Sterilization / SPD","Anesthesia & Respiratory","Surgical / OR","Ultrasound","Imaging / C-arm","Advanced Imaging","HTM Leadership"] as const;
export const serviceTasks = ["observe","assist","pm","diagnose","corrective_repair","calibration","electrical_safety","qa_testing","documentation","mentor","cataloging"] as const;
export const taskLabels: Record<string,string> = {observe:"Observe",assist:"Assist",pm:"Preventive maintenance",diagnose:"Diagnose",corrective_repair:"Corrective repair",calibration:"Calibration",electrical_safety:"Electrical-safety testing",qa_testing:"QA testing",documentation:"Finalize service documentation",mentor:"Mentor",cataloging:"Cataloging"};
export const authorizationLevels = ["not_trained","learning","observed","assisted","supervised_only","competent","independent","trainer"] as const;
export const authorizationLabels: Record<string,string> = {not_trained:"Not trained",learning:"Learning",observed:"Observed",assisted:"Assisted",supervised_only:"Supervised only",competent:"Competent — authorization review needed",independent:"Independently authorized",trainer:"Trainer / sign-off authority"};
export const credentialResources = [
  {name:"CBET",issuer:"AAMI Credentials Institute",why:"Broad biomedical knowledge and experience credential.",prerequisites:"Education/experience eligibility or candidate status; verify current AAMI requirements.",level:"BMET I / BMET II",specialty:"General Biomedical",url:"https://aami.org/certifications/cbet/"},
  {name:"CRES",issuer:"AAMI Credentials Institute",why:"Radiology equipment knowledge; not a substitute for model-specific service authorization.",prerequisites:"Verify current radiology experience and eligibility with AAMI.",level:"Specialty / Imaging",specialty:"Imaging / C-arm",url:"https://aami.org/certifications/cres/"},
  {name:"CHTM",issuer:"AAMI Credentials Institute",why:"Healthcare technology management development.",prerequisites:"Verify current management experience and education requirements with AAMI.",level:"Lead / HTM Leadership",specialty:"HTM Leadership",url:"https://aami.org/certifications/chtm/"},
  {name:"AAMI education",issuer:"AAMI",why:"Relevant continuing education and technical learning.",prerequisites:"Course-specific prerequisites and enrollment apply.",level:"All levels",specialty:"General Biomedical",url:"https://aami.org/aami-training/"},
] as const;
export const academySourceVerifiedOn = "2026-09-19";
export const dmeCredentialResources = [
 {name:"Pride Learning Institute",issuer:"Pride Mobility / Quantum Rehab",why:"Official manufacturer education and continuing learning.",prerequisites:"Course-specific eligibility and registration; training is not automatic service authorization.",level:"Foundations to manufacturer specialist",specialty:"Pride / Quantum",url:"https://www.quantumrehab.com/education/"},
 {name:"Golden technical resources",issuer:"Golden Technologies",why:"Manufacturer documents to support equipment-specific learning; not a certification course.",prerequisites:"Check exact product/model applicability and current document revision.",level:"All levels",specialty:"Golden Technologies",url:"https://goldentech.com/download-documents/"},
 {name:"Assistive Technology Professional (ATP)",issuer:"RESNA",why:"An external assistive-technology credential for relevant roles; not a universal repair qualification.",prerequisites:"RESNA determines education and qualifying work-experience eligibility; verify before applying.",level:"Role-dependent / advanced mobility",specialty:"Assistive technology",url:"https://www.resna.org/Certification/Assistive-Technology-Professional-ATP/ATP-Exam-Eligibility"},
] as const;
export type AcademyTrack = "biomedical"|"dme_mobility";
export const dmeCareerLevels = [
 {id:"explorer",name:"DME / Mobility Explorer",focus:"Equipment identity, electrical and mechanical basics, safe handling, tools, documentation and customer interaction. No independent service."},
 {id:"foundations",name:"Mobility Foundations",focus:"Multimeter, batteries/charging, wiring, connectors, motors, brakes, actuators and evidence-based fault isolation."},
 {id:"trainee",name:"DME Technician Trainee",focus:"Observed/assisted evaluations, repairs and deliveries under qualified supervision."},
 {id:"dme_1",name:"DME Technician I",focus:"Independent work only for approved manufacturer, equipment and task combinations."},
 {id:"dme_2",name:"DME Technician II",focus:"Advanced diagnostics, intermittent faults, power seating, multi-part repairs and quality documentation."},
 {id:"manufacturer_specialist",name:"Manufacturer / Platform Specialist",focus:"Demonstrated manufacturer/platform-specific service and diagnostic expertise."},
 {id:"advanced_mobility",name:"Advanced Mobility Specialist",focus:"Complex rehab, alternative controls, advanced systems, mentoring and separately granted training authority."},
] as const;
export const dmeSpecialties=["Core diagnostics","Lift chairs","Scooters","Power wheelchairs","Manual wheelchairs","Beds","Patient lifts","Complex rehab / seating","Manufacturer specialist"] as const;
export const dmeFamilies=[{id:"dme:lift_chair",name:"Lift chairs"},{id:"dme:scooter",name:"Scooters"},{id:"dme:power_wheelchair",name:"Power wheelchairs"},{id:"dme:manual_wheelchair",name:"Manual wheelchairs"},{id:"dme:bed",name:"Home-care / hospital beds"},{id:"dme:patient_lift",name:"Patient lifts"},{id:"dme:seating",name:"Power seating / specialty controls"},{id:"dme:accessory",name:"Mobility accessories"}];
export const dmeTasks=["observe","assist","diagnose","corrective_repair","delivery_installation","pm","controller_diagnosis","programming","power_seating","documentation","mentor"] as const;
Object.assign(taskLabels,{delivery_installation:"Delivery / installation",controller_diagnosis:"Controller diagnosis",programming:"Programming",power_seating:"Power seating"});
export function trackCatalog(track:AcademyTrack){return track==="biomedical"?{levels:careerLevels,specialties,tasks:serviceTasks,label:"Biomedical / HTM"}:{levels:dmeCareerLevels,specialties:dmeSpecialties,tasks:dmeTasks,label:"DME / Mobility"};}
export function taskForService(type:string) {return type==="biomed_cataloging"?"cataloging":type.startsWith("biomed_pm_")?"pm":type==="biomed_repair"?"corrective_repair":"diagnose";}
export function dmeTaskForService(type:string){
 if(["wgd_basic","wgd_complex","bed_delivery","consumer_install"].includes(type))return "delivery_installation";
 if(type==="evaluation")return "diagnose";
 if(["repair_single","repair_multi","frame_repair","hourly_service","warranty_service"].includes(type))return "corrective_repair";
 if(type==="dme_pm")return "pm";
 return null;
}
export const experienceSupervisionLabels:Record<string,string>={independent:"Independent",supervised:"Supervised",not_recorded:"Supervision not recorded — no independence inferred"};
export function exactUnit(value:string|null|undefined){return (value||"").trim().toLowerCase();}
