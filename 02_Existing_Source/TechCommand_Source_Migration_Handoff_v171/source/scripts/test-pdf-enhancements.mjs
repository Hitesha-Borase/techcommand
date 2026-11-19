import fs from 'node:fs';
import { PDFDocument, rgb, StandardFonts } from 'pdf-lib';
import { TECHFLEX_LOGO_BASE64 } from '../lib/techflex-logo-data.ts';

const pageWidth = 612;
const pageHeight = 792;
const margin = 46;
const navy = rgb(0.09, 0.22, 0.32);
const teal = rgb(0.13, 0.39, 0.51);

function safeText(value) {
  return String(value ?? '').replace(/[^\x09\x0A\x0D\x20-\x7E]/g, ' ').replace(/[ \t]+/g, ' ').trim();
}

function wrap(font, value, size, width) {
  const lines = [];
  for (const paragraph of safeText(value).split(/\n/)) {
    let line = '';
    for (const word of paragraph.split(/\s+/).filter(Boolean)) {
      let rest = word;
      if (line && font.widthOfTextAtSize(`${line} ${rest}`, size) > width) { lines.push(line); line = ''; }
      while (font.widthOfTextAtSize(rest, size) > width) {
        let end = 1;
        while (end < rest.length && font.widthOfTextAtSize(rest.slice(0, end + 1), size) <= width) end++;
        lines.push(rest.slice(0, end)); rest = rest.slice(end);
      }
      line = line ? `${line} ${rest}` : rest;
    }
    lines.push(line || '');
  }
  return lines.length ? lines : [''];
}

async function generateSampleFullPdf() {
  const pdf = await PDFDocument.create();
  const regular = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const logoBytes = Uint8Array.from(atob(TECHFLEX_LOGO_BASE64), c => c.charCodeAt(0));
  const logoImage = await pdf.embedPng(logoBytes);

  let page = pdf.addPage([pageWidth, pageHeight]);
  let y = 742;

  function ensureSpace(h) {
    if (y - h < 48) {
      page = pdf.addPage([pageWidth, pageHeight]);
      y = 742;
      page.drawText('Lift Chair Service Report', { x: margin, y: 756, size: 10, font: bold, color: navy });
      page.drawText('WO-2026-8812-OH | Continuous Record', { x: margin, y: 742, size: 7.5, font: regular, color: rgb(0.4, 0.45, 0.5) });
      y = 716;
    }
  }

  function band(title) {
    ensureSpace(32);
    page.drawRectangle({ x: margin, y: y - 16, width: 520, height: 16, color: rgb(0.92, 0.95, 0.97) });
    page.drawText(title.toUpperCase(), { x: margin + 7, y: y - 12, size: 8, font: bold, color: navy });
    y -= 26;
  }

  function section(title, body) {
    ensureSpace(40);
    page.drawText(title, { x: margin, y, size: 9, font: bold, color: navy });
    y -= 13;
    const lines = wrap(regular, body, 8.5, 520);
    lines.forEach(l => {
      ensureSpace(12);
      page.drawText(l, { x: margin, y, size: 8.5, font: regular, color: rgb(0.15, 0.2, 0.25) });
      y -= 11.5;
    });
    y -= 8;
  }

  function table(rows, widths, heading = null) {
    ensureSpace(30);
    const renderRow = (cells, isHeader = false) => {
      let x = margin;
      const font = isHeader ? bold : regular;
      const size = isHeader ? 8 : 7.8;
      const cellLines = cells.map((c, i) => wrap(font, c, size, widths[i] - 12));
      const maxL = Math.max(...cellLines.map(l => l.length));
      const rowH = Math.max(16, maxL * 10 + 6);
      ensureSpace(rowH);
      if (isHeader) {
        page.drawRectangle({ x: margin, y: y - rowH + 4, width: 520, height: rowH, color: rgb(0.88, 0.92, 0.95) });
      } else {
        page.drawLine({ start: { x: margin, y: y + 4 }, end: { x: 566, y: y + 4 }, thickness: 0.5, color: rgb(0.85, 0.88, 0.9) });
      }
      cells.forEach((c, i) => {
        const lines = cellLines[i];
        lines.forEach((l, idx) => {
          page.drawText(l, { x: x + 6, y: y - 7 - idx * 10, size, font, color: isHeader ? navy : rgb(0.15, 0.2, 0.25) });
        });
        x += widths[i];
      });
      y -= rowH;
    };
    if (heading) renderRow(heading, true);
    for (const r of rows) renderRow(r);
    y -= 8;
  }

  // --- PAGE 1: Header ---
  const logoW = 74;
  const logoH = (logoImage.height / logoImage.width) * logoW;
  page.drawImage(logoImage, { x: margin, y: 708, width: logoW, height: logoH });
  const textX = margin + logoW + 10;
  page.drawText('TECHFLEX MOBILITY SOLUTIONS', { x: textX, y: 757, size: 10, font: bold, color: navy });
  page.drawText('611 Park Meadow Rd., STE B | Westerville, OH 43081', { x: textX, y: 746, size: 7.2, font: regular, color: rgb(0.35, 0.4, 0.45) });
  page.drawText('877-231-TECH (8324) | service@techflexmobility.com', { x: textX, y: 735, size: 7.2, font: regular, color: rgb(0.35, 0.4, 0.45) });
  page.drawText('DME FIELD SERVICE | EVALUATION AND CORRECTIVE REPAIR', { x: textX, y: 724, size: 7, font: bold, color: teal });

  // Right Header
  page.drawText('LIFT CHAIR', { x: 566 - bold.widthOfTextAtSize('LIFT CHAIR', 13), y: 757, size: 13, font: bold, color: navy });
  page.drawText('SERVICE REPORT', { x: 566 - bold.widthOfTextAtSize('SERVICE REPORT', 13), y: 742, size: 13, font: bold, color: navy });
  page.drawText('WO # 163093570N-1', { x: 566 - regular.widthOfTextAtSize('WO # 163093570N-1', 7.5), y: 728, size: 7.5, font: regular, color: rgb(0.4, 0.45, 0.5) });
  page.drawLine({ start: { x: margin, y: 698 }, end: { x: 566, y: 698 }, thickness: 1.5, color: teal });
  y = 684;

  // Title & Subtitle
  page.drawText('Lift Chair Service Report', { x: margin, y, size: 15, font: bold, color: navy });
  y -= 13;
  page.drawText('Onsite evaluation and temporary restoration of two Golden Technologies chairs', { x: margin, y, size: 8, font: regular, color: rgb(0.35, 0.4, 0.45) });
  y -= 18;

  // Status Badge Banner
  page.drawRectangle({ x: margin, y: y - 18, width: 520, height: 18, color: rgb(0.93, 0.96, 0.99), borderColor: rgb(0.72, 0.81, 0.89), borderWidth: 0.8 });
  page.drawText('TEMPORARY FUNCTION RESTORED | OEM PARTS REQUIRED', { x: margin + 10, y: y - 13, size: 8, font: bold, color: navy });
  y -= 28;

  // Work order / customer information
  band('Work order / customer information');
  table([
    ['Payer / vendor', 'SpinLife / Private Pay | Field Dispatch'],
    ['Customer', 'Eleanor & Robert Vance'],
    ['Address', '1428 Elm Creek Dr., Westerville, OH 43082'],
    ['Service date / technician', 'November 12, 2026 | Marcus Miller (Lead Field Tech)'],
  ], [130, 390]);

  // Equipment serviced (4 columns)
  band('Equipment serviced');
  table([
    ["Spouse's chair (primary repair)", 'Golden Technologies PR531 Extra Wide', 'GT-PR531-EW-89214', 'Temporary function restored; OEM parts needed'],
    ["Husband's companion chair", 'Golden Technologies PR535 MaxiComfort', 'GT-PR535-MC-66230', 'Operational; loaner remote installed; OEM parts needed'],
  ], [130, 150, 100, 140], ['Chair / Unit', 'Manufacturer and model', 'Serial number', 'Service status']);

  section('Reported issue / service request', 'Customer reports Spouse PR531 chair is stuck in partial recline and non-responsive to remote buttons. Loud motor hum observed when buttons pressed. Husband companion chair PR535 remote cord has intermittent contact.');
  section('Diagnosis / field findings', 'Inspected PR531: hand control wire became caught and pinched in scissor mechanism during recline travel. Two conductors severed and outer insulation stripped. Motor and transformer functional under bench jump test. Husband companion PR535 has loose strain relief at remote base resulting in intermittent connection.');

  // --- PAGE 2 ---
  page = pdf.addPage([pageWidth, pageHeight]);
  y = 742;
  page.drawText('Lift Chair Service Report', { x: margin, y: 756, size: 10, font: bold, color: navy });
  page.drawText('WO # 163093570N-1 | Eleanor Vance', { x: margin, y: 742, size: 7.5, font: regular, color: rgb(0.4, 0.45, 0.5) });
  y = 716;

  section('Work performed', '1. Disassembled lower frame cover on PR531 and carefully extracted pinched cable from scissor linkage.\n2. Stripped damaged wire segment, spliced signal leads temporarily, and heat-shrunk exposed conductors to restore chair to upright safe exit position.\n3. Verified mechanical scissor clearance and applied zip-tie strain relief away from pivot arms.\n4. Tested companion PR535 with field stock loaner 2-button remote to confirm hand control was the sole fault; chair operating normally on loaner.');

  // Required OEM Parts Table
  band('Required Golden Technologies OEM parts');
  table([
    ['Two-button hand control / remote assembly', '1', "Spouse's PR531 - replace damaged spliced remote"],
    ['Power transformer and cable harness', '1', "Husband's PR535 - replace worn remote / cable assembly"],
  ], [230, 40, 250], ['Part required', 'Qty', 'Chair and purpose']);

  section('Final test results', 'PR531 returned to upright exit position. Full raise and lower tested without occupant. Occupant safely assisted. Companion PR535 fully operational with loaner hand control.');
  section('Parts / next-step recommendation', 'Order two Golden OEM hand controls. Schedule follow-up installation visit upon delivery of parts. Customer advised not to adjust PR531 recline until permanent replacement is installed.');
  section('Service outcome', 'Temporary function restored - follow up visit required for permanent OEM replacement.');

  band('Customer acknowledgement');
  section('Customer signature', 'Eleanor Vance | November 12, 2026 at 2:45 PM EDT. Customer confirms temporary restoration explained and agrees not to operate recline until new OEM remote is installed.');

  // Page 3: Photographic Service Record (2x2 Grid)
  const page3 = pdf.addPage([pageWidth, pageHeight]);
  page3.drawRectangle({ x: margin, y: 744, width: 520, height: 22, color: teal });
  page3.drawText('PHOTOGRAPHIC SERVICE RECORD', { x: margin + 8, y: 751, size: 10, font: bold, color: rgb(1, 1, 1) });
  const p3Ref = 'WO # 163093570N-1 | Eleanor Vance';
  page3.drawText(p3Ref, { x: 566 - regular.widthOfTextAtSize(p3Ref, 7.5), y: 752, size: 7.5, font: regular, color: rgb(0.9, 0.95, 1) });

  const cardW = 252;
  const cardH = 280;
  const gapX = 16;
  const gapY = 14;
  const startY = 730;

  const samplePhotos = [
    { title: 'Photo 1: Scissor mechanism cable catch', caption: 'Pinched wiring harness trapped in PR531 right scissor bracket, causing loss of power.' },
    { title: 'Photo 2: Damaged insulation detail', caption: 'Severed internal conductor and stripped vinyl sheathing prior to temporary repair.' },
    { title: 'Photo 3: Temporary splice & clearance', caption: 'Conductors reconnected, insulated with heat-shrink, and routed away from hinge points.' },
    { title: 'Photo 4: Serial number & rating tag', caption: 'Golden Technologies PR531 Extra Wide serial tag GT-PR531-EW-89214 verified.' },
  ];

  for (let j = 0; j < 4; j++) {
    const col = j % 2;
    const row = Math.floor(j / 2);
    const cardX = margin + col * (cardW + gapX);
    const cardY = startY - (row + 1) * cardH - row * gapY;

    // Card border
    page3.drawRectangle({
      x: cardX,
      y: cardY,
      width: cardW,
      height: cardH,
      borderColor: rgb(0.82, 0.86, 0.9),
      borderWidth: 0.8,
      color: rgb(0.99, 1, 1),
    });

    // Header bar
    page3.drawRectangle({
      x: cardX,
      y: cardY + cardH - 20,
      width: cardW,
      height: 20,
      color: rgb(0.94, 0.96, 0.98),
      borderColor: rgb(0.82, 0.86, 0.9),
      borderWidth: 0.5,
    });
    page3.drawText(samplePhotos[j].title, {
      x: cardX + 6,
      y: cardY + cardH - 14,
      size: 7.5,
      font: bold,
      color: navy,
    });

    // Image box
    const imgBoxW = 242;
    const imgBoxH = 185;
    const imgBoxX = cardX + 5;
    const imgBoxY = cardY + cardH - 25 - imgBoxH;

    page3.drawRectangle({
      x: imgBoxX,
      y: imgBoxY,
      width: imgBoxW,
      height: imgBoxH,
      color: rgb(0.95, 0.97, 0.98),
      borderColor: rgb(0.88, 0.91, 0.94),
      borderWidth: 0.5,
    });

    // Draw placeholder photo icon / text inside image box
    page3.drawText('[ Photo Image Captured Onsite ]', {
      x: imgBoxX + 50,
      y: imgBoxY + 90,
      size: 8.5,
      font: regular,
      color: rgb(0.45, 0.5, 0.55),
    });

    // Caption below image
    const captionLines = wrap(regular, samplePhotos[j].caption, 7.5, cardW - 14);
    captionLines.slice(0, 4).forEach((l, k) => {
      page3.drawText(l, {
        x: cardX + 7,
        y: imgBoxY - 12 - k * 9.5,
        size: 7.5,
        font: regular,
        color: navy,
      });
    });
  }

  // Follow-up Box at bottom of Page 3
  const followUpY = 46;
  const followUpH = 50;
  page3.drawRectangle({
    x: margin,
    y: followUpY,
    width: 520,
    height: followUpH,
    color: rgb(0.95, 0.97, 0.99),
    borderColor: teal,
    borderWidth: 1,
  });
  page3.drawText('Required follow-up:', {
    x: margin + 8,
    y: followUpY + followUpH - 14,
    size: 8.5,
    font: bold,
    color: navy,
  });
  const recNotice = 'Do not operate Spouse PR531 until replacement hand control is installed. Companion PR535 loaner hand control must be swapped when new OEM control arrives.';
  const recLines = wrap(regular, recNotice, 7.5, 504);
  recLines.slice(0, 3).forEach((l, k) => {
    page3.drawText(l, {
      x: margin + 8,
      y: followUpY + followUpH - 26 - k * 10,
      size: 7.5,
      font: regular,
      color: rgb(0.2, 0.25, 0.3),
    });
  });

  // Footer for all pages
  const pages = pdf.getPages();
  pages.forEach((p, idx) => {
    p.drawText(`TechFlex Mobility Solutions | Lift Chair Service Report | WO # 163093570N-1`, {
      x: margin,
      y: 26,
      size: 7,
      font: regular,
      color: rgb(0.4, 0.45, 0.5),
    });
    p.drawText(`Page ${idx + 1} of ${pages.length}`, {
      x: 520,
      y: 26,
      size: 7,
      font: regular,
      color: rgb(0.4, 0.45, 0.5),
    });
  });

  const bytes = await pdf.save();
  fs.writeFileSync('c:/Users/hp/Downloads/Techcommand-OS/02_Existing_Source/TechCommand_Source_Migration_Handoff_v171/source/public/sample-lift-chair-report.pdf', bytes);
  console.log('SUCCESS: Generated 3-page Lift Chair Service Report PDF, size:', bytes.length);
}

generateSampleFullPdf().catch(console.error);
