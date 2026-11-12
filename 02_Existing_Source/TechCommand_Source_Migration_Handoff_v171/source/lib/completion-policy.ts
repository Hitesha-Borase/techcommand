export type ChecklistItem = {
  key: string;
  label: string;
  complete: boolean;
  notApplicable?: boolean;
  reason?: string;
  result?: string;
};

export type EvidenceRequirement = {
  category: string;
  label: string;
  minimum: number;
  guidance: string;
};

export type DiagnosticStep = {
  label: string;
  complete: boolean;
  result: string;
};

const commonChecklist = [
  [
    "identity",
    "Customer, service address, manufacturer, model, and serial number verified",
  ],
  ["complaint", "Customer complaint confirmed in the customer's words"],
  ["safety", "Applicable safety inspection completed"],
  ["findings", "Findings, measurements, and test results documented"],
  [
    "final_test",
    "Final operating condition verified and explained to the customer",
  ],
] as const;

export function completionChecklist(serviceType: string): ChecklistItem[] {
  if(serviceType==="biomed_cataloging")return [["inventory_identity","Facility and equipment identification recorded; missing details are explicit"],["inventory_condition","Observed condition and discrepancies documented without claiming tests"],["inventory_reference","Available references and historical PM information recorded without changing PM dates"],["inventory_handoff","Unresolved issues and follow-up owner documented"]].map(([key,label])=>({key,label,complete:false}));
  const extra = serviceType.startsWith("biomed_pm")
    ? [
        [
          "risk",
          "Risk class, PM interval, and facility asset identity verified",
        ],
        [
          "pm_tests",
          "Applicable mechanical, electrical, alarm, battery, and safety tests completed",
        ],
        ["pm_label", "PM label applied and next due date recorded"],
        [
          "failed_asset",
          "Any failed safety-critical device was quarantined and escalated",
        ],
      ]
    : serviceType.startsWith("wgd") || serviceType === "bed_delivery"
      ? [
          [
            "packaging",
            "Packaging and freight condition documented before opening",
          ],
          [
            "contents",
            "Every carton, accessory, and serial-number label verified",
          ],
          [
            "assembly",
            "Assembly, functional test, and customer demonstration completed",
          ],
        ]
      : [
          [
            "symptom",
            "Reported symptom reproduced or documented as intermittent",
          ],
          [
            "procedure",
            "Manufacturer or approved diagnostic sequence followed",
          ],
          ["loaded_test", "Applicable final testing documented; record limitations or why a test was not performed"],
        ];
  return [...commonChecklist, ...extra].map(([key, label]) => ({
    key,
    label,
    complete: false,
  }));
}

export function diagnosticWorkflow(serviceType: string): DiagnosticStep[] {
  const steps = serviceType.startsWith("biomed_pm")
    ? [
        "Inspect enclosure, cords, connectors, controls, and accessories",
        "Verify asset identity, risk class, PM interval, and applicable procedure",
        "Perform manufacturer-required operational and safety tests",
        "Record measured values, limits, and pass/fail result",
        "Apply PM label and document next due date or quarantine failure",
      ]
    : serviceType.startsWith("wgd") || serviceType === "bed_delivery"
      ? [
          "Inspect packaging and freight condition before opening",
          "Verify cartons, accessories, model, and serial number",
          "Assemble and configure equipment to the approved procedure",
          "Perform manufacturer-authorized functional tests; obey job-specific demonstration restrictions",
          "Demonstrate safe operation and care to the customer",
        ]
      : [
          "Confirm the complaint and reproduce the reported symptom",
          "Complete visual inspection and applicable safety checks",
          "Follow the manufacturer or approved diagnostic sequence",
          "Identify root cause and document measurements or observations",
          "Record repair or disposition and applicable final testing; document unperformed tests and limitations",
        ];
  return steps.map((label) => ({ label, complete: false, result: "" }));
}

export function evidenceRequirements(
  serviceType: string,
): EvidenceRequirement[] {
  if(serviceType==="biomed_cataloging")return [{category:"serial",label:"Equipment identity evidence",minimum:1,guidance:"Capture the label and equipment overview; identify each asset in its caption and record missing or unreadable labels honestly."}];
  const common: EvidenceRequirement[] = [
    {
      category: "client_work_order",
      label: "Dispatching-company work order",
      minimum: 1,
      guidance:
        "Confirm the original partner work order is attached. Add its PDF or screenshots if it is missing.",
    },
    {
      category: "before",
      label: "Before-service photo",
      minimum: 1,
      guidance: "Show the complete equipment and surrounding work area.",
    },
    {
      category: "serial",
      label: "Model and serial label",
      minimum: 1,
      guidance: "Capture a readable manufacturer, model, and serial label.",
    },
    {
      category: "after",
      label: "After-service photo",
      minimum: 1,
      guidance: "Show the final assembled or repaired condition.",
    },
  ];
  if (serviceType.startsWith("biomed_pm"))
    return [
      ...common,
      {
        category: "test",
        label: "Test or measurement evidence",
        minimum: 1,
        guidance:
          "Capture the applicable analyzer, measurement, or pass result.",
      },
      {
        category: "pm_label",
        label: "Applied PM label",
        minimum: 1,
        guidance: "Show the completed PM label and next due date.",
      },
    ];
  if (serviceType.startsWith("wgd") || serviceType === "bed_delivery")
    return [
      {
        category: "packaging",
        label: "Packaging on arrival",
        minimum: 1,
        guidance: "Capture freight and carton condition before opening.",
      },
      ...common,
    ];
  return [
    ...common,
    {
      category: "diagnosis",
      label: "Diagnostic evidence",
      minimum: 1,
      guidance:
        "Capture the fault, measurement, component, or diagnostic screen.",
    },
  ];
}

export function evidenceCounts(rows: Array<{ category: string }>) {
  return rows.reduce<Record<string, number>>((counts, row) => {
    counts[row.category] = (counts[row.category] || 0) + 1;
    return counts;
  }, {});
}

export function missingEvidence(
  requirements: EvidenceRequirement[],
  counts: Record<string, number>,
) {
  return requirements.filter(
    (requirement) => (counts[requirement.category] || 0) < requirement.minimum,
  );
}
