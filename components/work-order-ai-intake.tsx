"use client";
import {useEffect,useRef,useState} from "react";
import {Button} from "@/components/ui/button";
import {Textarea} from "@/components/ui/textarea";
import {portalFetch,portalJson} from "@/lib/portal-fetch";
export function WorkOrderAiIntake({onExtract,onUpload,onFiles,disabled=false}:{onExtract:(fields:Record<string,unknown>)=>void;onUpload?:(file:File)=>Promise<unknown>;onFiles?:(files:File[])=>void;disabled?:boolean}){
 const input=useRef<HTMLInputElement>(null),[text,setText]=useState(""),[files,setFiles]=useState<File[]>([]),[busy,setBusy]=useState(false),[message,setMessage]=useState("");
 const latest=useRef(onExtract);useEffect(()=>{latest.current=onExtract;},[onExtract]);
 const active=useRef(true),running=useRef(false);useEffect(()=>{active.current=true;return()=>{active.current=false;};},[]);
 const uploaded=useRef(new WeakSet<File>());
 async function read(selected=files){
  if(running.current||disabled)return;running.current=true;setBusy(true);setMessage("Reading available details. You can keep working and save without waiting for AI.");
  try{
   if(onUpload)for(const file of selected){if(!uploaded.current.has(file)){await onUpload(file);uploaded.current.add(file);}}
   const body=new FormData();body.set("sourceText",text);selected.forEach(file=>body.append("files",file));
   const result=await portalJson<{fields:Record<string,unknown>}>(await portalFetch("/api/ai/work-order-extract",{method:"POST",body}),"AI could not read this order. Keep entering details manually.");
   if(!active.current)return;latest.current(result.fields);setMessage("Available information added to empty fields. Check it against the original. Existing answers and equipment records were preserved."+(Array.isArray(result.fields.warnings)?" "+result.fields.warnings.join(" "):""));
  }catch(error){setMessage((error as Error).message+" Your entries and selected files remain here for retry.");}finally{running.current=false;setBusy(false);}
 }
 function choose(selected:File[]){if(selected.length>10||selected.reduce((n,file)=>n+file.size,0)>20*1024*1024||selected.some(file=>!["application/pdf","image/jpeg","image/png","image/webp"].includes(file.type))){setMessage("Choose up to 10 PDF/JPG/PNG/WebP files, totaling 20 MB or less. Larger originals can use the general uploader.");return;}setFiles(selected);onFiles?.(selected);if(selected.length)void read(selected);}
 return <section className="space-y-3 rounded-xl border border-cyan-200 bg-cyan-50 p-4">
  <h3 className="font-bold">Start with a work order</h3>
  <button type="button" className="min-h-20 w-full rounded-lg border-2 border-dashed border-cyan-500 bg-white p-4 text-left" disabled={disabled||busy} onClick={()=>input.current?.click()} onDragOver={e=>e.preventDefault()} onDrop={e=>{e.preventDefault();if(!disabled&&!busy)choose(Array.from(e.dataTransfer.files));}}>Drop work order files here, or choose files · PDF / JPG / PNG / WebP · 20 MB total</button>
  <input ref={input} type="file" multiple accept="application/pdf,image/jpeg,image/png,image/webp" className="hidden" disabled={disabled||busy} onChange={e=>choose(Array.from(e.target.files||[]))}/>
  {files.length>0&&<p className="text-sm">{files.map(file=>file.name).join(", ")}{!onUpload?(onFiles?" · Originals will attach when you save the job.":" · Used for extraction; attach originals to the saved job."):""}</p>}
  <label className="block text-sm font-semibold">Or paste the request<Textarea value={text} maxLength={30000} disabled={disabled||busy} onChange={e=>setText(e.target.value)} placeholder="Paste available work-order information. Missing details can be added later."/></label>
  <Button type="button" variant="outline" disabled={disabled||busy||(!text.trim()&&!files.length)} onClick={()=>void read()}>{busy?"Reading…":"Fill available details with AI"}</Button>
  {message&&<p role="status" className="text-sm">{message}</p>}
 </section>;
}
