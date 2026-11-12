import {procedureText,readProcedure,readAnswers} from "./asset-ai-procedure";
import { isDelivery, packetStatus, type FieldCheck } from "./spinlife-document-policy";
import invoiceLogo from "./techflex-invoice-logo.json";
import {
  PDFDocument,
  StandardFonts,
  rgb,
  type PDFFont,
  type PDFPage,
} from "pdf-lib";

export class PdfGenerationError extends Error {}

type PdfContext = {
  pdf: PDFDocument;
  regular: PDFFont;
  bold: PDFFont;
  page: PDFPage;
  y: number;
  runningTitle?: string;
  reference?: string;
};

const pageWidth = 612;
const pageHeight = 792;
const margin = 46;

function safeText(value: unknown) {
  return String(value ?? "")
    .replace(/[–—]/g, "-")
    .replace(/[’‘]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/•/g, "-")
    .replace(/[^\x09\x0A\x0D\x20-\x7E]/g, " ")
    .replace(/[ \t]+/g, " ")
    .trim();
}

function money(cents: number) {
  return (Number(cents || 0) / 100).toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
  });
}

function wrap(font: PDFFont, value: string, size: number, width: number) {
  const lines: string[] = [];
  for (const paragraph of safeText(value).split(/\n/)) {
    let line = '';
    for (const word of paragraph.split(/\s+/).filter(Boolean)) {
      // Split long identifiers, URLs and unbroken technician input without clipping.
      let rest = word;
      if (line && font.widthOfTextAtSize(`${line} ${rest}`,size) > width) {lines.push(line);line='';}
      while (font.widthOfTextAtSize(rest,size) > width) {
        let end = 1;
        while (end < rest.length && font.widthOfTextAtSize(rest.slice(0,end+1),size) <= width) end++;
        lines.push(rest.slice(0,end)); rest=rest.slice(end);
      }
      line = line ? `${line} ${rest}` : rest;
    }
    lines.push(line || '');
  }
  return lines.length ? lines : [''];
}

function addPage(context: PdfContext) {
  context.page = context.pdf.addPage([pageWidth, pageHeight]);
  context.y = 742;
  if (context.runningTitle) {
    context.page.drawText(context.runningTitle, {x:margin,y:756,size:11,font:context.bold,color:rgb(.1,.25,.35)});
    context.page.drawText(safeText(context.reference), {x:margin,y:739,size:8,font:context.regular,color:rgb(.4,.45,.5)});
    context.y=713;
  }
}

function ensureSpace(context: PdfContext, height: number) {
  if (context.y - height < 48) addPage(context);
}

function drawText(
  context: PdfContext,
  value: unknown,
  options: {
    size?: number;
    bold?: boolean;
    color?: ReturnType<typeof rgb>;
    indent?: number;
    after?: number;
  } = {},
) {
  const size = options.size ?? 10;
  const font = options.bold ? context.bold : context.regular;
  const indent = options.indent ?? 0;
  const lines = wrap(
    font,
    safeText(value),
    size,
    pageWidth - margin * 2 - indent,
  );
  for (const line of lines) {
    ensureSpace(context, size + 4);
    context.page.drawText(line, {
      x: margin + indent,
      y: context.y,
      size,
      font,
      color: options.color ?? rgb(0.08, 0.14, 0.25),
    });
    context.y -= size + 4;
  }
  context.y -= options.after ?? 0;
}

function header(context: PdfContext, title: string, reference: string) {
  context.page.drawRectangle({
    x: 0,
    y: 748,
    width: pageWidth,
    height: 44,
    color: rgb(0.04, 0.15, 0.29),
  });
  context.page.drawText("TECHFLEX MOBILITY SOLUTIONS", {
    x: margin,
    y: 765,
    size: 14,
    font: context.bold,
    color: rgb(1, 1, 1),
  });
  context.y = 716;
  drawText(context, title.toUpperCase(), {
    size: 18,
    bold: true,
    color: rgb(0.08, 0.37, 0.94),
    after: 4,
  });
  drawText(context, reference, { bold: true, after: 8 });
}

const navy = rgb(.09,.22,.32);
const teal = rgb(.13,.39,.51);
function band(ctx: PdfContext, title: string) {
  ensureSpace(ctx,48);
  ctx.page.drawRectangle({x:margin,y:ctx.y-5,width:pageWidth-2*margin,height:17,color:teal});
  ctx.page.drawText(safeText(title).toUpperCase(),{x:margin+7,y:ctx.y,size:9,font:ctx.bold,color:rgb(1,1,1)});
  ctx.y-=24;
}
function section(ctx: PdfContext, title: string, value: unknown) {
  band(ctx,title);
  drawText(ctx,safeText(value) || 'Not documented.',{size:9,after:9});
}
function table(ctx: PdfContext, rows: string[][], widths: number[], heading?: string[], options: {size?: number; align?: Array<'left'|'center'|'right'>; labelColumns?: number[]} = {}) {
  const size=options.size ?? 8.5;
  const lineHeight=size+3.5;
  const row = (cells: string[], head=false) => {
    const font=head?ctx.bold:ctx.regular;
    const all=cells.map((cell,i)=>wrap(font,cell,size,widths[i]-14));
    const count=Math.max(...all.map(x=>x.length));
    for(let offset=0;offset<count;) {
      ensureSpace(ctx,30);
      const capacity=Math.max(1,Math.floor((ctx.y-64)/lineHeight));
      const take=Math.min(capacity,count-offset);
      const height=take*lineHeight+10;
      let x=margin;
      for(let i=0;i<cells.length;i++) {
        ctx.page.drawRectangle({x,y:ctx.y-height+4,width:widths[i],height,color:head?rgb(.89,.94,.97):(options.labelColumns ?? [0]).includes(i)?rgb(.95,.96,.98):rgb(1,1,1),borderColor:rgb(.85,.88,.91),borderWidth:.4});
        for(let k=0;k<take;k++) if(all[i][offset+k]) {
          const line=all[i][offset+k], textWidth=font.widthOfTextAtSize(line,size), align=options.align?.[i];
          const textX=align==='right'?x+widths[i]-7-textWidth:align==='center'?x+(widths[i]-textWidth)/2:x+7;
          ctx.page.drawText(line,{x:textX,y:ctx.y-size-k*lineHeight,size,font,color:navy});
        }
        x+=widths[i];
      }
      ctx.y-=height;offset+=take;
      if(offset<count)addPage(ctx);
    }
  };
  if(heading)row(heading,true);
  let previousPage=ctx.page;
  for(const cells of rows) {
    ensureSpace(ctx,40);
    if(ctx.page!==previousPage && heading)row(heading,true);
    row(cells); previousPage=ctx.page;
  }
  ctx.y-=10;
}
function reportHeader(ctx: PdfContext, title: string, reference: string, brand='TechFlex Mobility Solutions') {
  ctx.runningTitle=title;ctx.reference=reference;
  const partner=brand==='SpinLife';
  ctx.page.drawText(brand,{x:margin,y:751,size:partner?24:19,font:ctx.bold,color:partner?rgb(.29,.13,.45):navy});
  if(!partner) {
    ctx.page.drawText('611 Park Meadow Rd., STE B, Westerville, OH 43081',{x:margin,y:730,size:8,font:ctx.regular,color:rgb(.4,.45,.5)});
    ctx.page.drawText('877-231-TECH | service@techflexmobility.com',{x:margin,y:718,size:8,font:ctx.regular,color:rgb(.4,.45,.5)});
  }
  const titleLines=title==='Service Report'?['SERVICE','REPORT']:[title.toUpperCase()];
  titleLines.forEach((line,i)=>ctx.page.drawText(line,{x:566-ctx.bold.widthOfTextAtSize(line,16),y:751-i*18,size:16,font:ctx.bold,color:navy}));
  ctx.page.drawText(safeText(reference),{x:margin,y:700,size:8,font:ctx.regular,color:navy});
  ctx.page.drawLine({start:{x:margin,y:691},end:{x:566,y:691},thickness:2,color:partner?rgb(.29,.13,.45):teal});
  ctx.y=675;
}
function footers(ctx: PdfContext, reference: string) {
  const pages=ctx.pdf.getPages();
  pages.forEach((page,i)=>{
    page.drawText(safeText(reference).slice(0,95),{x:margin,y:28,size:7,font:ctx.regular,color:rgb(.4,.45,.5)});
    page.drawText(`Page ${i+1} of ${pages.length}`,{x:495,y:28,size:7,font:ctx.regular,color:rgb(.4,.45,.5)});
  });
}
async function signatureImage(ctx: PdfContext, signature?: {bytes:ArrayBuffer;contentType:string}|null) {
  if(!signature)return;
  let image;
  try { image=signature.contentType==='image/png'?await ctx.pdf.embedPng(signature.bytes):signature.contentType==='image/jpeg'?await ctx.pdf.embedJpg(signature.bytes):null; } catch { throw new PdfGenerationError('Signature image is damaged. Capture the signature again before approval.'); }
  if(!image)throw new PdfGenerationError('Signature format cannot be rendered. Upload a PNG or JPEG signature before approval.');
  ensureSpace(ctx,65);
  const scale=Math.min(210/image.width,50/image.height);
  ctx.page.drawImage(image,{x:margin,y:ctx.y-image.height*scale,width:image.width*scale,height:image.height*scale});
  ctx.y-=image.height*scale+12;
}

async function context(): Promise<PdfContext> {
  const pdf = await PDFDocument.create();
  const regular = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  return {
    pdf,
    regular,
    bold,
    page: pdf.addPage([pageWidth, pageHeight]),
    y: 742,
  } satisfies PdfContext;
}

export async function generateServiceReportPdf(input: {
  documentStatus?: string;
  actualOnsiteMinutes?: number | null;
  technicianApproved?: boolean;
  customerName?: string;
  serviceDate?: string;
  workOrderNumber: string;
  accountName: string;
  locationName: string;
  locationAddress: string;
  technicianName: string;
  serviceType: string;
  summary: string;
  customerComplaint: string;
  equipmentType: string;
  manufacturer: string;
  model: string;
  serialNumber: string;
  findings: string;
  fieldNotes?: string;
  diagnosticSteps: Array<{
    label: string;
    complete: boolean;
    result: string;
  }>;
  workPerformed: string;
  partsUsed: Array<{
    description: string;
    partNumber: string;
    quantity: number;
  }>;
  testResults: string;
  recommendation: string;
  assetDisposition: string;
  checklist: FieldCheck[];
  customerSignatureName: string;
  customerSignedAt: string;
  evidenceCounts: Record<string, number>;
  equipmentProgress?: Array<{
    assetId: string;
    assetTag: string;
    manufacturer: string | null;
    model: string | null;
    serialNumber: string | null;
    status: string;
    notes?: string | null;
    findings: string | null;
    workPerformed: string | null;
    testResults: string | null;
    disposition: string | null;
    notApplicableReason: string | null;
    procedureSnapshotJson?: string | null;
    procedureAnswersJson?: string | null;
  }>;
  signature?: { bytes: ArrayBuffer; contentType: string } | null;
}) {
  const ctx = await context();
  reportHeader(ctx,'Service Report',`${input.accountName} Work Order #${input.workOrderNumber}`);
  if(!input.serviceType.startsWith('biomed')){
    band(ctx,'DME Service Report | Professional DME / Assistive Mobility Service');
  }
  if(input.documentStatus)section(ctx,'Document status',input.documentStatus);
  band(ctx,'Work order / customer information');
  table(ctx,[['Payer / vendor',input.accountName],['Customer',input.customerName || input.locationName],['Address',input.locationAddress],['Service date / technician',`${input.serviceDate || 'Not recorded'} | ${input.technicianName}`]],[130,390]);
  if(input.serviceType.startsWith('biomed')) table(ctx,[['Actual on-site time',input.actualOnsiteMinutes == null ? 'Not recorded' : `${input.actualOnsiteMinutes} minutes (technician documented; billing reviewed separately)`]],[130,390]);
  band(ctx,'Equipment information');
  table(ctx,[['Make / manufacturer',input.manufacturer],['Type / model',`${input.equipmentType} | ${input.model}`],['Serial number(s)',input.serialNumber]],[130,390]);
  if (input.equipmentProgress?.length) {
    band(ctx,'Per-equipment service record');
    for (const item of input.equipmentProgress) {
      const identity = `${item.assetTag} | ${item.manufacturer || 'Manufacturer not recorded'} ${item.model || ''} | Serial ${item.serialNumber || 'not recorded'}`;
      if (item.status === 'not_applicable')
        section(ctx, identity, `N/A for this round - ${item.notApplicableReason || 'Reason not recorded'}`);
      else if (item.status === 'completed')
        section(ctx, identity, [
          `Status: Completed | Disposition: ${(item.disposition || 'not recorded').replaceAll('_',' ')}`,
          `Findings: ${item.findings || 'Not recorded'}`,
          `Work performed: ${item.workPerformed || 'Not recorded'}`,
          `Test results: ${item.testResults || 'Not recorded'}`,
        ].join('\n'));
      else
        section(ctx, identity, `${item.status.replaceAll('_',' ')} - no completed finding is claimed.`);
      if(item.notes?.trim())section(ctx,'Original technician notes',item.notes);
      const source = readProcedure(item.procedureSnapshotJson);
      const answers = readAnswers(item.procedureAnswersJson);
      if(source && answers.some(answer=>answer.status!=="not_started" || answer.result.trim() || answer.measurements.some(measurement=>measurement.recordedValue.trim())))
        section(ctx,'Recorded procedure evidence',procedureText(source,answers));
      else if(source) section(ctx,'Reference for optional guidance',`${source.document.title} | Revision: ${source.document.revision || "not recorded"} | ${source.document.sourceUrl || "source link not recorded"}\nGuided answers were not recorded; see the technician narrative. No protocol completion is implied.`);
    }
  }
  if(input.fieldNotes?.trim())section(ctx,'Original technician notes',input.fieldNotes);
  section(ctx,'Reported issue / service request',input.customerComplaint);
  if(input.diagnosticSteps.some(item=>item.complete||item.result?.trim()))band(ctx,'Recorded guided observations');
  if(input.diagnosticSteps.some(item=>item.complete||item.result?.trim()))table(ctx,input.diagnosticSteps.filter(item=>item.complete||item.result?.trim()).map(item=>[item.label,`${item.complete?'Documented':'Not evaluated'} - ${item.result || 'No result recorded'}`]),[175,345],['Item','Status / finding']);
  section(ctx,'Diagnosis / field findings',input.findings);
  section(ctx,'Work performed',input.workPerformed);
  if(input.partsUsed.length) {
    band(ctx,'Parts installed / used');
    table(ctx,input.partsUsed.map(p=>[`${p.quantity}`,p.description,p.partNumber || 'Not recorded']),[40,330,150],['Qty','Description','Part number']);
  }
  section(ctx,'Final test results',input.testResults);
  section(ctx,'Parts / next-step recommendation',input.recommendation);
  section(ctx,'Service outcome',`${packetStatus(input.assetDisposition)} - ${input.assetDisposition.replaceAll('_',' ')}`);
  if(input.checklist.some(x=>!x.key?.startsWith('sl_')&&(x.complete||x.notApplicable||x.result))) {
    band(ctx,'Completion record');
    table(ctx,input.checklist.filter(x=>!x.key?.startsWith('sl_')&&(x.complete||x.notApplicable||x.result)).map(item=>[item.label,item.notApplicable?`N/A - ${item.reason}`:item.complete?'Documented':'Not completed']),[320,200]);
  }
  section(ctx,'Customer acknowledgement',`${input.customerSignatureName} | ${input.customerSignedAt || 'Date not recorded'}`);
  await signatureImage(ctx,input.signature);
  drawText(ctx,`${input.technicianApproved === false ? 'Prepared from recorded visit information. Technician confirmation has not been recorded.' : input.technicianApproved === true ? 'Prepared from the technician-confirmed visit record.' : 'Prepared from saved field notes and recorded visit information.'} Findings describe the condition observed during this visit. Unperformed tests, unresolved concerns and recommendations are not represented as completed repairs.`,{size:8});
  footers(ctx,`TechFlex Mobility Solutions | WO ${input.workOrderNumber}`);
  return ctx.pdf.save({useObjectStreams:true});
}

export async function generateSpinLifeWorkOrderPdf(input: {
  workOrderNumber:string; customerName:string; customerPhone:string; address:string;
  serviceType:string; serviceDate:string; workOrderDate?:string; manufacturer:string; model:string; serialNumber:string;
  customerComplaint:string; findings:string; workPerformed:string; testResults:string; recommendation:string;
  assetDisposition:string; checklist:FieldCheck[]; customerSignatureName:string;
  technicianName:string; technicianAttestedAt:string; customerSignedAt?:string; signature?:{bytes:ArrayBuffer;contentType:string}|null;
}) {
  const ctx=await context();
  reportHeader(ctx,'Work Order',`WO # ${input.workOrderNumber} | WO date: ${input.workOrderDate || "Not recorded"} | Service: ${input.serviceDate.slice(0,10)}`,'SpinLife');
  band(ctx,'Customer information');
  table(ctx,[['Name / phone',`${input.customerName} | ${input.customerPhone}`],['Street / city / state / ZIP',input.address]],[140,380]);
  band(ctx,'Equipment information');
  table(ctx,[['Make',input.manufacturer],['Model / serial number',`${input.model} | ${input.serialNumber}`]],[140,380]);
  section(ctx,isDelivery(input.serviceType)?'Work order notes':'Description of issue or repair needed',input.customerComplaint);
  band(ctx,isDelivery(input.serviceType)?'Delivery checklist':'Tests performed');
  table(ctx,input.checklist.filter(x=>x.key?.startsWith('sl_')&&x.key!=='sl_attestation').map(item=>[item.label,item.notApplicable?`N/A - ${item.reason}`:item.complete?`[X] ${item.result || 'Completed'}`:'[ ] Not completed']),[265,255],['Check','Result / observation']);
  section(ctx,isDelivery(input.serviceType)?'Additional delivery notes':'Diagnosis / repair summary',`${input.findings}\n${input.workPerformed}\n${input.testResults}`);
  section(ctx,isDelivery(input.serviceType)?'Exceptions / next action':'Parts needed (if any) / resolution request',input.recommendation);
  section(ctx,'Job status',packetStatus(input.assetDisposition));
  section(ctx,'Customer acknowledgement',input.signature?`${input.customerSignatureName || 'Name not recorded'} | ${(input.customerSignedAt || input.serviceDate).slice(0,10)}. Acknowledges the documented service and final condition.`:'No customer signature recorded.');
  await signatureImage(ctx,input.signature);
  const attested=input.checklist.some(x=>x.key==='sl_attestation'&&x.complete&&!x.notApplicable);
  section(ctx,'Technician electronic attestation',attested?`${input.technicianName} | ${input.technicianAttestedAt}. Attested in TechCommand OS that this record accurately describes work performed, tests and observed final condition.`:'Not attested.');
  footers(ctx,`SpinLife WO ${input.workOrderNumber} | Digital service documentation`);
  return ctx.pdf.save({useObjectStreams:true});
}

export type PacketFile = {
  fileName: string;
  contentType: string;
  bytes: ArrayBuffer;
  category: string;
  createdAt?: string;
  caption?: string;
};

async function appendPacketPdf(target: PDFDocument, bytes: ArrayBuffer) {
  const source = await PDFDocument.load(bytes);
  const pages = await target.copyPages(source, source.getPageIndices());
  for (const page of pages) target.addPage(page);
}

async function appendPacketImage(target: PDFDocument, file: PacketFile, sectionTitle: string, reference = "") {
  let image;
  if (file.contentType === "image/jpeg") image = await target.embedJpg(file.bytes);
  else if (file.contentType === "image/png") image = await target.embedPng(file.bytes);
  else throw new PdfGenerationError(`Photo "${file.fileName}" must be converted to PNG or JPEG before packet generation.`);
  const page = target.addPage([pageWidth, pageHeight]);
  const bold = await target.embedFont(StandardFonts.HelveticaBold);
  const regular = await target.embedFont(StandardFonts.Helvetica);
  page.drawRectangle({x:0,y:738,width:612,height:54,color:navy});
  page.drawText(safeText(sectionTitle).toUpperCase(), {
    x: margin, y: 757, size: 10, font: bold, color: rgb(1, 1, 1),
  });
  page.drawText(safeText(file.fileName).slice(0, 82), {
    x: margin, y: 716, size: 8, font: regular, color: rgb(0.35, 0.4, 0.5),
  });
  const availableWidth = pageWidth - margin * 2;
  const availableHeight = 590;
  const scale = Math.min(availableWidth / image.width, availableHeight / image.height, 1);
  page.drawImage(image, {
    x: (pageWidth - image.width * scale) / 2,
    y: 112 + (availableHeight - image.height * scale) / 2,
    width: image.width * scale,
    height: image.height * scale,
  });
  const caption=wrap(regular,file.caption || `${file.category.replaceAll('_',' ')} evidence. ${file.createdAt ? 'Uploaded '+file.createdAt : ''}`,9,520);
  if(caption.length>5) throw new PdfGenerationError('Photo caption exceeds the available area. Shorten the caption before release.');
  caption.forEach((line,i)=>page.drawText(line,{x:margin,y:89-i*12,size:9,font:regular,color:navy}));
  if(reference) page.drawText(safeText(reference).slice(0,115),{x:margin,y:25,size:7,font:regular,color:navy});
  return true;
}

async function appendPhotoGallery(target: PDFDocument, files: PacketFile[], reference: string) {
  const regular=await target.embedFont(StandardFonts.Helvetica);
  const bold=await target.embedFont(StandardFonts.HelveticaBold);
  for(let start=0;start<files.length;start+=6) {
    const page=target.addPage([pageWidth,pageHeight]);
    page.drawRectangle({x:margin,y:744,width:520,height:20,color:teal});
    page.drawText('PHOTO DOCUMENTATION',{x:margin+8,y:750,size:10,font:bold,color:rgb(1,1,1)});
    for(let j=0;j<Math.min(6,files.length-start);j++) {
      const file=files[start+j];
      let image;
      try { image=file.contentType==='image/jpeg'?await target.embedJpg(file.bytes):file.contentType==='image/png'?await target.embedPng(file.bytes):null; }
      catch { throw new PdfGenerationError(`Required photo "${file.fileName}" cannot be rendered. Restore a readable PNG/JPEG before approval.`); }
      if(!image)throw new PdfGenerationError(`Photo "${file.fileName}" requires PNG or JPEG conversion.`);
      const x=margin+(j%2)*268, top=727-Math.floor(j/2)*218;
      page.drawRectangle({x,y:top-148,width:252,height:148,borderColor:rgb(.85,.88,.91),borderWidth:.5});
      const scale=Math.min(246/image.width,142/image.height);
      page.drawImage(image,{x:x+(252-image.width*scale)/2,y:top-148+(148-image.height*scale)/2,width:image.width*scale,height:image.height*scale});
      const caption=wrap(regular,file.caption || `${file.category.replaceAll('_',' ')} evidence`,8,248);
      if(caption.length>6)throw new PdfGenerationError(`The caption for "${file.fileName}" is too long for the gallery. Shorten it or select the large detail layout.`);
      caption.forEach((line,k)=>page.drawText(line,{x:x+2,y:top-162-k*9,size:8,font:regular,color:navy}));
    }
    page.drawText(safeText(reference).slice(0,115),{x:margin,y:25,size:7,font:regular,color:navy});
  }
}

export async function generateCompletionPacketPdf(input: {
  title: string;
  partnerDocument?: Uint8Array;
  sourceDocuments: PacketFile[];
  serviceReport: Uint8Array;
  evidenceImages: PacketFile[];
  evidenceLayout?: "detail" | "gallery";
  packetFooter?: string;
}) {
  const packet = await PDFDocument.create();
  if(input.partnerDocument) await appendPacketPdf(packet,new Uint8Array(input.partnerDocument).buffer);
  for (const file of input.sourceDocuments) {
    try {
      if (file.contentType === 'application/pdf') await appendPacketPdf(packet,file.bytes);
      else await appendPacketImage(packet,file,'Dispatching-company work order');
    } catch { throw new PdfGenerationError(`Required source "${file.fileName}" cannot be rendered. Restore a readable file; the packet was not released.`); }
  }
  await appendPacketPdf(packet,new Uint8Array(input.serviceReport).buffer);
  if(input.evidenceLayout==='gallery') await appendPhotoGallery(packet,input.evidenceImages,input.title);
  else for(const file of input.evidenceImages) {
    try { await appendPacketImage(packet,file,`Photo documentation - ${file.category.replaceAll('_',' ')}`,input.title); }
    catch { throw new PdfGenerationError(`Required photo "${file.fileName}" cannot be rendered. Restore a PNG/JPEG image; the packet was not released.`); }
  }
  packet.setTitle(input.title);
  packet.setSubject("TechFlex service report and supporting evidence");
  packet.setProducer("TechCommand OS");
  if(input.packetFooter) {
    const font=await packet.embedFont(StandardFonts.Helvetica);
    const pages=packet.getPages();
    pages.forEach((page,index)=>{
      page.drawRectangle({x:480,y:21,width:86,height:15,color:rgb(1,1,1)});
      page.drawText(`Page ${index+1} of ${pages.length}`,{x:495,y:28,size:7,font,color:rgb(.4,.45,.5)});
      page.drawText(safeText(input.packetFooter).slice(0,95),{x:margin,y:14,size:6.5,font,color:rgb(.4,.45,.5)});
    });
  }
  return packet.save({ useObjectStreams: true });
}

export async function generateSignedReportReplacementPdf(input: {
  originalPdf: ArrayBuffer;
  workOrderNumber: string;
  reportVersion: number;
  originalAttachmentId: string;
  amendmentRequestId: string;
  reason: string;
  approvedCorrection: string;
  amendmentDecisionNotes: string;
  preparedBy: string;
  preparedAt: string;
  releasedBy: string;
  releasedAt: string;
  releaseNotes: string;
}) {
  let pdf: PDFDocument;
  try {
    pdf = await PDFDocument.load(input.originalPdf);
  } catch {
    throw new PdfGenerationError("The approved report PDF cannot be read. Restore the exact original before releasing a replacement artifact.");
  }
  const regular = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const page = pdf.addPage([pageWidth, pageHeight]);
  const context: PdfContext = { pdf, regular, bold, page, y: 706 };
  page.drawRectangle({ x: 0, y: 738, width: pageWidth, height: 54, color: navy });
  page.drawText("SIGNED REPLACEMENT ARTIFACT", { x: margin, y: 760, size: 15, font: bold, color: rgb(1, 1, 1) });
  page.drawText("Released correction page - original approved artifact retained unchanged", { x: margin, y: 744, size: 8, font: regular, color: rgb(.88, .94, .98) });
  band(context, "Replacement identity");
  table(context, [
    ["Work order", input.workOrderNumber],
    ["Approved report revision", String(input.reportVersion)],
    ["Original attachment", input.originalAttachmentId],
    ["Approved addendum", input.amendmentRequestId],
    ["Release status", "Released - separately attested replacement artifact"],
  ], [170, 350]);
  section(context, "Why a replacement was requested", input.reason);
  section(context, "Approved factual correction", input.approvedCorrection);
  section(context, "Addendum decision basis", input.amendmentDecisionNotes);
  band(context, "Electronic attestations");
  drawText(context, `Prepared and electronically attested by ${input.preparedBy} at ${input.preparedAt}. The signer confirms this replacement contains the approved correction and does not rewrite the original field evidence.`, { size: 9, after: 8 });
  drawText(context, `Independently released by ${input.releasedBy} at ${input.releasedAt}. Release note: ${input.releaseNotes}`, { size: 9, after: 8 });
  drawText(context, "This replacement does not reopen fieldwork, alter the original approved PDF, or create a new service finding, signature, invoice, payment, technician pay, qualification or authorization.", { size: 8, bold: true });
  pdf.setTitle(`Replacement artifact - WO ${safeText(input.workOrderNumber)} - report revision ${input.reportVersion}`);
  pdf.setSubject("Separately attested replacement for an approved TechCommand service report");
  pdf.setProducer("TechCommand OS");
  const pages = pdf.getPages();
  for (const [index, current] of pages.entries()) {
    current.drawRectangle({ x: 466, y: 19, width: 100, height: 18, color: rgb(1, 1, 1) });
    current.drawText(`Page ${index + 1} of ${pages.length}`, { x: 495, y: 28, size: 7, font: regular, color: rgb(.4, .45, .5) });
    current.drawText(`Replacement release | Addendum ${safeText(input.amendmentRequestId).slice(0, 36)}`, { x: margin, y: 14, size: 6.5, font: regular, color: rgb(.4, .45, .5) });
  }
  return pdf.save({ useObjectStreams: true });
}

export async function generateInvoicePdf(input: {
  invoiceNumber: string;
  issuedOn: string;
  dueOn: string;
  workOrderNumber: string;
  accountName: string;
  billingEmail: string;
  serviceLocation: string;
  description: string;
  subtotalCents: number;
  taxCents: number;
  totalCents: number;
  serviceDate?: string;
  jobStatus?: string;
  serviceType?: string;
  workPerformed?: string;
  paymentTermsDays?: number;
  equipment?: { type: string; manufacturer: string; model: string; serialNumber: string; assetTag?: string | null };
}) {
  if(![input.subtotalCents,input.taxCents,input.totalCents].every(Number.isSafeInteger) || input.subtotalCents + input.taxCents !== input.totalCents) throw new PdfGenerationError("Invoice totals do not reconcile.");
  const ctx = await context();
  ctx.runningTitle='TechFlex invoice';ctx.reference=`${input.invoiceNumber} | WO ${input.workOrderNumber}`;
  const logo=await ctx.pdf.embedPng(invoiceLogo.pngBase64);
  const [left,top,right]=invoiceLogo.visibleBounds;
  const scale=178/(right-left);
  ctx.page.drawImage(logo,{x:margin-left*scale,y:748-(invoiceLogo.height-top)*scale,width:invoiceLogo.width*scale,height:invoiceLogo.height*scale});
  const rightText=(value: string,y: number,size: number,bold=false)=>{
    const font=bold?ctx.bold:ctx.regular;
    ctx.page.drawText(value,{x:566-font.widthOfTextAtSize(value,size),y,size,font,color:navy});
  };
  rightText('TechFlex Mobility Solutions',748,14,true);
  if(input.serviceType?.startsWith('biomed')) rightText('Biomedical Equipment Services',733,9.5);
  rightText('611 Park Meadow Rd., Suite B | Westerville, OH 43081',717,9);
  rightText('877-231-TECH (8324)',703,9);
  rightText('service@techflexmobility.com',689,9);
  rightText('Astute Restorations LLC d/b/a TechFlex Mobility Solutions',675,7.8);
  ctx.page.drawRectangle({x:margin,y:621,width:520,height:36,color:rgb(.85,.88,.91),borderColor:rgb(.75,.79,.84),borderWidth:.5});
  ctx.page.drawText('INVOICE',{x:(612-ctx.bold.widthOfTextAtSize('INVOICE',23))/2,y:631,size:23,font:ctx.bold,color:rgb(.08,.35,.57)});
  ctx.y=606;
  const terms=input.paymentTermsDays===0?'Due on receipt':input.paymentTermsDays!==undefined?`Net ${input.paymentTermsDays}`:'Per account agreement';
  table(ctx,[
    ['Invoice number',input.invoiceNumber,'Invoice date',input.issuedOn],
    ['Work order',input.workOrderNumber,'Due date',input.dueOn],
    ['Service date',input.serviceDate?.slice(0,10)||'Not recorded','Terms',terms],
  ],[114,146,114,146],undefined,{size:9.5,labelColumns:[0,2]});
  table(ctx,[[`${input.accountName}${input.billingEmail ? '\n'+input.billingEmail : ''}`,input.serviceLocation]],[260,260],['BILL TO','SERVICE LOCATION'],{size:10,labelColumns:[]});
  if (input.equipment) {
    table(ctx,[[`${input.equipment.type}\nModel: ${input.equipment.model}\nS/N: ${input.equipment.serialNumber}${input.equipment.assetTag ? '\nAsset: '+input.equipment.assetTag : ''}`,input.equipment.manufacturer,`${input.serviceType?.replaceAll('_',' ') || 'Service'}${input.jobStatus ? '\n'+input.jobStatus : ''}`]],[265,145,110],['EQUIPMENT','MANUFACTURER','SERVICE / OUTCOME'],{size:9.5,labelColumns:[]});
  }
  if(input.workPerformed?.trim()) {
    ensureSpace(ctx,50);
    drawText(ctx,'WORK PERFORMED',{size:10,bold:true,after:3});
    drawText(ctx,input.workPerformed,{size:10,after:10});
  }
  table(ctx,[[input.description,'1',money(input.subtotalCents)]],[348,62,110],['Description','Qty','Amount'],{size:10,align:['left','center','right'],labelColumns:[]});
  // Zero in the legacy tax column is not evidence of a confirmed tax exemption.
  if(input.taxCents!==0) table(ctx,[['Subtotal',money(input.subtotalCents)],['Tax',money(input.taxCents)]],[410,110],undefined,{size:10,align:['left','right'],labelColumns:[]});
  ensureSpace(ctx,72);
  ctx.page.drawRectangle({x:margin,y:ctx.y-26,width:520,height:34,color:rgb(.78,.85,.91)});
  ctx.page.drawText('INVOICE TOTAL',{x:margin+8,y:ctx.y-13,size:11,font:ctx.bold,color:navy});
  const total=money(input.totalCents);
  ctx.page.drawText(total,{x:558-ctx.bold.widthOfTextAtSize(total,16),y:ctx.y-15,size:16,font:ctx.bold,color:navy});
  ctx.y-=44;
  drawText(
    ctx,
    `Payment terms: ${terms}. Please reference ${input.invoiceNumber} with your payment.`,
    { size: 9, color: rgb(0.3, 0.35, 0.4), after:6 },
  );
  drawText(ctx,'Thank you for choosing TechFlex Mobility Solutions.',{size:9});
  ctx.pdf.setTitle(`TechFlex Invoice ${input.invoiceNumber}`);
  ctx.pdf.setProducer('TechCommand OS');
  footers(ctx,`TechFlex invoice ${input.invoiceNumber} | WO ${input.workOrderNumber}`);
  return ctx.pdf.save({useObjectStreams:true});
}

export async function generatePayStubPdf(input: {
  technicianName: string;
  technicianCode: string;
  periodStart: string;
  periodEnd: string;
  generatedAt: string;
  items: Array<{
    workOrderNumber: string;
    accountName: string;
    serviceDate: string;
    grossRevenueCents: number;
    payoutCents: number;
    collectionStatus: string;
  }>;
}) {
  const ctx = await context();
  header(
    ctx,
    "Technician Pay Statement",
    `${input.periodStart} through ${input.periodEnd}`,
  );
  drawText(
    ctx,
    `Technician: ${input.technicianName} (${input.technicianCode})`,
  );
  drawText(ctx, `Generated: ${input.generatedAt}`, { after: 12 });
  for (const item of input.items) {
    drawText(ctx, `${item.workOrderNumber} - ${item.accountName}`, {
      bold: true,
    });
    drawText(
      ctx,
      `${item.serviceDate || "Date pending"} | Job revenue ${money(item.grossRevenueCents)} | Technician pay ${money(item.payoutCents)} | ${item.collectionStatus.replaceAll("_", " ")}`,
      { size: 9, after: 7 },
    );
  }
  const total = input.items.reduce((sum, item) => sum + item.payoutCents, 0);
  ctx.y -= 8;
  drawText(ctx, `TOTAL TECHNICIAN PAY: ${money(total)}`, {
    size: 15,
    bold: true,
    color: rgb(0.08, 0.37, 0.94),
    after: 12,
  });
  drawText(
    ctx,
    "This is a contractor pay statement generated from administratively approved TechFlex work-order submissions. Payment status is tracked separately.",
    { size: 8, color: rgb(0.4, 0.45, 0.55) },
  );
  return ctx.pdf.save();
}

export async function generateAssetServiceReportPdf(input:{workOrderNumber:string;accountName:string;assetTag:string;manufacturer:string|null;model:string|null;serialNumber:string|null;status:string;notes:string|null;findings:string|null;workPerformed:string|null;testResults:string|null;disposition:string|null;notApplicableReason:string|null;procedureText:string;recordVersion:number;updatedAt:string;reviewed:boolean;photoEvidenceMode?:"full"|"optimized"|"compact";photoEvidenceCount?:number}) {
 const ctx=await context();
 reportHeader(ctx,'Service Report',`WO #${input.workOrderNumber}`);
 section(ctx,'Document status',`${input.reviewed?'Reviewed service record':input.status==='completed'?'Saved technician record - documentation complete; administrator review is optional.':'Saved technician notes - unfinished work remains as recorded; administrator review is optional.'}\nEvidence revision: R${input.recordVersion}. This revision identifies the exact saved asset record used for this export.`);
 section(ctx,'Facility and equipment',`${input.accountName}\nAsset tag: ${input.assetTag}\nManufacturer: ${input.manufacturer||'Not recorded'} | Model: ${input.model||'Not recorded'}\nSerial: ${input.serialNumber||'Not recorded'}\nEquipment status: ${input.status.replaceAll('_',' ')} | Saved: ${input.updatedAt}`);
 section(ctx,'Observed findings',input.findings);
 section(ctx,'Work performed',input.workPerformed);
 section(ctx,'Actual test results',input.testResults);
 section(ctx,'Disposition and remaining work',`${input.disposition?.replaceAll('_',' ')||'Not recorded'}\n${input.notes||''}\n${input.notApplicableReason?`N/A reason: ${input.notApplicableReason}`:''}`);
 section(ctx,'Workflow, references and per-step record',input.procedureText);
 const photoScope=input.photoEvidenceMode==="compact"&&input.photoEvidenceCount
  ? `Compact photo-reference report: ${input.photoEvidenceCount} exact step-bound photo${input.photoEvidenceCount===1?' is':'s are'} identified in the per-step record above but not embedded in this PDF. The original stored attachment${input.photoEvidenceCount===1?' remains':'s remain'} authoritative and available from the work order.`
  : input.photoEvidenceMode==="optimized"&&input.photoEvidenceCount
   ? `${input.photoEvidenceCount} server-optimized display cop${input.photoEvidenceCount===1?'y follows':'ies follow'} this service report. Each original stored attachment remains authoritative and unchanged.`
  : input.photoEvidenceCount
   ? `${input.photoEvidenceCount} exact step-bound photo${input.photoEvidenceCount===1?' follows':'s follow'} this service report in the full packet.`
   : 'No step-bound photos are recorded for this asset revision.';
 section(ctx,'Scope of this document',`This report contains saved evidence for this asset only. ${photoScope} Work-order-wide photos are not assigned by inference. Inventory, source criteria and unperformed steps are not completed inspections. No signature is supplied by this export. Work-order evidence, signatures and separately reviewed accounting remain in the full closeout packet.`);
 footers(ctx,`WO #${input.workOrderNumber} | ${input.assetTag} | R${input.recordVersion} | ${input.reviewed?'Reviewed':'Saved record'}`);
 return ctx.pdf.save({useObjectStreams:true});
}

export async function generatePmEventStickerPdf(input: {
  workOrderNumber: string;
  reportVersion: number;
  evidenceRevision: number;
  assetTag: string;
  manufacturer: string | null;
  model: string | null;
  serialNumber: string | null;
  disposition: string;
  performedOn: string;
  technicianName: string;
  technicianCode: string;
  authorizedNextDueOn: string | null;
}) {
  const pdf = await PDFDocument.create();
  const regular = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  // Four-by-two-inch stock. Print at actual size; do not scale to a full sheet.
  const page = pdf.addPage([288, 144]);
  const clip = (value: string, font: PDFFont, size: number, maxWidth: number) => {
    let output = safeText(value);
    while (output.length > 1 && font.widthOfTextAtSize(output, size) > maxWidth) output = output.slice(0, -1);
    return output;
  };
  const disposition = safeText(input.disposition).replaceAll("_", " ").toUpperCase();
  const favorable = ["passed", "returned_to_service"].includes(input.disposition);
  const severe = ["quarantined", "retired"].includes(input.disposition);
  const accent = favorable ? rgb(0.04, 0.48, 0.30) : severe ? rgb(0.72, 0.10, 0.10) : rgb(0.78, 0.38, 0.02);
  page.drawRectangle({ x: 0, y: 118, width: 288, height: 26, color: navy });
  page.drawText("TECHFLEX", { x: 12, y: 128, size: 10, font: bold, color: rgb(1, 1, 1) });
  const heading = "REVIEWED PM EVENT";
  page.drawText(heading, { x: 276 - bold.widthOfTextAtSize(heading, 9), y: 128, size: 9, font: bold, color: rgb(1, 1, 1) });
  page.drawRectangle({ x: 10, y: 86, width: 268, height: 25, color: rgb(0.95, 0.97, 0.98), borderColor: accent, borderWidth: 1.4 });
  page.drawText(clip(`ASSET ${input.assetTag}`, bold, 12, 254), { x: 16, y: 96, size: 12, font: bold, color: navy });
  page.drawText(clip(`RESULT: ${disposition}`, bold, 12, 264), { x: 12, y: 72, size: 12, font: bold, color: accent });
  const tech = `${safeText(input.technicianName)} (${safeText(input.technicianCode)})`;
  const due = input.authorizedNextDueOn || "NOT RECORDED";
  page.drawText(`Performed: ${safeText(input.performedOn)}`, { x: 12, y: 57, size: 8.5, font: regular, color: navy });
  page.drawText(clip(`Technician: ${tech}`, regular, 8.5, 264), { x: 12, y: 44, size: 8.5, font: regular, color: navy });
  page.drawText(`Authorized next due: ${safeText(due)}`, { x: 12, y: 31, size: 8.5, font: input.authorizedNextDueOn ? bold : regular, color: input.authorizedNextDueOn ? navy : accent });
  const identity = `${safeText(input.manufacturer || "Manufacturer not recorded")} ${safeText(input.model || "Model not recorded")} | S/N ${safeText(input.serialNumber || "not recorded")}`;
  page.drawText(clip(identity, regular, 6.8, 264), { x: 12, y: 18, size: 6.8, font: regular, color: rgb(0.30, 0.35, 0.40) });
  const reference = `WO ${safeText(input.workOrderNumber)} | Report R${input.reportVersion} | Evidence R${input.evidenceRevision}`;
  page.drawText(clip(reference, regular, 6.3, favorable ? 264 : 145), { x: 12, y: 7, size: 6.3, font: regular, color: rgb(0.30, 0.35, 0.40) });
  if (!favorable) {
    const warning = "DO NOT READ AS PM PASS";
    page.drawText(warning, { x: 276 - bold.widthOfTextAtSize(warning, 7.2), y: 7, size: 7.2, font: bold, color: accent });
  }
  pdf.setTitle(`TechFlex reviewed PM event ${safeText(input.assetTag)}`);
  pdf.setProducer("TechCommand OS");
  return pdf.save({ useObjectStreams: true });
}

export type FacilityRoundReportItem = {
  assetTag: string;
  manufacturer: string | null;
  model: string | null;
  serialNumber: string | null;
  status: string;
  disposition: string | null;
  notApplicableReason: string | null;
  findings: string | null;
  workPerformed: string | null;
  testResults: string | null;
  notes: string | null;
  updatedAt: string;
  historyCount: number;
  lastVisitedAt: string | null;
  lastDisposition: string | null;
  assetDocumentCount: number;
  exceptionReason: string | null;
};

export async function generateFacilityRoundReportPdf(input: {
  reportType: "master" | "exceptions";
  workOrderNumber: string;
  accountName: string;
  locationName: string;
  locationAddress: string;
  serviceType: string;
  workOrderStatus: string;
  reviewed: boolean;
  facilityDocumentCount: number;
  workOrderEvidenceCount: number;
  items: FacilityRoundReportItem[];
}) {
  const ctx = await context();
  const exceptions = input.items.filter((item) => item.exceptionReason);
  const rows = input.reportType === "exceptions" ? exceptions : input.items;
  const completeCount = input.items.filter((item) => item.status === "completed").length;
  const notApplicableCount = input.items.filter((item) => item.status === "not_applicable").length;
  const unfinishedCount = input.items.length - completeCount - notApplicableCount;
  const title = input.reportType === "master"
    ? "Facility Master Report"
    : "Facility Exception Report";
  reportHeader(ctx, title, `WO #${input.workOrderNumber}`);
  section(
    ctx,
    "Document status",
    input.reviewed
      ? "Reviewed work-order record. Individual asset results remain limited to the evidence shown."
      : "Saved operational record. Administrator review is optional; equipment outcomes are limited to the actual evidence recorded.",
  );
  section(
    ctx,
    "Facility and round scope",
    `${input.accountName}\n${input.locationName}\n${input.locationAddress || "Address not recorded"}\nService type: ${input.serviceType.replaceAll("_", " ")} | Work-order status: ${input.workOrderStatus.replaceAll("_", " ")}`,
  );
  table(
    ctx,
    [[
      String(input.items.length),
      String(completeCount),
      String(notApplicableCount),
      String(unfinishedCount),
      String(exceptions.length),
    ]],
    [104, 104, 104, 104, 104],
    ["Selected", "Completed", "N/A", "Unfinished", "Exceptions"],
    { align: ["center", "center", "center", "center", "center"], labelColumns: [] },
  );
  section(
    ctx,
    "Scoped records available",
    `Facility documents: ${input.facilityDocumentCount}. Work-order evidence files: ${input.workOrderEvidenceCount}. Per-asset history and document counts below include only records attached to the same TechFlex organization and exact asset identity. Counts do not establish that a procedure was performed.`,
  );
  band(ctx, input.reportType === "master" ? "Every selected asset" : "Assets requiring attention");
  if (!rows.length) {
    drawText(ctx, "No exceptions are recorded in the last saved asset progress for this round.", { size: 9, after: 8 });
  } else {
    table(
      ctx,
      rows.map((item) => [
        item.assetTag,
        [item.manufacturer, item.model, item.serialNumber ? `S/N ${item.serialNumber}` : "S/N not recorded"].filter(Boolean).join("\n"),
        item.status.replaceAll("_", " "),
        item.disposition?.replaceAll("_", " ") || (item.status === "not_applicable" ? "N/A" : "Not recorded"),
        `${item.historyCount} prior visit${item.historyCount === 1 ? "" : "s"}\nLast: ${item.lastVisitedAt || "not recorded"}\nPrior disposition: ${item.lastDisposition?.replaceAll("_", " ") || "not recorded"}\nAsset files: ${item.assetDocumentCount}`,
      ]),
      [76, 132, 78, 90, 144],
      ["Asset", "Equipment", "Status", "Disposition", "Scoped history"],
      { size: 7.5 },
    );
  }
  if (exceptions.length) {
    band(ctx, "Exception details and follow-up evidence");
    for (const item of exceptions) {
      ensureSpace(ctx, 90);
      drawText(ctx, `${item.assetTag} - ${item.exceptionReason}`, { bold: true, size: 10, after: 2 });
      drawText(ctx, `Findings: ${item.findings || "Not recorded"}`, { size: 8 });
      drawText(ctx, `Work performed: ${item.workPerformed || "Not recorded"}`, { size: 8 });
      drawText(ctx, `Actual test results: ${item.testResults || "Not recorded"}`, { size: 8 });
      drawText(ctx, `Notes / next action: ${item.notes || "Not recorded"}`, { size: 8, after: 7 });
    }
  }
  ensureSpace(ctx, 110);
  section(
    ctx,
    "Report limitations",
    "This report reflects the last saved record for each asset selected on this work order. Not started, in-progress and N/A equipment remain visible. A source limit is not a measured value; a selected asset is not a completed inspection; documentation completion is not an inferred passing test. Individual signed service reports, original evidence and separately reviewed billing remain authoritative for their respective purposes.",
  );
  ctx.pdf.setTitle(`TechFlex ${input.reportType === "master" ? "Facility Equipment Master Report" : "Facility Equipment Exception Report"} - ${input.workOrderNumber}`);
  ctx.pdf.setProducer("TechCommand OS");
  footers(ctx, `WO #${input.workOrderNumber} | ${input.locationName} | ${input.reportType}`);
  return ctx.pdf.save({ useObjectStreams: true });
}
