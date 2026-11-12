"use client";

import { useState, useEffect } from "react";
import {
  Bell,
  Building,
  CheckCircle2,
  Clock,
  Coins,
  CreditCard,
  Database,
  Globe,
  Lock,
  Mail,
  MapPin,
  Palette,
  Phone,
  Save,
  Shield,
  Smartphone,
  Sliders,
  Sparkles,
} from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

export function SystemSettingsCenter() {
  // Company Profile State
  const [companyName, setCompanyName] = useState("TechFlex Mobility Solutions LLC");
  const [legalName, setLegalName] = useState("TechFlex Medical Services Group LLC");
  const [taxId, setTaxId] = useState("84-2910482");
  const [phone, setPhone] = useState("(614) 890-7600");
  const [supportEmail, setSupportEmail] = useState("support@techflexmobility.com");
  const [billingEmail, setBillingEmail] = useState("billing@techflexmobility.com");
  const [addressLine1, setAddressLine1] = useState("611 Park Meadow Road");
  const [addressLine2, setAddressLine2] = useState("Suite B");
  const [city, setCity] = useState("Westerville");
  const [state, setState] = useState("OH");
  const [postalCode, setPostalCode] = useState("43081");

  // Rate Card State
  const [standardLaborRate, setStandardLaborRate] = useState("125.00");
  const [biomedicalLaborRate, setBiomedicalLaborRate] = useState("175.00");
  const [emergencyLaborRate, setEmergencyLaborRate] = useState("225.00");
  const [standardMileageRate, setStandardMileageRate] = useState("0.85");
  const [metroTripFee, setMetroTripFee] = useState("45.00");
  const [extendedZoneFee, setExtendedZoneFee] = useState("75.00");
  const [defaultPartsMarkup, setDefaultPartsMarkup] = useState("35.0");
  const [minLaborHours, setMinLaborHours] = useState("1.0");

  // Dispatch & Notifications State
  const [autoDispatchRadius, setAutoDispatchRadius] = useState("35");
  const [maxStopsPerTech, setMaxStopsPerTech] = useState("6");
  const [enableCustomerSms, setEnableCustomerSms] = useState(true);
  const [enableAutoPdfInvoice, setEnableAutoPdfInvoice] = useState(true);
  const [enableGeofenceArrival, setEnableGeofenceArrival] = useState(true);
  const [slaWarningMinutes, setSlaWarningMinutes] = useState("30");

  // System & Security State
  const [timezone, setTimezone] = useState("America/New_York");
  const [sessionTimeoutHours, setSessionTimeoutHours] = useState("8");
  const [require2faAdmins, setRequire2faAdmins] = useState(false);
  const [auditLogRetentionDays, setAuditLogRetentionDays] = useState("365");

  const [saving, setSaving] = useState(false);
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

      toast.success(`${section} settings saved successfully!`, {
        description: "Configuration applied to tenant profile and active dispatch engine.",
      });
    } catch (err: unknown) {
      toast.error("Failed to save settings", {
        description: err instanceof Error ? err.message : "Network error occurred",
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header bar */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-bold tracking-tight text-slate-900">System Settings</h1>
            <Badge className="bg-blue-600 hover:bg-blue-700 text-white font-semibold">Tenant Admin</Badge>
          </div>
          <p className="text-sm text-slate-500 mt-0.5">
            Manage company identity, baseline labor & trip rate cards, dispatch rules, and system configuration.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            size="sm"
            onClick={() => handleSave("All System")}
            disabled={saving}
            className="bg-blue-600 hover:bg-blue-700 text-white cursor-pointer h-8 text-xs font-semibold"
          >
            <Save className="mr-1.5 size-3.5" /> {saving ? "Saving Changes..." : "Save All Settings"}
          </Button>
        </div>
      </div>

      {/* Main Tabs */}
      <Tabs defaultValue="profile" className="space-y-4">
        <TabsList className="bg-slate-100 p-1">
          <TabsTrigger value="profile" className="flex items-center gap-1.5">
            <Building className="size-4" /> Company Profile & Branding
          </TabsTrigger>
          <TabsTrigger value="rates" className="flex items-center gap-1.5">
            <Coins className="size-4" /> Rate Cards & Pricing Policy
          </TabsTrigger>
          <TabsTrigger value="dispatch" className="flex items-center gap-1.5">
            <Bell className="size-4" /> Dispatch & Automation Rules
          </TabsTrigger>
          <TabsTrigger value="tenant" className="flex items-center gap-1.5">
            <Database className="size-4" /> Tenant & Security Controls
          </TabsTrigger>
        </TabsList>

        {/* 1. COMPANY PROFILE TAB */}
        <TabsContent value="profile" className="space-y-4">
          <div className="grid gap-4 lg:grid-cols-3">
            <Card className="border-slate-200 bg-white shadow-2xs lg:col-span-2">
              <CardHeader className="p-4 border-b">
                <CardTitle className="text-base font-bold text-slate-900">Company Identity & Location</CardTitle>
                <CardDescription className="text-xs">
                  This information appears on customer invoices, estimate proposals, and technician service slips.
                </CardDescription>
              </CardHeader>
              <CardContent className="p-4 space-y-4">
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-1">
                    <Label className="text-xs font-semibold text-slate-700">Display Brand Name</Label>
                    <Input
                      value={companyName}
                      onChange={(e) => setCompanyName(e.target.value)}
                      className="h-8 text-xs"
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs font-semibold text-slate-700">Legal Entity Name</Label>
                    <Input
                      value={legalName}
                      onChange={(e) => setLegalName(e.target.value)}
                      className="h-8 text-xs"
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs font-semibold text-slate-700">Tax ID / Federal EIN</Label>
                    <Input
                      value={taxId}
                      onChange={(e) => setTaxId(e.target.value)}
                      className="h-8 text-xs font-mono"
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs font-semibold text-slate-700">Main Office Phone</Label>
                    <Input
                      value={phone}
                      onChange={(e) => setPhone(e.target.value)}
                      className="h-8 text-xs"
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs font-semibold text-slate-700">Customer Support Email</Label>
                    <Input
                      value={supportEmail}
                      onChange={(e) => setSupportEmail(e.target.value)}
                      className="h-8 text-xs"
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs font-semibold text-slate-700">Billing & Remittance Email</Label>
                    <Input
                      value={billingEmail}
                      onChange={(e) => setBillingEmail(e.target.value)}
                      className="h-8 text-xs"
                    />
                  </div>
                </div>

                <div className="pt-2 border-t space-y-3">
                  <h4 className="text-xs font-bold text-slate-900">Headquarters Address</h4>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <div className="sm:col-span-2 space-y-1">
                      <Label className="text-xs font-semibold text-slate-700">Street Address</Label>
                      <Input
                        value={addressLine1}
                        onChange={(e) => setAddressLine1(e.target.value)}
                        className="h-8 text-xs"
                      />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs font-semibold text-slate-700">Suite / Unit / Bay</Label>
                      <Input
                        value={addressLine2}
                        onChange={(e) => setAddressLine2(e.target.value)}
                        className="h-8 text-xs"
                      />
                    </div>
                    <div className="grid grid-cols-3 gap-2 sm:col-span-1">
                      <div className="col-span-1 space-y-1">
                        <Label className="text-xs font-semibold text-slate-700">City</Label>
                        <Input
                          value={city}
                          onChange={(e) => setCity(e.target.value)}
                          className="h-8 text-xs"
                        />
                      </div>
                      <div className="space-y-1">
                        <Label className="text-xs font-semibold text-slate-700">State</Label>
                        <Input
                          value={state}
                          onChange={(e) => setState(e.target.value)}
                          className="h-8 text-xs font-mono"
                        />
                      </div>
                      <div className="space-y-1">
                        <Label className="text-xs font-semibold text-slate-700">Postal Code</Label>
                        <Input
                          value={postalCode}
                          onChange={(e) => setPostalCode(e.target.value)}
                          className="h-8 text-xs font-mono"
                        />
                      </div>
                    </div>
                  </div>
                </div>

                <div className="pt-3 flex justify-end">
                  <Button size="sm" onClick={() => handleSave("Company Profile")} className="bg-blue-600 text-white text-xs">
                    Save Profile
                  </Button>
                </div>
              </CardContent>
            </Card>

            {/* Brand Logo & Appearance */}
            <Card className="border-slate-200 bg-white shadow-2xs">
              <CardHeader className="p-4 border-b">
                <CardTitle className="text-base font-bold text-slate-900">Platform Brand & Theme</CardTitle>
                <CardDescription className="text-xs">Corporate styling and customer-facing assets.</CardDescription>
              </CardHeader>
              <CardContent className="p-4 space-y-4">
                <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 text-center">
                  <div className="mx-auto size-16 rounded-2xl bg-gradient-to-br from-[#07243d] to-[#0a455a] text-white flex items-center justify-center shadow-md">
                    <Shield className="size-8 text-cyan-400" />
                  </div>
                  <h4 className="mt-2 text-sm font-bold text-slate-900">TechCommand OS</h4>
                  <p className="text-[11px] text-slate-500">TechFlex Mobility Solutions LLC</p>
                  <Button
                    variant="outline"
                    size="sm"
                    className="mt-3 text-xs"
                    onClick={() => toast.info("Logo uploader: select PNG/SVG under 2MB")}
                  >
                    Change Logo
                  </Button>
                </div>

                <div className="space-y-2 text-xs">
                  <div className="flex justify-between py-1 border-b">
                    <span className="text-slate-500">Brand Primary</span>
                    <span className="font-mono font-bold text-blue-700">#07243d (Dark Navy)</span>
                  </div>
                  <div className="flex justify-between py-1 border-b">
                    <span className="text-slate-500">Accent Highlight</span>
                    <span className="font-mono font-bold text-cyan-600">#06b6d4 (Cyan)</span>
                  </div>
                  <div className="flex justify-between py-1 border-b">
                    <span className="text-slate-500">Invoice Style</span>
                    <span className="font-bold text-slate-800">Healthcare Standard</span>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* 2. RATE CARDS TAB */}
        <TabsContent value="rates" className="space-y-4">
          <Card className="border-slate-200 bg-white shadow-2xs">
            <CardHeader className="p-4 border-b">
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="text-base font-bold text-slate-900">Standard Labor, Mileage & Trip Fee Rates</CardTitle>
                  <CardDescription className="text-xs">
                    Baseline pricing matrix used by automated bid calculations when account-specific contracts are not defined.
                  </CardDescription>
                </div>
                <Badge variant="outline" className="border-emerald-300 bg-emerald-50 text-emerald-800">
                  40% Margin Guardrail Bound
                </Badge>
              </div>
            </CardHeader>
            <CardContent className="p-4 space-y-4">
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                <div className="space-y-1">
                  <Label className="text-xs font-semibold text-slate-700">Standard Field Labor ($/hr)</Label>
                  <div className="relative">
                    <span className="absolute left-2.5 top-2 text-xs text-slate-400 font-bold">$</span>
                    <Input
                      type="number"
                      value={standardLaborRate}
                      onChange={(e) => setStandardLaborRate(e.target.value)}
                      className="h-8 pl-6 text-xs font-mono font-bold"
                    />
                  </div>
                  <p className="text-[10px] text-slate-400">Mobility & manual DME jobs</p>
                </div>

                <div className="space-y-1">
                  <Label className="text-xs font-semibold text-slate-700">Biomedical Specialist ($/hr)</Label>
                  <div className="relative">
                    <span className="absolute left-2.5 top-2 text-xs text-slate-400 font-bold">$</span>
                    <Input
                      type="number"
                      value={biomedicalLaborRate}
                      onChange={(e) => setBiomedicalLaborRate(e.target.value)}
                      className="h-8 pl-6 text-xs font-mono font-bold"
                    />
                  </div>
                  <p className="text-[10px] text-slate-400">Clinical & ventilator calibration</p>
                </div>

                <div className="space-y-1">
                  <Label className="text-xs font-semibold text-slate-700">Emergency / After-Hours ($/hr)</Label>
                  <div className="relative">
                    <span className="absolute left-2.5 top-2 text-xs text-slate-400 font-bold">$</span>
                    <Input
                      type="number"
                      value={emergencyLaborRate}
                      onChange={(e) => setEmergencyLaborRate(e.target.value)}
                      className="h-8 pl-6 text-xs font-mono font-bold"
                    />
                  </div>
                  <p className="text-[10px] text-slate-400">Weekends & post-6PM callouts</p>
                </div>

                <div className="space-y-1">
                  <Label className="text-xs font-semibold text-slate-700">Road Mileage Rate ($/mile)</Label>
                  <div className="relative">
                    <span className="absolute left-2.5 top-2 text-xs text-slate-400 font-bold">$</span>
                    <Input
                      type="number"
                      value={standardMileageRate}
                      onChange={(e) => setStandardMileageRate(e.target.value)}
                      className="h-8 pl-6 text-xs font-mono font-bold"
                    />
                  </div>
                  <p className="text-[10px] text-slate-400">Calculated via Google Maps</p>
                </div>

                <div className="space-y-1">
                  <Label className="text-xs font-semibold text-slate-700">Columbus Metro Trip Fee ($)</Label>
                  <div className="relative">
                    <span className="absolute left-2.5 top-2 text-xs text-slate-400 font-bold">$</span>
                    <Input
                      type="number"
                      value={metroTripFee}
                      onChange={(e) => setMetroTripFee(e.target.value)}
                      className="h-8 pl-6 text-xs font-mono font-bold"
                    />
                  </div>
                  <p className="text-[10px] text-slate-400">Flat vehicle roll charge</p>
                </div>

                <div className="space-y-1">
                  <Label className="text-xs font-semibold text-slate-700">Extended Zone Surcharge ($)</Label>
                  <div className="relative">
                    <span className="absolute left-2.5 top-2 text-xs text-slate-400 font-bold">$</span>
                    <Input
                      type="number"
                      value={extendedZoneFee}
                      onChange={(e) => setExtendedZoneFee(e.target.value)}
                      className="h-8 pl-6 text-xs font-mono font-bold"
                    />
                  </div>
                  <p className="text-[10px] text-slate-400">Stops &gt; 45 miles from hub</p>
                </div>

                <div className="space-y-1">
                  <Label className="text-xs font-semibold text-slate-700">Default Parts Markup (%)</Label>
                  <div className="relative">
                    <Input
                      type="number"
                      value={defaultPartsMarkup}
                      onChange={(e) => setDefaultPartsMarkup(e.target.value)}
                      className="h-8 text-xs font-mono font-bold"
                    />
                  </div>
                  <p className="text-[10px] text-slate-400">Applied above wholesale cost</p>
                </div>

                <div className="space-y-1">
                  <Label className="text-xs font-semibold text-slate-700">Min Billable Labor Time</Label>
                  <div className="relative">
                    <Input
                      type="number"
                      value={minLaborHours}
                      onChange={(e) => setMinLaborHours(e.target.value)}
                      className="h-8 text-xs font-mono font-bold"
                    />
                  </div>
                  <p className="text-[10px] text-slate-400">Minimum 1.0 hr on site</p>
                </div>
              </div>

              <div className="pt-3 flex justify-end">
                <Button size="sm" onClick={() => handleSave("Rate Cards")} className="bg-blue-600 text-white text-xs">
                  Save Rate Cards
                </Button>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* 3. DISPATCH & AUTOMATION RULES TAB */}
        <TabsContent value="dispatch" className="space-y-4">
          <Card className="border-slate-200 bg-white shadow-2xs">
            <CardHeader className="p-4 border-b">
              <CardTitle className="text-base font-bold text-slate-900">Dispatch Logic & Automated Customer Communication</CardTitle>
              <CardDescription className="text-xs">
                Configure auto-route scheduling guardrails and real-time technician arrival notifications.
              </CardDescription>
            </CardHeader>
            <CardContent className="p-4 space-y-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-1">
                  <Label className="text-xs font-semibold text-slate-700">Technician Dispatch Search Radius (Miles)</Label>
                  <Input
                    type="number"
                    value={autoDispatchRadius}
                    onChange={(e) => setAutoDispatchRadius(e.target.value)}
                    className="h-8 text-xs font-mono"
                  />
                  <p className="text-[10px] text-slate-400">Max radius around technician home postal code</p>
                </div>

                <div className="space-y-1">
                  <Label className="text-xs font-semibold text-slate-700">Max Recommended Stops Per Day</Label>
                  <Input
                    type="number"
                    value={maxStopsPerTech}
                    onChange={(e) => setMaxStopsPerTech(e.target.value)}
                    className="h-8 text-xs font-mono"
                  />
                  <p className="text-[10px] text-slate-400">Over-scheduling warning triggers above this count</p>
                </div>
              </div>

              <div className="pt-3 border-t space-y-3">
                <div className="flex items-center justify-between p-3 rounded-xl border bg-slate-50">
                  <div className="space-y-0.5">
                    <Label className="text-xs font-bold text-slate-900">Automated Customer SMS Notifications</Label>
                    <p className="text-[11px] text-slate-500">Send customer an SMS text when technician marks &quot;En Route&quot; with live ETA.</p>
                  </div>
                  <Switch checked={enableCustomerSms} onCheckedChange={setEnableCustomerSms} />
                </div>

                <div className="flex items-center justify-between p-3 rounded-xl border bg-slate-50">
                  <div className="space-y-0.5">
                    <Label className="text-xs font-bold text-slate-900">Auto-Generate PDF Invoices Upon Closeout</Label>
                    <p className="text-[11px] text-slate-500">Immediately render compliance-ready PDF invoice when technician signature is captured.</p>
                  </div>
                  <Switch checked={enableAutoPdfInvoice} onCheckedChange={setEnableAutoPdfInvoice} />
                </div>

                <div className="flex items-center justify-between p-3 rounded-xl border bg-slate-50">
                  <div className="space-y-0.5">
                    <Label className="text-xs font-bold text-slate-900">GPS Geofence Auto-Arrival (250m)</Label>
                    <p className="text-[11px] text-slate-500">Automatically update stop status to &quot;Arrived&quot; when technician vehicle enters client site perimeter.</p>
                  </div>
                  <Switch checked={enableGeofenceArrival} onCheckedChange={setEnableGeofenceArrival} />
                </div>
              </div>

              <div className="pt-3 flex justify-end">
                <Button size="sm" onClick={() => handleSave("Dispatch Rules")} className="bg-blue-600 text-white text-xs">
                  Save Dispatch Rules
                </Button>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* 4. TENANT & SECURITY TAB */}
        <TabsContent value="tenant" className="space-y-4">
          <Card className="border-slate-200 bg-white shadow-2xs">
            <CardHeader className="p-4 border-b">
              <CardTitle className="text-base font-bold text-slate-900">Database & Security Controls</CardTitle>
              <CardDescription className="text-xs">
                Local SQLite replica mode, session lifetimes, and compliance audit trail configuration.
              </CardDescription>
            </CardHeader>
            <CardContent className="p-4 space-y-4">
              <div className="grid gap-4 sm:grid-cols-3">
                <div className="space-y-1">
                  <Label className="text-xs font-semibold text-slate-700">Platform Timezone</Label>
                  <Select value={timezone} onValueChange={setTimezone}>
                    <SelectTrigger className="h-8 text-xs">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="America/New_York">Eastern Time (US & Canada)</SelectItem>
                      <SelectItem value="America/Chicago">Central Time (US & Canada)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-1">
                  <Label className="text-xs font-semibold text-slate-700">Session Inactivity Timeout (Hours)</Label>
                  <Input
                    type="number"
                    value={sessionTimeoutHours}
                    onChange={(e) => setSessionTimeoutHours(e.target.value)}
                    className="h-8 text-xs font-mono"
                  />
                </div>

                <div className="space-y-1">
                  <Label className="text-xs font-semibold text-slate-700">Audit Log Retention (Days)</Label>
                  <Input
                    type="number"
                    value={auditLogRetentionDays}
                    onChange={(e) => setAuditLogRetentionDays(e.target.value)}
                    className="h-8 text-xs font-mono"
                  />
                </div>
              </div>

              <div className="pt-3 border-t">
                <div className="flex items-center justify-between p-3 rounded-xl border bg-slate-50">
                  <div className="space-y-0.5">
                    <Label className="text-xs font-bold text-slate-900">Enforce Two-Factor Authentication for Admins</Label>
                    <p className="text-[11px] text-slate-500">Require TOTP authenticator app verification on super-admin and finance role sign-ins.</p>
                  </div>
                  <Switch checked={require2faAdmins} onCheckedChange={setRequire2faAdmins} />
                </div>
              </div>

              <div className="pt-3 flex justify-end">
                <Button size="sm" onClick={() => handleSave("Security Controls")} className="bg-blue-600 text-white text-xs">
                  Save Security Config
                </Button>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
