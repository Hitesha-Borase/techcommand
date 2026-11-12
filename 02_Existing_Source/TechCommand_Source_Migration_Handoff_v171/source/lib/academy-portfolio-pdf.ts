import { PDFDocument, StandardFonts, type PDFFont, type PDFPage, rgb } from "pdf-lib";

export type AcademyPortfolioCourse = {
  title: string;
  revision: number;
  status: string;
  trainingStatus: string | null;
  completedLessons: number;
  totalLessons: number;
};

export type AcademyPortfolioTraining = {
  title: string;
  provider: string;
  completedOn: string | null;
};

export type AcademyPortfolioSnapshot = {
  learnerName: string;
  technicianCode: string;
  track: "biomedical" | "dme_mobility";
  generatedAt: string;
  courses: AcademyPortfolioCourse[];
  verifiedTraining: AcademyPortfolioTraining[];
};

const PAGE_WIDTH = 612;
const PAGE_HEIGHT = 792;
const MARGIN = 48;
const BODY_WIDTH = PAGE_WIDTH - MARGIN * 2;

function safeText(value: string) {
  return value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[\u2010-\u2015]/g, "-")
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[\u201c\u201d]/g, '"')
    .replace(/[^\x20-\x7e]/g, "?")
    .replace(/\s+/g, " ")
    .trim();
}

function wrap(value: string, font: PDFFont, size: number, width: number) {
  const words = safeText(value).split(" ").filter(Boolean);
  if (!words.length) return [""];
  const lines: string[] = [];
  let line = "";
  for (const word of words) {
    const candidate = line ? `${line} ${word}` : word;
    if (font.widthOfTextAtSize(candidate, size) <= width) {
      line = candidate;
      continue;
    }
    if (line) lines.push(line);
    if (font.widthOfTextAtSize(word, size) <= width) {
      line = word;
      continue;
    }
    let part = "";
    for (const character of word) {
      if (part && font.widthOfTextAtSize(part + character, size) > width) {
        lines.push(part);
        part = character;
      } else part += character;
    }
    line = part;
  }
  if (line) lines.push(line);
  return lines;
}

function courseStatus(course: AcademyPortfolioCourse) {
  if (course.trainingStatus === "verified") return "Verified training record linked";
  if (course.trainingStatus === "returned") return "Returned for learner review";
  if (course.status === "submitted" || course.trainingStatus === "submitted") return "Submitted for independent training review";
  return course.status === "in_progress" ? "Learner-recorded progress" : safeText(course.status || "Status not recorded");
}

export async function generateAcademyPortfolioPdf(input: AcademyPortfolioSnapshot) {
  const pdf = await PDFDocument.create();
  const regular = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const navy = rgb(0.04, 0.2, 0.32);
  const cyan = rgb(0.02, 0.55, 0.68);
  const muted = rgb(0.32, 0.38, 0.43);
  const pale = rgb(0.94, 0.98, 0.99);
  let page!: PDFPage;
  let y = 0;

  const newPage = () => {
    page = pdf.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
    page.drawRectangle({ x: 0, y: PAGE_HEIGHT - 70, width: PAGE_WIDTH, height: 70, color: navy });
    page.drawText("TECHFLEX ACADEMY", { x: MARGIN, y: PAGE_HEIGHT - 40, size: 18, font: bold, color: rgb(1, 1, 1) });
    page.drawText("LEARNER-OWNED PROGRESS PORTFOLIO", { x: MARGIN, y: PAGE_HEIGHT - 56, size: 8.5, font: bold, color: rgb(0.7, 0.94, 0.98) });
    y = PAGE_HEIGHT - 96;
  };
  const ensure = (height: number) => { if (y - height < 54) newPage(); };
  const text = (value: string, options: { size?: number; font?: PDFFont; color?: ReturnType<typeof rgb>; indent?: number; gap?: number } = {}) => {
    const size = options.size ?? 10;
    const selectedFont = options.font ?? regular;
    const indent = options.indent ?? 0;
    const lines = wrap(value, selectedFont, size, BODY_WIDTH - indent);
    ensure(lines.length * (size + 3) + (options.gap ?? 4));
    for (const line of lines) {
      page.drawText(line, { x: MARGIN + indent, y, size, font: selectedFont, color: options.color ?? navy });
      y -= size + 3;
    }
    y -= options.gap ?? 4;
  };
  const section = (title: string) => {
    ensure(34);
    page.drawRectangle({ x: MARGIN, y: y - 4, width: BODY_WIDTH, height: 24, color: pale });
    page.drawRectangle({ x: MARGIN, y: y - 4, width: 4, height: 24, color: cyan });
    page.drawText(safeText(title).toUpperCase(), { x: MARGIN + 12, y: y + 3, size: 10, font: bold, color: navy });
    y -= 34;
  };

  newPage();
  text(input.learnerName || "Learner name not recorded", { size: 20, font: bold, gap: 5 });
  text(`${input.track === "biomedical" ? "Biomedical / HTM" : "DME / Mobility"} learning record | Technician ${input.technicianCode || "code not recorded"}`, { size: 10, color: muted, gap: 2 });
  text(`Generated ${input.generatedAt.slice(0, 10)} from the learner's exact saved Academy records.`, { size: 9, color: muted, gap: 14 });

  ensure(82);
  page.drawRectangle({ x: MARGIN, y: y - 58, width: BODY_WIDTH, height: 70, color: pale, borderColor: cyan, borderWidth: 0.8 });
  y -= 4;
  text("PROGRESS RECORD - NOT A CREDENTIAL", { size: 10, font: bold, indent: 12, gap: 3 });
  text("This portfolio records online course participation and independently verified training as separate facts. It does not grant competency, a credential, a job title, pay, or independent service authority.", { size: 9, indent: 12, color: muted, gap: 18 });
  y -= 18;

  section("Academy course participation");
  if (!input.courses.length) text("No Academy course participation is recorded for this career track.", { color: muted, gap: 10 });
  for (const course of input.courses) {
    ensure(72);
    text(course.title || "Untitled course", { size: 11, font: bold, gap: 2 });
    text(`Pinned revision ${course.revision} | ${courseStatus(course)}`, { size: 9.5, color: cyan, gap: 2 });
    text(`Lessons recorded complete: ${course.completedLessons} of ${course.totalLessons}`, { size: 9.5, color: muted, gap: 10 });
  }

  section("Independently verified training");
  text("Only training records separately reviewed and marked verified are listed below. Academy course submission alone is not verification.", { size: 9, color: muted, gap: 8 });
  if (!input.verifiedTraining.length) text("No independently verified training is recorded for this career track.", { color: muted, gap: 10 });
  for (const training of input.verifiedTraining) {
    ensure(58);
    text(training.title || "Untitled training", { size: 10.5, font: bold, gap: 2 });
    text(`Provider: ${training.provider || "Not recorded"} | Completed: ${training.completedOn || "Not recorded"}`, { size: 9.5, color: muted, gap: 10 });
  }

  section("Privacy and scope");
  text("This learner copy excludes assessment answers and answer keys, private notes, education sponsorship and cost data, compensation, customer and work-order evidence, and other learners' records.", { size: 9.5, color: muted, gap: 4 });
  text("Technical authorization and practical sign-off remain in their governed records and must be checked before field work.", { size: 9.5, color: muted, gap: 4 });

  const pages = pdf.getPages();
  pages.forEach((current, index) => {
    const footer = `TechCommand OS | Learner copy | Page ${index + 1} of ${pages.length}`;
    current.drawLine({ start: { x: MARGIN, y: 39 }, end: { x: PAGE_WIDTH - MARGIN, y: 39 }, thickness: 0.5, color: rgb(0.78, 0.82, 0.85) });
    current.drawText(footer, { x: MARGIN, y: 25, size: 8, font: regular, color: muted });
  });
  pdf.setTitle(`TechFlex Academy learning portfolio - ${safeText(input.learnerName)}`);
  pdf.setSubject("Learner-owned Academy course participation and independently verified training summary");
  pdf.setAuthor("TechFlex Mobility Solutions");
  pdf.setProducer("TechCommand OS");
  return pdf.save({ useObjectStreams: true });
}
