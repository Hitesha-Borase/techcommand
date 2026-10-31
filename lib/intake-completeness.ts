export type IntakeNoticeType =
  | "new_assignment"
  | "scheduling_reminder"
  | "cancellation"
  | "authorization_update"
  | "general_update";

export type IntakeData = {
  accountId?: string | null;
  locationId?: string | null;
  customerId?: string | null;
  assetId?: string | null;
  technicianId?: string | null;
  externalSource?: string | null;
  externalId?: string | null;
  noticeType?: IntakeNoticeType | null;
  sourceDetailUrl?: string | null;
  responseRequirement?: string | null;
  responseDueAt?: string | null;
  serviceType?: string | null;
  summary?: string | null;
  rawText?: string | null;
  customerName?: string | null;
  customerPhone?: string | null;
  customerEmail?: string | null;
  serviceAddress?: string | null;
  customerComplaint?: string | null;
  equipmentType?: string | null;
  manufacturer?: string | null;
  model?: string | null;
  serialNumber?: string | null;
  authorization?: number | null;
  recommendedBid?: number | null;
  proposedBid?: number | null;
  roundTripMiles?: number | null;
  driveHours?: number | null;
  onsiteHours?: number | null;
  technicianCount?: number | null;
  weightLb?: number | null;
  partsCount?: number | null;
  stairsCount?: number | null;
  hotelCost?: number | null;
  partsCost?: number | null;
  assetCount?: number | null;
  shipmentStatus?: string | null;
  accessInstructions?: string | null;
  scheduledStart?: string | null;
};

export type IntakeIssue = {
  key: string;
  label: string;
  stage: "source" | "customer" | "equipment" | "pricing" | "scheduling";
  reason: string;
};

function hasText(value: unknown) {
  return typeof value === "string" && value.trim().length > 0;
}

export function evaluateIntake(data: IntakeData) {
  const blockers: IntakeIssue[] = [];
  const warnings: IntakeIssue[] = [];
  const requireField = (
    condition: boolean,
    issue: IntakeIssue,
    warning = false,
  ) => {
    if (!condition) (warning ? warnings : blockers).push(issue);
  };

  requireField(hasText(data.externalId), {
    key: "externalId",
    label: "Complete work-order number",
    stage: "source",
    reason: "Include the full suffix, such as N-1 or N-10.",
  });
  requireField(hasText(data.externalSource), {
    key: "externalSource",
    label: "Assignment source",
    stage: "source",
    reason: "Select SpinLife, Invacare, OnPoint, direct customer, or manual.",
  });
  requireField(hasText(data.accountId), {
    key: "accountId",
    label: "Client account",
    stage: "source",
    reason: "Link the paying account before the record advances.",
  });

  const isCancellation = data.noticeType === "cancellation";
  const externalPortal = ["spinlife", "invacare", "onpoint"].includes(
    String(data.externalSource || "").toLowerCase(),
  );
  if (externalPortal) {
    requireField(hasText(data.sourceDetailUrl), {
      key: "sourceDetailUrl",
      label: "Source portal detail link",
      stage: "source",
      reason: "Paste the direct FaST or account work-order link.",
    });
    requireField(
      hasText(data.responseRequirement) || hasText(data.responseDueAt),
      {
        key: "responseRequirement",
        label: "Response requirement or deadline",
        stage: "source",
        reason: "Record the exact deadline language or a known due date.",
      },
    );
  }

  if (!isCancellation) {
    requireField(hasText(data.locationId), {
      key: "locationId",
      label: "Service location",
      stage: "customer",
      reason: "Select or create the address where work will occur.",
    });
    requireField(hasText(data.serviceType), {
      key: "serviceType",
      label: "Service type",
      stage: "source",
      reason: "Choose the job type that controls pricing and instructions.",
    });
    requireField(hasText(data.summary), {
      key: "summary",
      label: "Service description",
      stage: "source",
      reason: "State what TechFlex is being asked to do.",
    });

    const hasCustomerFile = hasText(data.customerId);
    requireField(hasCustomerFile, {
      key: "customerId",
      label: "Linked customer CRM file",
      stage: "customer",
      reason:
        "Create or select the permanent customer record so all future work and documents stay together.",
    });
    requireField(hasText(data.customerName), {
      key: "customerName",
      label: "Customer or facility contact",
      stage: "customer",
      reason: "Confirm the customer or facility name stored in the CRM file.",
    });
    requireField(hasText(data.customerPhone), {
      key: "customerPhone",
      label: "Customer phone number",
      stage: "customer",
      reason:
        "A callable number is required for scheduling and arrival updates.",
    });
    requireField(hasText(data.serviceAddress), {
      key: "serviceAddress",
      label: "Complete service address",
      stage: "customer",
      reason: "Confirm the street, city, state, and ZIP used for routing.",
    });

    const hasAsset = hasText(data.assetId);
    requireField(hasAsset || hasText(data.equipmentType), {
      key: "equipmentType",
      label: "Equipment type",
      stage: "equipment",
      reason:
        "Identify the device, chair, bed, lift, or other equipment category.",
    });
    requireField(hasAsset || hasText(data.manufacturer), {
      key: "manufacturer",
      label: "Manufacturer",
      stage: "equipment",
      reason: "Required for instructions, parts, and technical support.",
    });
    requireField(hasAsset || hasText(data.model), {
      key: "model",
      label: "Model",
      stage: "equipment",
      reason: "Required for model-specific service guidance.",
    });

    const needsComplaint = [
      "evaluation",
      "repair_single",
      "repair_multi",
      "frame_repair",
      "hourly_service",
      "biomed_service_call",
    ].includes(String(data.serviceType || ""));
    if (needsComplaint) {
      requireField(hasText(data.customerComplaint), {
        key: "customerComplaint",
        label: "Customer complaint or reported failure",
        stage: "equipment",
        reason: "Capture the reported symptom before dispatch.",
      });
      requireField(hasText(data.serialNumber), {
        key: "serialNumber",
        label: "Serial number",
        stage: "equipment",
        reason:
          "Use the serial number to verify parts, warranty, and service history.",
      });
    } else {
      requireField(
        hasAsset || hasText(data.serialNumber),
        {
          key: "serialNumber",
          label: "Serial number",
          stage: "equipment",
          reason:
            "Obtain before final service-report submission if unavailable at intake.",
        },
        true,
      );
    }

    requireField(
      typeof data.authorization === "number" && data.authorization > 0,
      {
        key: "authorization",
        label: "Authorization or reimbursement amount",
        stage: "pricing",
        reason: "Required to enforce the 40% gross-margin gate.",
      },
    );
    requireField(
      typeof data.roundTripMiles === "number" && data.roundTripMiles >= 0,
      {
        key: "roundTripMiles",
        label: "Verified round-trip mileage",
        stage: "pricing",
        reason:
          "Enter zero only after confirming the job has no billable travel.",
      },
    );
    requireField(
      typeof data.technicianCount === "number" && data.technicianCount >= 1,
      {
        key: "technicianCount",
        label: "Required technician count",
        stage: "pricing",
        reason: "Confirm crew size before the margin and safety checks run.",
      },
    );

    const isDelivery = ["wgd_basic", "wgd_complex", "bed_delivery"].includes(
      String(data.serviceType || ""),
    );
    if (isDelivery) {
      requireField(typeof data.weightLb === "number" && data.weightLb > 0, {
        key: "weightLb",
        label: "Product weight",
        stage: "pricing",
        reason:
          "Weight determines base pricing and automatic crew requirements.",
      });
      requireField(
        hasText(data.shipmentStatus) && data.shipmentStatus !== "unknown",
        {
          key: "shipmentStatus",
          label: "Shipment or product status",
          stage: "scheduling",
          reason:
            "Confirm whether product is shipped, delivered, or ready to schedule.",
        },
      );
      requireField(
        hasText(data.accessInstructions),
        {
          key: "accessInstructions",
          label: "Site access and delivery conditions",
          stage: "scheduling",
          reason:
            "Record stairs, doorway, parking, dock, elevator, and room access.",
        },
        true,
      );
    }

    if (data.noticeType === "scheduling_reminder") {
      requireField(hasText(data.scheduledStart), {
        key: "scheduledStart",
        label: "Scheduled appointment",
        stage: "scheduling",
        reason:
          "This reminder remains open until the appointment date is entered.",
      });
    }

    requireField(
      hasText(data.customerEmail),
      {
        key: "customerEmail",
        label: "Customer email",
        stage: "customer",
        reason: "Recommended for confirmations and service-report delivery.",
      },
      true,
    );
    requireField(
      hasAsset,
      {
        key: "assetId",
        label: "Linked asset record",
        stage: "equipment",
        reason:
          "Recommended so this visit becomes part of the equipment’s lifetime history.",
      },
      true,
    );
  }

  const total = blockers.length + warnings.length;
  const requiredChecks = total + 1;
  const score = Math.max(
    0,
    Math.round(((requiredChecks - blockers.length) / requiredChecks) * 100),
  );
  return { blockers, warnings, score };
}

export function intakeStatus(data: IntakeData) {
  if (data.noticeType === "cancellation") return "cancellation_review";
  return evaluateIntake(data).blockers.length
    ? "needs_information"
    : "ready_for_pricing";
}
