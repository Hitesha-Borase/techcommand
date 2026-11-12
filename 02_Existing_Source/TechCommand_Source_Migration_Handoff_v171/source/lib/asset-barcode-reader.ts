import type { ReadResult } from "zxing-wasm/reader";

let reader: Promise<typeof import("zxing-wasm/reader")> | null = null;
async function fallbackReader() {
  if (!reader) {
    reader = import("zxing-wasm/reader").catch((error) => {
      reader = null;
      throw error;
    });
  }
  return reader;
}

export type AssetBarcode = { value: string; format: string };
export function uniqueAssetBarcodes(results: Pick<ReadResult, "text" | "format">[]): AssetBarcode[] {
  const unique = new Map<string, AssetBarcode>();
  for (const result of results) {
    if (result.text && ["Code39", "Code128", "QRCode"].includes(result.format)) unique.set(result.text, { value: result.text, format: result.format });
  }
  return [...unique.values()];
}

export async function readAssetBarcodes(source: ImageData): Promise<AssetBarcode[]> {
  const Detector = (globalThis as unknown as { BarcodeDetector?: {
    new (options: { formats: string[] }): { detect(input: ImageData): Promise<Array<{ rawValue: string; format: string }>> };
    getSupportedFormats?: () => Promise<string[]>;
  } }).BarcodeDetector;
  if (Detector?.getSupportedFormats) {
    try {
      const formats = await Detector.getSupportedFormats();
      const wanted = ["code_39", "code_128", "qr_code"];
      if (wanted.every(format => formats.includes(format))) {
        const native = await new Detector({ formats: wanted }).detect(source);
        const result = uniqueAssetBarcodes(native.map(item => ({ text: item.rawValue,
          format: ({ code_39: "Code39", code_128: "Code128", qr_code: "QRCode" } as Record<string, ReadResult["format"]>)[item.format] })));
        if (result.length) return result;
      }
    } catch { /* A maintained local decoder also handles native API failures. */ }
  }
  const module = await fallbackReader();
  return uniqueAssetBarcodes(await module.readBarcodes(source, { formats: ["Code39", "Code128", "QRCode"], tryHarder: true, maxNumberOfSymbols: 3 }));
}
