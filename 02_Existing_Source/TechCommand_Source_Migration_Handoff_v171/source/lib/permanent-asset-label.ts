import { PDFDocument, StandardFonts, type PDFFont, rgb } from "pdf-lib";

const patterns = [
  "212222","222122","222221","121223","121322","131222","122213","122312","132212","221213","221312","231212",
  "112232","122132","122231","113222","123122","123221","223211","221132","221231","213212","223112","312131",
  "311222","321122","321221","312212","322112","322211","212123","212321","232121","111323","131123","131321",
  "112313","132113","132311","211313","231113","231311","112133","112331","132131","113123","113321","133121",
  "313121","211331","231131","213113","213311","213131","311123","311321","331121","312113","312311","332111",
  "314111","221411","431111","111224","111422","121124","121421","141122","141221","112214","112412","122114",
  "122411","142112","142211","241211","221114","413111","241112","134111","111242","121142","121241","114212",
  "124112","124211","411212","421112","421211","212141","214121","412121","111143","111341","131141","114113",
  "114311","411113","411311","113141","114131","311141","411131","211412","211214","211232","2331112",
] as const;

export function encodeCode128B(value: string) {
  if (!/^[\x20-\x7e]+$/.test(value)) throw new Error("The active label contains characters that cannot be represented safely in Code 128.");
  const values = Array.from(value, (character) => character.charCodeAt(0) - 32);
  const checksum = (104 + values.reduce((total, item, index) => total + item * (index + 1), 0)) % 103;
  return [patterns[104], ...values.map((item) => patterns[item]), patterns[checksum], patterns[106]];
}

function clip(value: string, font: PDFFont, size: number, width: number) {
  let output = value.replace(/[\u0000-\u001f\u007f]/g, " ").trim();
  while (output.length > 3 && font.widthOfTextAtSize(output, size) > width) output = `${output.slice(0, -4)}...`;
  return output;
}

export type PermanentAssetLabelSnapshot = {
  labelCode: string;
  assetTag: string;
  manufacturer: string;
  model: string;
  serialNumber: string | null;
  locationName: string;
};

export async function generatePermanentAssetLabelPdf(input: PermanentAssetLabelSnapshot & {
  widthMils: number;
  heightMils: number;
  printNumber: number;
  printedAt: string;
  eventId: string;
}) {
  const width = input.widthMils * 72 / 1000;
  const height = input.heightMils * 72 / 1000;
  const pdf = await PDFDocument.create();
  const regular = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const page = pdf.addPage([width, height]);
  const navy = rgb(0.04, 0.20, 0.32);
  const muted = rgb(0.32, 0.38, 0.43);
  const margin = Math.max(7, Math.min(12, width * 0.045));
  const usable = width - margin * 2;
  const titleSize = Math.max(7.5, Math.min(12, height * 0.095));
  const codeSize = Math.max(8, Math.min(12, height * 0.095));
  const detailSize = Math.max(5.5, Math.min(7, height * 0.055));
  const patternsForValue = encodeCode128B(input.labelCode);
  const modules = patternsForValue.reduce((total, pattern) => total + Array.from(pattern, Number).reduce((sum, part) => sum + part, 0), 20);
  const moduleWidth = usable / modules;
  if (moduleWidth < 0.55) throw new Error("This label code is too dense for the selected stock size. Use a wider label.");
  const headerHeight = Math.max(20, height * 0.18);
  const barcodeBottom = height >= 100 ? 43 : Math.max(28, height * 0.28);
  const barcodeTop = Math.min(height - headerHeight - 7, Math.max(barcodeBottom + 18, height * 0.68));
  page.drawRectangle({ x: 0, y: height - headerHeight, width, height: headerHeight, color: navy });
  page.drawText("TECHFLEX", { x: margin, y: height - titleSize - 5, size: titleSize, font: bold, color: rgb(1, 1, 1) });
  const identity = `ASSET ${input.assetTag}`;
  page.drawText(clip(identity, bold, titleSize, usable * 0.58), { x: width - margin - bold.widthOfTextAtSize(clip(identity, bold, titleSize, usable * 0.58), titleSize), y: height - titleSize - 5, size: titleSize, font: bold, color: rgb(1, 1, 1) });
  let x = margin + moduleWidth * 10;
  for (const pattern of patternsForValue) {
    Array.from(pattern, Number).forEach((part, index) => {
      const partWidth = part * moduleWidth;
      if (index % 2 === 0) page.drawRectangle({ x, y: barcodeBottom, width: partWidth, height: barcodeTop - barcodeBottom, color: rgb(0, 0, 0) });
      x += partWidth;
    });
  }
  const human = clip(input.labelCode, bold, codeSize, usable);
  const humanY = barcodeBottom - codeSize - 2;
  page.drawText(human, { x: (width - bold.widthOfTextAtSize(human, codeSize)) / 2, y: humanY, size: codeSize, font: bold, color: navy });
  const equipment = clip(`${input.manufacturer || "Manufacturer not recorded"} ${input.model || "Model not recorded"} | S/N ${input.serialNumber || "not recorded"}`, regular, detailSize, usable);
  page.drawText(equipment, { x: margin, y: Math.max(height >= 100 ? 18 : 6, humanY - detailSize - 4), size: detailSize, font: regular, color: navy });
  if (height >= 100) {
    const location = clip(input.locationName || "Facility not recorded", regular, detailSize, usable * 0.64);
    page.drawText(location, { x: margin, y: 6, size: detailSize, font: regular, color: muted });
    const ref = `Print ${input.printNumber} | ${input.printedAt.slice(0, 10)} | ${input.eventId.slice(0, 8)}`;
    page.drawText(ref, { x: width - margin - regular.widthOfTextAtSize(ref, Math.max(5, detailSize - 1)), y: 6, size: Math.max(5, detailSize - 1), font: regular, color: muted });
  }
  pdf.setTitle(`TechFlex permanent asset label ${input.assetTag}`);
  pdf.setProducer("TechCommand OS");
  return pdf.save({ useObjectStreams: true });
}
