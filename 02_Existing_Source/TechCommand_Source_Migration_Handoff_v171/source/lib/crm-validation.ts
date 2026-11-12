const fieldLabels: Record<string, string> = {
  name: "Name", accountId: "Account", accountType: "Account category",
  billingEmail: "Billing email", paymentTermsDays: "Payment terms",
  serviceLevel: "Service level", locationType: "Location type",
  address1: "Street address", address2: "Address line 2", city: "City",
  state: "State", postalCode: "ZIP", timezone: "Time zone",
  accessInstructions: "Access instructions", departmentName: "Department name",
};

/** Preserve field-level API guidance without including entered form values. */
export function crmErrorMessage(data: unknown): string {
  if (!data || typeof data !== "object") return "The portal could not save that record. Keep this form open and try again.";
  const payload = data as { error?: unknown; details?: { fieldErrors?: unknown } };
  const fields = payload.details?.fieldErrors;
  if (fields && typeof fields === "object") {
    const messages = Object.entries(fields).flatMap(([field, errors]) =>
      fieldLabels[field] && Array.isArray(errors)
        ? errors.filter((error): error is string => typeof error === "string").map((error) => `${fieldLabels[field]}: ${error}`)
        : [],
    );
    if (messages.length) return messages.join("; ");
  }
  return typeof payload.error === "string" ? payload.error : "The portal could not save that record. Keep this form open and try again.";
}
