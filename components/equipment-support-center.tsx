"use client";

import { AlertTriangle, ExternalLink, Phone, Search, ShieldCheck } from "lucide-react";
import { useMemo, useState } from "react";
import { Input } from "@/components/ui/input";

const contacts = [
  { maker: "Golden Technologies", phone: "800-624-6374", hours: "Mon–Fri 8:30 AM–5 PM ET", note: "Have the serial number ready.", url: "https://goldentech.com/contact/" },
  { maker: "Pride Mobility", phone: "800-800-4258", hours: "Mon–Fri 8:30 AM–5 PM ET", note: "Technical and warranty support.", url: "https://www.pridemobility.com/warranty/" },
  { maker: "Invacare", phone: "800-333-6900", hours: "Business support", note: "General product and account support.", url: "https://www.invacare.com/prospective-customer-registration/" },
  { maker: "Drive DeVilbiss", phone: "877-224-0946", hours: "Mon–Fri 9 AM–6 PM ET", note: "techsupport@drivemedical.com", url: "https://www.drivemedical.com/contact-us-consumers" },
  { maker: "Joerns Healthcare", phone: "800-826-0270", hours: "Manufacturer support", note: "Beds, lifts, surfaces, and accessories.", url: "https://www.joerns.com/wp-content/uploads/2023/10/EasyCare-Warranty.pdf" },
  { maker: "Arjo", phone: "800-323-1245", hours: "Option 3 · 24/7/365", note: "Technical services.", url: "https://www.arjo.com/en-us/pardot/us/arjo-care/arjo-care-talk-to-an-expert/" },
  { maker: "Midmark Medical", phone: "844-856-1233", hours: "Mon–Fri 8 AM–5 PM ET", note: "Medical customer experience.", url: "https://www.midmark.com/service-support/customer-experience" },
  { maker: "EDAN USA", phone: "888-850-4597", hours: "Option 2 · Mon–Fri 8 AM–5 PM PT", note: "info@edanusa.com", url: "https://edanusa.com/contact-pages/" },
];

const questions = ["What exact symptom can be reproduced, and under what load or condition?", "What manufacturer, model, serial number, and software/firmware version are present?", "Are there displayed fault codes, alarm text, indicator patterns, or abnormal sounds?", "What power-source, battery, charger, fuse, connector, cable, or accessory checks were completed?", "What changed immediately before the failure: transport, impact, fluid, repair, part replacement, or power event?", "Does the unit pass its manufacturer-specified operational and safety test after service?"];

export function EquipmentSupportCenter() {
  const [search, setSearch] = useState("");
  const visible = useMemo(() => contacts.filter((item) => `${item.maker} ${item.phone} ${item.note}`.toLowerCase().includes(search.toLowerCase())), [search]);
  return <div className="space-y-5">
    <section className="grid gap-4 lg:grid-cols-[1fr_.8fr]"><article className="rounded-xl border bg-white p-5"><div className="flex items-start gap-3"><ShieldCheck className="mt-0.5 size-6 text-blue-600"/><div><h2 className="font-bold">Safe field diagnostic sequence</h2><p className="mt-1 text-sm leading-6 text-slate-600">Identify the exact unit, reproduce the complaint when safe, document observations and measured values, follow the official model-specific manual, then complete a functional and safety test.</p></div></div><ol className="mt-4 grid gap-2">{questions.map((question, index) => <li key={question} className="flex gap-3 rounded-lg bg-slate-50 p-3 text-sm"><span className="grid size-6 shrink-0 place-items-center rounded-full bg-blue-100 text-xs font-bold text-blue-700">{index + 1}</span>{question}</li>)}</ol></article><article className="rounded-xl border border-amber-200 bg-amber-50 p-5"><AlertTriangle className="size-6 text-amber-700"/><h2 className="mt-3 font-bold text-amber-950">No unsupported shortcuts</h2><p className="mt-2 text-sm leading-6 text-amber-900">Never bypass an interlock or safety device. De-energize and follow lockout procedures where applicable. Quarantine patient-care equipment that fails a safety-critical test. This guide supports—not replaces—the manufacturer’s current service manual and facility policy.</p></article></section>
    <article className="rounded-xl border bg-white p-5"><div className="flex flex-wrap items-center justify-between gap-3"><div><h2 className="font-bold">Verified manufacturer support desk</h2><p className="mt-1 text-sm text-slate-500">Use the official source link to confirm current hours and model-specific documentation.</p></div><div className="relative"><Search className="absolute left-3 top-2.5 size-4 text-slate-400"/><Input className="w-72 pl-9" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search manufacturer…"/></div></div><div className="mt-5 grid gap-3 md:grid-cols-2 xl:grid-cols-4">{visible.map((item) => <div key={item.maker} className="rounded-xl border p-4"><p className="font-bold">{item.maker}</p><a className="mt-3 flex items-center gap-2 text-sm font-semibold text-blue-700" href={`tel:${item.phone}`}><Phone className="size-4"/>{item.phone}</a><p className="mt-2 text-xs text-slate-500">{item.hours}</p><p className="mt-2 text-xs text-slate-600">{item.note}</p><a className="mt-4 inline-flex items-center gap-1 text-xs font-bold text-blue-700" href={item.url} target="_blank" rel="noreferrer">Official source <ExternalLink className="size-3"/></a></div>)}</div></article>
  </div>;
}
