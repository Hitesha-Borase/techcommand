import {z} from "zod";
import {isValidDate} from "@/lib/compliance-policy";

export const learningTracks=["biomedical","dme_mobility"] as const;
export const courseCategories=["foundations","general","specialty","manufacturer","professional"] as const;
export const difficulties=["introductory","intermediate","advanced"] as const;
const short=z.string().trim().max(240), note=z.string().trim().max(8000), id=z.string().uuid();
export const lessonSchema=z.object({id, title:short.min(2), body:note.min(10), sourceName:short.default(""), sourceReference:z.string().trim().max(2000).default(""), sourceRevision:short.default("")});
export const questionSchema=z.object({id,prompt:note.min(3),choices:z.array(short.min(1)).min(2).max(8),answer:z.number().int().min(0)}).refine(v=>v.answer<v.choices.length,"Choose an answer in the listed choices.");
export const courseSnapshotSchema=z.object({summary:note.min(10),provider:short.default("TechFlex internal"),sourceReviewed:z.boolean(),lessons:z.array(lessonSchema).min(1).max(100),questions:z.array(questionSchema).max(100),passPercent:z.number().int().min(0).max(100).default(80)});
const common={requestId:id,track:z.enum(learningTracks),technicianId:z.string().min(1).max(180)};
export const learningActionSchema=z.discriminatedUnion("action",[
 z.object({action:z.literal("school_assign"),requestId:id,placementId:z.string().min(1).max(180),courseId:id,track:z.enum(learningTracks)}),
 z.object({...common,action:z.literal("course"),id,version:z.number().int().min(0),title:short,category:z.enum(courseCategories),level:short,manufacturer:short,model:short,credential:short,specialty:short,difficulty:z.enum(difficulties),snapshot:z.record(z.string(),z.unknown())}),
 z.object({...common,action:z.literal("publish"),id,version:z.number().int().positive()}),
 z.object({...common,action:z.literal("enroll"),courseId:id}),
 z.object({...common,action:z.literal("progress"),id,version:z.number().int().positive(),lessonIndex:z.number().int().min(0),completedLessonIds:z.array(id).max(100),answers:z.record(z.string(),z.number().int().min(0)),notes:note,status:z.enum(["in_progress","submitted"])}),
 z.object({...common,action:z.literal("education"),id,version:z.number().int().min(0),course:short,provider:short,officialUrl:z.string().trim().max(2000),costCents:z.number().int().min(0).nullable(),requestedCompanyCents:z.number().int().min(0).nullable(),agreementReference:short,notes:note,status:z.enum(["draft","submitted"])}),
 z.object({...common,action:z.literal("education_review"),id,version:z.number().int().positive(),status:z.enum(["approved","returned","declined"]),approvedCompanyCents:z.number().int().min(0).nullable(),agreementReference:short,decisionNotes:note.min(5)}),
 z.object({...common,action:z.literal("education_completion"),id,version:z.number().int().positive(),trainingRecordId:id}),
]);

export type CourseSnapshot=z.infer<typeof courseSnapshotSchema>;
export function parseSnapshot(value:unknown){return courseSnapshotSchema.parse(value);}
export function safeJson<T>(value:unknown,fallback:T):T{try{return JSON.parse(String(value)) as T;}catch{return fallback;}}
export function courseResult(snapshot:CourseSnapshot,completed:string[],answers:Record<string,number>){
 const done=new Set(completed);const allLessons=snapshot.lessons.every(l=>done.has(l.id));
 const answered=snapshot.questions.every(q=>Number.isInteger(answers[q.id]));
 const correct=snapshot.questions.filter(q=>answers[q.id]===q.answer).length;
 const score=snapshot.questions.length?Math.round(correct*100/snapshot.questions.length):100;
 return {allLessons,answered,score,passed:allLessons&&answered&&score>=snapshot.passPercent};
}
export function validateEducationDates(completedOn:string|null){return !completedOn||isValidDate(completedOn)&&completedOn<=new Date().toISOString().slice(0,10);}
