export function payCollectionStatusLabel(status: string) {
  switch (status) {
    case "covered_by_contract":
      return "Covered by annual agreement";
    case "funds_received":
      return "Customer funds received";
    case "awaiting_customer_payment":
      return "Awaiting customer payment";
    default:
      return status.replaceAll("_", " ");
  }
}

