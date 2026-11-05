/**
 * Equipment & Model Mismatch Detection
 * Addresses PDF Handoff Page 2:
 * "The screenshots show a Golden Rhea PR-447 job with Jazzy Air 2 notes.
 *  Detect that mismatch and request correction before using those notes in guidance or a final report."
 */

export type ModelMismatchResult = {
  mismatch: boolean;
  expectedUnit: string;
  conflictingBrand: string;
  message: string;
};

interface BrandFamily {
  name: string;
  keywords: string[];
}

const BRAND_FAMILIES: BrandFamily[] = [
  {
    name: "Golden Technologies",
    keywords: ["golden", "rhea", "pr-447", "pr-505", "buzzaround", "companion", "literider", "maxicomfort", "compass"],
  },
  {
    name: "Pride Mobility / Jazzy",
    keywords: ["pride", "jazzy", "jazzy air", "jazzy air 2", "jazzy evo", "quantum", "go-chair", "4front", "edge 3", "q6 edge"],
  },
  {
    name: "Invacare",
    keywords: ["invacare", "pronto", "tdx", "aviva", "solara"],
  },
  {
    name: "Permobil",
    keywords: ["permobil", "tilite", "m3", "m5", "f3", "f5", "corpus"],
  },
  {
    name: "Drive Medical",
    keywords: ["drive medical", "devilbiss", "spitfire", "bobcat", "scout", "zoome"],
  },
  {
    name: "Hoveround",
    keywords: ["hoveround", "mpv5", "teknique"],
  },
  {
    name: "Sunrise Medical / Quickie",
    keywords: ["sunrise medical", "quickie", "q500", "q700"],
  },
];

export function checkModelMismatch(
  manufacturer: string,
  model: string,
  evidenceText: string
): ModelMismatchResult | null {
  const targetHeader = `${manufacturer || ""} ${model || ""}`.toLowerCase().trim();
  if (!targetHeader) return null;

  // Determine expected brand family
  const expectedFamily = BRAND_FAMILIES.find((fam) =>
    fam.keywords.some((kw) => targetHeader.includes(kw))
  );

  if (!expectedFamily) return null;

  const content = evidenceText.toLowerCase();

  // Search if evidence mentions a completely different signature brand/model
  for (const otherFam of BRAND_FAMILIES) {
    if (otherFam.name === expectedFamily.name) continue;

    // Check specific distinct keywords (min 4 chars to avoid false hits)
    const match = otherFam.keywords.find(
      (kw) => kw.length >= 4 && new RegExp(`\\b${kw.replace(/[-/\\^$*+?.()|[\]{}]/g, "\\$&")}\\b`, "i").test(content)
    );

    if (match) {
      const expectedLabel = `${manufacturer || ""} ${model || ""}`.trim() || expectedFamily.name;
      return {
        mismatch: true,
        expectedUnit: expectedLabel,
        conflictingBrand: `${otherFam.name} (${match})`,
        message: `Model Mismatch Detected: This work order specifies ${expectedLabel}, but recorded notes reference "${match}" (${otherFam.name}). Please verify the physical unit before finalizing report.`,
      };
    }
  }

  return null;
}

