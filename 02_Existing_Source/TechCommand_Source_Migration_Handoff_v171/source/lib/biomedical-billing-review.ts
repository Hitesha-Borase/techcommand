export type BiomedicalBillingWorkOrder = {
  assetId: string | null;
  assetSerialNumber: string | null;
  serviceType: string;
  acceptedPriceCents: number;
};

export type BiomedicalBillingReview = {
  mode: "standard" | "covered" | "billable" | "needs_review";
  title: string;
  explanation: string;
  approvalBlocked: boolean;
  invoiceTotalCents: number;
  invoiceDescription: string;
  contractId: string | null;
  contractNumber: string | null;
  contractName: string | null;
  startsOn: string | null;
  endsOn: string | null;
  sourceKey: string | null;
  annualFeeCents: number | null;
  paymentTermsDays: number | null;
  correctiveLaborCentsPerHour: number | null;
  minimumMinutes: number | null;
  incrementMinutes: number | null;
  travelCentsPerHour: number | null;
  mileageCentsPerMile: number | null;
  partsMarkupPercent: number | null;
  minimumPartsMarkupCents: number | null;
  tollsParking: string | null;
  coverageCode: string | null;
};

export type ContractSnapshot = {
  id: string;
  contractNumber: string | null;
  name: string;
  startsOn: string;
  endsOn: string | null;
  status: string;
  termsJson: string | null;
  sourceJson: string | null;
  assetMetadataJson: string | null;
};

type Terms = {
  annualFeeCents?: number;
  paymentTermsDays?: number;
  correctiveLaborCentsPerHour?: number;
  minimumMinutes?: number;
  incrementMinutes?: number;
  travelCentsPerHour?: number;
  mileageCentsPerMile?: number;
  partsMarkupPercent?: number;
  minimumPartsMarkupCents?: number;
  tollsParking?: string;
  cArmCorrectiveIncluded?: boolean;
  cArmSerials?: string[];
};

function parsed<T>(value: string | null | undefined, fallback: T): T {
  if (!value) return fallback;
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}

function base(
  workOrder: BiomedicalBillingWorkOrder,
  contract?: ContractSnapshot,
): BiomedicalBillingReview {
  const terms = parsed<Terms>(contract?.termsJson, {});
  const source = parsed<{ sourceKey?: string }>(contract?.sourceJson, {});
  const asset = parsed<{ coverage?: string }>(contract?.assetMetadataJson, {});
  return {
    mode: "standard",
    title: "Approved work-order price",
    explanation: "No saved Biomedical/PM agreement applies. The separately approved work-order price will be used.",
    approvalBlocked: false,
    invoiceTotalCents: workOrder.acceptedPriceCents,
    invoiceDescription: "Approved service",
    contractId: contract?.id || null,
    contractNumber: contract?.contractNumber || null,
    contractName: contract?.name || null,
    startsOn: contract?.startsOn || null,
    endsOn: contract?.endsOn || null,
    sourceKey: source.sourceKey || null,
    annualFeeCents: Number.isFinite(terms.annualFeeCents) ? Number(terms.annualFeeCents) : null,
    paymentTermsDays: Number.isFinite(terms.paymentTermsDays) ? Number(terms.paymentTermsDays) : null,
    correctiveLaborCentsPerHour: Number.isFinite(terms.correctiveLaborCentsPerHour) ? Number(terms.correctiveLaborCentsPerHour) : null,
    minimumMinutes: Number.isFinite(terms.minimumMinutes) ? Number(terms.minimumMinutes) : null,
    incrementMinutes: Number.isFinite(terms.incrementMinutes) ? Number(terms.incrementMinutes) : null,
    travelCentsPerHour: Number.isFinite(terms.travelCentsPerHour) ? Number(terms.travelCentsPerHour) : null,
    mileageCentsPerMile: Number.isFinite(terms.mileageCentsPerMile) ? Number(terms.mileageCentsPerMile) : null,
    partsMarkupPercent: Number.isFinite(terms.partsMarkupPercent) ? Number(terms.partsMarkupPercent) : null,
    minimumPartsMarkupCents: Number.isFinite(terms.minimumPartsMarkupCents) ? Number(terms.minimumPartsMarkupCents) : null,
    tollsParking: terms.tollsParking || null,
    coverageCode: asset.coverage || null,
  };
}

function hold(review: BiomedicalBillingReview, explanation: string): BiomedicalBillingReview {
  return {
    ...review,
    mode: "needs_review",
    title: "Billing decision needed",
    explanation,
    approvalBlocked: true,
    invoiceTotalCents: 0,
    invoiceDescription: "Billing held for agreement review",
  };
}

/**
 * Classify a submitted biomedical visit from the saved contract and saved asset
 * metadata. Coverage is never inferred from a facility name or free text.
 */
export function biomedicalBillingReview(
  workOrder: BiomedicalBillingWorkOrder,
  contracts: ContractSnapshot[],
  today = new Date().toISOString().slice(0, 10),
): BiomedicalBillingReview {
  if (!workOrder.serviceType.startsWith("biomed")) return base(workOrder);
  if(workOrder.serviceType==="biomed_cataloging")return hold(base(workOrder,contracts[0]),"Cataloging billing is deferred to administrator review. No hourly rate or annual-PM charge is inferred from this inventory workflow.");
  if (!contracts.length) return base(workOrder);
  const active = contracts.filter(
    (contract) =>
      contract.status === "active" &&
      contract.startsOn <= today &&
      (!contract.endsOn || today < contract.endsOn),
  );
  if (active.length !== 1) {
    const review = base(workOrder, contracts[0]);
    return hold(
      review,
      active.length > 1
        ? "More than one active Biomedical/PM agreement matches this account. An administrator must resolve the contract records before approving billing."
        : "The saved Biomedical/PM agreement is not active for this service date. Review a signed amendment or separately approved authorization before billing.",
    );
  }
  const contract = active[0];
  const review = base(workOrder, contract);
  const terms = parsed<Terms>(contract.termsJson, {});
  const coverage = review.coverageCode;
  if (!workOrder.assetId || !coverage)
    return hold(
      review,
      "The submitted visit is not linked to an equipment record with saved agreement coverage. Link the exact asset or record separate customer authorization before approving billing.",
    );
  if (coverage === "excluded_outlet_reference") {
    return {
      ...review,
      mode: "billable",
      title: "Excluded from the annual agreement",
      explanation: "Outlet/receptacle testing is reference-only and excluded. Use only a separately authorized work-order price; the annual fee does not cover this service.",
      approvalBlocked: workOrder.acceptedPriceCents <= 0,
      invoiceDescription: "Separately authorized service outside annual agreement",
    };
  }
  const preventiveMaintenance = workOrder.serviceType.startsWith("biomed_pm");
  const enrolledCArm = coverage === "enrolled_c_arm";
  const serialIsEnrolled = Boolean(
    workOrder.assetSerialNumber &&
      terms.cArmSerials?.includes(workOrder.assetSerialNumber),
  );
  if (enrolledCArm && !serialIsEnrolled)
    return hold(
      review,
      "This equipment is marked as an enrolled C-arm, but its saved serial does not match the signed agreement. Verify the original identifier or signed amendment before approval.",
    );
  const covered =
    (preventiveMaintenance && ["annual_pm", "enrolled_c_arm"].includes(coverage)) ||
    (!preventiveMaintenance && enrolledCArm && terms.cArmCorrectiveIncluded === true);
  if (covered) {
    return {
      ...review,
      mode: "covered",
      title: "Covered — no additional service charge",
      explanation: preventiveMaintenance
        ? "This equipment's scheduled PM is included in the active annual agreement. The completion invoice will document coverage at $0 instead of charging the per-asset amount again."
        : "Ordinary service for this enrolled C-arm is included in the active agreement. The completion invoice will document coverage at $0 instead of billing routine corrective service again.",
      approvalBlocked: false,
      invoiceTotalCents: 0,
      invoiceDescription: `Covered under ${contract.contractNumber || contract.name} — no additional service charge`,
    };
  }
  return {
    ...review,
    mode: "billable",
    title: "Separate authorization applies",
    explanation: "Corrective work for this equipment is outside the annual PM coverage. The separately approved work-order price will be used; the annual fee is not charged again.",
    approvalBlocked: workOrder.acceptedPriceCents <= 0,
    invoiceDescription: `Separately authorized corrective service under ${contract.contractNumber || contract.name}`,
  };
}
