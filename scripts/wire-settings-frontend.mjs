import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const targetPath = resolve("components/system-settings-center.tsx");
let content = readFileSync(targetPath, "utf-8");

// 1. Update React import
content = content.replace(
  'import { useState } from "react";',
  'import { useState, useEffect } from "react";'
);

// 2. Add loading state and useEffect + async handleSave
const oldSavePattern = `  const [saving, setSaving] = useState(false);

  const handleSave = (section: string) => {
    setSaving(true);
    setTimeout(() => {
      setSaving(false);
      toast.success(\`\${section} settings saved successfully!\`, {
        description: "Configuration applied to tenant profile and active dispatch engine.",
      });
    }, 500);
  };`;

const newCode = `  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);

  // Load live settings from database via Settings API
  useEffect(() => {
    let isMounted = true;
    async function loadSettings() {
      try {
        setLoading(true);
        const res = await fetch("/api/settings");
        if (!res.ok) throw new Error("Failed to load settings");
        const data = (await res.json()) as { success?: boolean; settings?: Record<string, any> };
        if (data?.settings && isMounted) {
          const s = data.settings;
          if (s.companyName) setCompanyName(s.companyName);
          if (s.legalName) setLegalName(s.legalName);
          if (s.taxId) setTaxId(s.taxId);
          if (s.phone) setPhone(s.phone);
          if (s.supportEmail) setSupportEmail(s.supportEmail);
          if (s.billingEmail) setBillingEmail(s.billingEmail);
          if (s.addressLine1) setAddressLine1(s.addressLine1);
          if (s.addressLine2) setAddressLine2(s.addressLine2);
          if (s.city) setCity(s.city);
          if (s.state) setState(s.state);
          if (s.postalCode) setPostalCode(s.postalCode);

          // Rate cards
          if (s.standardLaborRate) setStandardLaborRate(s.standardLaborRate);
          if (s.biomedicalLaborRate) setBiomedicalLaborRate(s.biomedicalLaborRate);
          if (s.emergencyLaborRate) setEmergencyLaborRate(s.emergencyLaborRate);
          if (s.standardMileageRate) setStandardMileageRate(s.standardMileageRate);
          if (s.metroTripFee) setMetroTripFee(s.metroTripFee);
          if (s.extendedZoneFee) setExtendedZoneFee(s.extendedZoneFee);
          if (s.defaultPartsMarkup) setDefaultPartsMarkup(s.defaultPartsMarkup);
          if (s.minLaborHours) setMinLaborHours(s.minLaborHours);

          // Dispatch & Automation
          if (s.autoDispatchRadius) setAutoDispatchRadius(s.autoDispatchRadius);
          if (s.maxStopsPerTech) setMaxStopsPerTech(s.maxStopsPerTech);
          if (typeof s.enableCustomerSms === "boolean") setEnableCustomerSms(s.enableCustomerSms);
          if (typeof s.enableAutoPdfInvoice === "boolean") setEnableAutoPdfInvoice(s.enableAutoPdfInvoice);
          if (typeof s.enableGeofenceArrival === "boolean") setEnableGeofenceArrival(s.enableGeofenceArrival);
          if (s.slaWarningMinutes) setSlaWarningMinutes(s.slaWarningMinutes);

          // Security
          if (s.timezone) setTimezone(s.timezone);
          if (s.sessionTimeoutHours) setSessionTimeoutHours(s.sessionTimeoutHours);
          if (s.auditLogRetentionDays) setAuditLogRetentionDays(s.auditLogRetentionDays);
          if (typeof s.require2faAdmins === "boolean") setRequire2faAdmins(s.require2faAdmins);
        }
      } catch (err) {
        console.error("Error loading system settings:", err);
      } finally {
        if (isMounted) setLoading(false);
      }
    }
    loadSettings();
    return () => { isMounted = false; };
  }, []);

  const handleSave = async (section: string) => {
    try {
      setSaving(true);
      const payload = {
        companyName,
        legalName,
        taxId,
        phone,
        supportEmail,
        billingEmail,
        addressLine1,
        addressLine2,
        city,
        state,
        postalCode,
        standardLaborRate: parseFloat(standardLaborRate) || 85.0,
        biomedicalLaborRate: parseFloat(biomedicalLaborRate) || 125.0,
        emergencyLaborRate: parseFloat(emergencyLaborRate) || 145.0,
        standardMileageRate: parseFloat(standardMileageRate) || 0.65,
        metroTripFee: parseFloat(metroTripFee) || 45.0,
        extendedZoneFee: parseFloat(extendedZoneFee) || 75.0,
        defaultPartsMarkup: parseFloat(defaultPartsMarkup) || 35.0,
        minLaborHours: parseFloat(minLaborHours) || 1.0,
        autoDispatchRadius: parseInt(autoDispatchRadius, 10) || 35,
        maxStopsPerTech: parseInt(maxStopsPerTech, 10) || 6,
        enableCustomerSms,
        enableAutoPdfInvoice,
        enableGeofenceArrival,
        slaWarningMinutes: parseInt(slaWarningMinutes, 10) || 30,
        timezone,
        sessionTimeoutHours: parseFloat(sessionTimeoutHours) || 8,
        auditLogRetentionDays: parseInt(auditLogRetentionDays, 10) || 365,
        require2faAdmins,
      };

      const res = await fetch("/api/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const errData = (await res.json()) as { error?: string };
        throw new Error(errData?.error || "Failed to save settings");
      }

      toast.success(\`\${section} settings saved successfully!\`, {
        description: "Configuration applied to tenant profile and active dispatch engine.",
      });
    } catch (err: unknown) {
      toast.error("Failed to save settings", {
        description: err instanceof Error ? err.message : "Network error occurred",
      });
    } finally {
      setSaving(false);
    }
  };`;

// Normalize line endings before matching
const normalizedContent = content.replace(/\r\n/g, "\n");
const normalizedOld = oldSavePattern.replace(/\r\n/g, "\n");

if (!normalizedContent.includes(normalizedOld)) {
  console.error("Could not find oldSavePattern in file!");
  process.exit(1);
}

const updatedContent = normalizedContent.replace(normalizedOld, newCode);
writeFileSync(targetPath, updatedContent, "utf-8");
console.log("Successfully wired system-settings-center.tsx to /api/settings!");

