"use client";

import { useState } from "react";
import {
  Activity,
  AlertCircle,
  ArrowDownRight,
  ArrowUpRight,
  BarChart2,
  Calendar,
  CheckCircle,
  Clock,
  DollarSign,
  Download,
  FileSpreadsheet,
  Filter,
  Layers,
  PieChart,
  ShieldCheck,
  TrendingUp,
  Users,
} from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
  AreaChart,
  Area,
} from "recharts";

const MONTHLY_REVENUE_DATA = [
  { month: "May", revenue: 112000, directCost: 61500, margin: 45.1 },
  { month: "Jun", revenue: 124500, directCost: 69200, margin: 44.4 },
  { month: "Jul", revenue: 138000, directCost: 75800, margin: 45.0 },
  { month: "Aug", revenue: 142000, directCost: 81500, margin: 42.6 },
  { month: "Sep", revenue: 149500, directCost: 83200, margin: 44.3 },
  { month: "Oct", revenue: 154280, directCost: 85470, margin: 44.6 },
];

const ACCOUNT_MARGIN_DATA = [
  { account: "Ohio VA Healthcare System", revenue: 46200, laborCost: 15200, partsCost: 8400, grossMargin: 48.9, status: "Healthy" },
  { account: "MetroHealth Biomedical", revenue: 38400, laborCost: 12800, partsCost: 7600, grossMargin: 46.8, status: "Healthy" },
  { account: "Sunrise Medical Specialty", revenue: 29100, laborCost: 10400, partsCost: 6100, grossMargin: 43.3, status: "Healthy" },
  { account: "SpinLife DME Mobility", revenue: 24800, laborCost: 9900, partsCost: 5900, grossMargin: 36.3, status: "Flagged" },
  { account: "CareSource Community DME", revenue: 15780, laborCost: 6800, partsCost: 3100, grossMargin: 37.2, status: "Flagged" },
];

const TECHNICIAN_METRICS = [
  { id: "tech-1", name: "Marcus Vance", role: "Mobility Tech Lead", billableHours: 142, driveHours: 32, adminHours: 14, utilization: 86.2, firstTimeFix: 93.5, jobsCompleted: 48, revenueGen: 52400 },
  { id: "tech-2", name: "Elena Rostova", role: "Biomedical Specialist", billableHours: 154, driveHours: 26, adminHours: 18, utilization: 88.5, firstTimeFix: 96.0, jobsCompleted: 62, revenueGen: 64800 },
  { id: "tech-3", name: "David Chen", role: "DME Field Tech", billableHours: 128, driveHours: 38, adminHours: 16, utilization: 79.0, firstTimeFix: 89.2, jobsCompleted: 39, revenueGen: 37080 },
];

const SLA_COMPLIANCE_DATA = [
  { metric: "Emergency Callout Response (< 2 Hours)", target: "95.0%", actual: "97.4%", status: "Met", delta: "+2.4%" },
  { metric: "Annual Biomedical PM On-Time Rate", target: "98.0%", actual: "99.2%", status: "Met", delta: "+1.2%" },
  { metric: "First-Time Resolution Rate", target: "90.0%", actual: "92.9%", status: "Met", delta: "+2.9%" },
  { metric: "Customer Satisfaction Index (CSAT)", target: "4.7 / 5.0", actual: "4.9 / 5.0", status: "Met", delta: "+0.2" },
  { metric: "Invoice Generation Within 24hr of Closeout", target: "95.0%", actual: "98.1%", status: "Met", delta: "+3.1%" },
];

export function OperationsReportsCenter() {
  const [period, setPeriod] = useState("oct-2026");
  const [marginThreshold, setMarginThreshold] = useState("40");

  const totalRev = 154280;
  const totalCost = 85470;
  const overallMargin = (((totalRev - totalCost) / totalRev) * 100).toFixed(1);
  const flaggedAccountsCount = ACCOUNT_MARGIN_DATA.filter((a) => a.grossMargin < parseFloat(marginThreshold)).length;

  return (
    <div className="space-y-6">
      {/* Header bar */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-bold tracking-tight text-slate-900">Operations & Financial Reports</h1>
            <Badge className="bg-emerald-600 hover:bg-emerald-700 text-white font-semibold">Active Period</Badge>
          </div>
          <p className="text-sm text-slate-500 mt-0.5">
            40% gross margin guardrail auditing, technician utilization, revenue breakdown, and SLA compliance.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Select value={period} onValueChange={setPeriod}>
            <SelectTrigger className="h-8 w-36 text-xs bg-white border-slate-300">
              <Calendar className="mr-1.5 size-3.5 text-slate-500" />
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="oct-2026">October 2026</SelectItem>
              <SelectItem value="sep-2026">September 2026</SelectItem>
              <SelectItem value="q3-2026">Q3 2026 (Full)</SelectItem>
              <SelectItem value="ytd-2026">Year-to-Date 2026</SelectItem>
            </SelectContent>
          </Select>
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              toast.info("Generating Operations Audit Report (PDF)...");
              setTimeout(() => toast.success("Operations Audit Report downloaded"), 800);
            }}
            className="cursor-pointer h-8 text-xs"
          >
            <Download className="mr-1.5 size-3.5" /> Export PDF
          </Button>
          <Button
            size="sm"
            onClick={() => {
              toast.info("Exporting Margin Ledger (CSV)...");
              setTimeout(() => toast.success("Margin Ledger CSV exported"), 700);
            }}
            className="bg-blue-600 hover:bg-blue-700 text-white cursor-pointer h-8 text-xs"
          >
            <FileSpreadsheet className="mr-1.5 size-3.5" /> Export CSV
          </Button>
        </div>
      </div>

      {/* KPI Headline Cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card className="border-slate-200 bg-white shadow-2xs">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-xs font-semibold text-slate-500 uppercase">Gross Margin Guardrail</CardTitle>
            <div className="p-2 rounded-lg bg-emerald-50 text-emerald-600"><TrendingUp className="size-4" /></div>
          </CardHeader>
          <CardContent>
            <div className="flex items-baseline gap-2">
              <span className="text-2xl font-extrabold text-emerald-700">{overallMargin}%</span>
              <span className="text-xs font-bold text-slate-400">Target: ≥40.0%</span>
            </div>
            <p className="text-xs text-emerald-600 font-medium mt-1 flex items-center gap-1">
              <ArrowUpRight className="size-3.5" /> +4.6% Above contractual floor
            </p>
          </CardContent>
        </Card>

        <Card className="border-slate-200 bg-white shadow-2xs">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-xs font-semibold text-slate-500 uppercase">Total Revenue (Month)</CardTitle>
            <div className="p-2 rounded-lg bg-blue-50 text-blue-600"><DollarSign className="size-4" /></div>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-extrabold text-slate-900">${totalRev.toLocaleString()}</div>
            <p className="text-xs text-blue-600 font-medium mt-1">+8.2% vs previous month</p>
          </CardContent>
        </Card>

        <Card className="border-slate-200 bg-white shadow-2xs">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-xs font-semibold text-slate-500 uppercase">Direct Technician & Parts Cost</CardTitle>
            <div className="p-2 rounded-lg bg-slate-50 text-slate-600"><BarChart2 className="size-4" /></div>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-extrabold text-slate-900">${totalCost.toLocaleString()}</div>
            <p className="text-xs text-slate-500 mt-1">Labor $52,140 · Parts $33,330</p>
          </CardContent>
        </Card>

        <Card className="border-slate-200 bg-white shadow-2xs">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-xs font-semibold text-slate-500 uppercase">Margin Alerts (&lt; 40%)</CardTitle>
            <div className="p-2 rounded-lg bg-amber-50 text-amber-600"><AlertCircle className="size-4" /></div>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-extrabold text-amber-700">{flaggedAccountsCount} Accounts</div>
            <p className="text-xs text-amber-600 font-medium mt-1">Rate adjustment recommended</p>
          </CardContent>
        </Card>
      </div>

      {/* Tabs */}
      <Tabs defaultValue="margin" className="space-y-4">
        <TabsList className="bg-slate-100 p-1">
          <TabsTrigger value="margin" className="flex items-center gap-1.5">
            <TrendingUp className="size-4" /> 40% Margin Guardrail
          </TabsTrigger>
          <TabsTrigger value="revenue" className="flex items-center gap-1.5">
            <BarChart2 className="size-4" /> Revenue & Cost Trends
          </TabsTrigger>
          <TabsTrigger value="utilization" className="flex items-center gap-1.5">
            <Users className="size-4" /> Technician Utilization
          </TabsTrigger>
          <TabsTrigger value="sla" className="flex items-center gap-1.5">
            <ShieldCheck className="size-4" /> SLA & Quality Compliance
          </TabsTrigger>
        </TabsList>

        {/* 1. MARGIN GUARDRAIL TAB */}
        <TabsContent value="margin" className="space-y-4">
          <div className="grid gap-4 lg:grid-cols-3">
            {/* Account Breakdown Table */}
            <Card className="border-slate-200 bg-white shadow-2xs lg:col-span-2">
              <CardHeader className="p-4 border-b">
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle className="text-base font-bold text-slate-900">Gross Margin by Partner & Account</CardTitle>
                    <CardDescription className="text-xs">
                      Enforcing the 40% gross margin guardrail. Flagged accounts require labor or trip rate renegotiation.
                    </CardDescription>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <span className="text-xs text-slate-500">Floor:</span>
                    <Badge variant="outline" className="border-red-200 bg-red-50 text-red-700 font-bold text-xs">
                      40.0% Guardrail
                    </Badge>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="p-0">
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-slate-50 border-b border-slate-200 text-slate-600 font-semibold">
                      <tr>
                        <th className="py-2.5 px-4">Account / Facility</th>
                        <th className="py-2.5 px-3 text-right">Revenue</th>
                        <th className="py-2.5 px-3 text-right">Labor Cost</th>
                        <th className="py-2.5 px-3 text-right">Parts Cost</th>
                        <th className="py-2.5 px-3 text-center">Gross Margin</th>
                        <th className="py-2.5 px-4 text-center">Status</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {ACCOUNT_MARGIN_DATA.map((item, idx) => {
                        const isFlagged = item.grossMargin < 40;
                        return (
                          <tr key={idx} className="hover:bg-slate-50/80 transition-colors">
                            <td className="py-3 px-4 font-bold text-slate-800">{item.account}</td>
                            <td className="py-3 px-3 text-right font-mono text-slate-700">${item.revenue.toLocaleString()}</td>
                            <td className="py-3 px-3 text-right font-mono text-slate-600">${item.laborCost.toLocaleString()}</td>
                            <td className="py-3 px-3 text-right font-mono text-slate-600">${item.partsCost.toLocaleString()}</td>
                            <td className="py-3 px-3 text-center">
                              <span className={`font-extrabold font-mono text-sm ${isFlagged ? "text-red-700" : "text-emerald-700"}`}>
                                {item.grossMargin.toFixed(1)}%
                              </span>
                            </td>
                            <td className="py-3 px-4 text-center">
                              {isFlagged ? (
                                <Badge className="bg-red-600 text-white text-[10px] hover:bg-red-700 cursor-pointer" onClick={() => toast.warning(`Open rate sheet editor for ${item.account}`)}>
                                  ⚠️ Below 40% Floor
                                </Badge>
                              ) : (
                                <Badge className="bg-emerald-600 text-white text-[10px]">
                                  ✓ Compliant
                                </Badge>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>

            {/* Guardrail Policy Card */}
            <Card className="border-slate-200 bg-white shadow-2xs">
              <CardHeader className="p-4 border-b">
                <CardTitle className="text-base font-bold text-slate-900">Guardrail Enforcement Policy</CardTitle>
                <CardDescription className="text-xs">Rule definitions active on portal bid calculations.</CardDescription>
              </CardHeader>
              <CardContent className="p-4 space-y-4">
                <div className="rounded-xl border border-blue-100 bg-blue-50/60 p-3 text-xs space-y-2">
                  <div className="flex items-center gap-2 font-bold text-blue-900">
                    <ShieldCheck className="size-4 text-blue-600" /> Contractual Floor: 40%
                  </div>
                  <p className="text-slate-600 leading-relaxed">
                    TechFlex automated bid workspace calculates minimum billable amount as:
                    <span className="block mt-1 font-mono font-semibold text-blue-950 bg-white/80 p-1.5 rounded border border-blue-200">
                      Required Bid = (Direct Labor + Parts Cost) ÷ (1 - 0.40)
                    </span>
                  </p>
                </div>

                <div className="space-y-2">
                  <div className="flex justify-between text-xs font-semibold text-slate-700">
                    <span>Portfolio Margin Target</span>
                    <span className="text-emerald-700 font-bold">44.6% / 40.0%</span>
                  </div>
                  <Progress value={85} className="h-2 bg-slate-100" />
                  <p className="text-[11px] text-slate-500">Current portfolio is operating 4.6% above baseline threshold.</p>
                </div>

                <div className="pt-2 border-t space-y-2">
                  <h4 className="text-xs font-bold text-slate-900">Recommended Operational Actions:</h4>
                  <ul className="text-xs space-y-1.5 text-slate-600">
                    <li className="flex items-start gap-1.5">
                      <span className="text-amber-600 font-bold">•</span>
                      <span>Adjust SpinLife round-trip travel fee from $45 to $65 for Columbus outer-ring jobs.</span>
                    </li>
                    <li className="flex items-start gap-1.5">
                      <span className="text-amber-600 font-bold">•</span>
                      <span>Review CareSource OEM parts markup (currently at 22%, recommend 35%).</span>
                    </li>
                  </ul>
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* 2. REVENUE & COST TRENDS TAB */}
        <TabsContent value="revenue" className="space-y-4">
          <Card className="border-slate-200 bg-white shadow-2xs">
            <CardHeader className="p-4 border-b">
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="text-base font-bold text-slate-900">6-Month Revenue vs Direct Cost</CardTitle>
                  <CardDescription className="text-xs">
                    Monthly billing revenue compared to technician payroll and spare parts direct cost.
                  </CardDescription>
                </div>
                <Badge variant="outline" className="border-emerald-300 bg-emerald-50 text-emerald-800">
                  Consistently &gt; 42% Margin
                </Badge>
              </div>
            </CardHeader>
            <CardContent className="p-4">
              <div className="h-72 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={MONTHLY_REVENUE_DATA} margin={{ top: 10, right: 30, left: 10, bottom: 5 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                    <XAxis dataKey="month" stroke="#64748b" fontSize={12} />
                    <YAxis stroke="#64748b" fontSize={12} tickFormatter={(val) => `$${val / 1000}k`} />
                    <Tooltip
                      formatter={(val: any) => [`$${Number(val).toLocaleString()}`, ""]}
                      contentStyle={{ backgroundColor: "#ffffff", borderColor: "#e2e8f0", borderRadius: "8px", fontSize: "12px" }}
                    />
                    <Legend wrapperStyle={{ fontSize: "12px", paddingTop: "8px" }} />
                    <Bar dataKey="revenue" name="Total Revenue ($)" fill="#2563eb" radius={[4, 4, 0, 0]} />
                    <Bar dataKey="directCost" name="Direct Cost ($)" fill="#94a3b8" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* 3. TECHNICIAN UTILIZATION TAB */}
        <TabsContent value="utilization" className="space-y-4">
          <Card className="border-slate-200 bg-white shadow-2xs">
            <CardHeader className="p-4 border-b">
              <div>
                <CardTitle className="text-base font-bold text-slate-900">Technician Productivity & Utilization</CardTitle>
                <CardDescription className="text-xs">
                  Hours spent on customer site (billable) vs road travel time and first-time fix rates.
                </CardDescription>
              </div>
            </CardHeader>
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-50 border-b border-slate-200 text-slate-600 font-semibold">
                    <tr>
                      <th className="py-2.5 px-4">Technician Name</th>
                      <th className="py-2.5 px-3">Primary Discipline</th>
                      <th className="py-2.5 px-3 text-center">Billable Onsite</th>
                      <th className="py-2.5 px-3 text-center">Drive Time</th>
                      <th className="py-2.5 px-3 text-center">Utilization</th>
                      <th className="py-2.5 px-3 text-center">First-Time Fix</th>
                      <th className="py-2.5 px-3 text-center">Jobs Done</th>
                      <th className="py-2.5 px-4 text-right">Revenue Generated</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {TECHNICIAN_METRICS.map((tech) => (
                      <tr key={tech.id} className="hover:bg-slate-50/80 transition-colors">
                        <td className="py-3 px-4 font-bold text-slate-900">{tech.name}</td>
                        <td className="py-3 px-3 text-slate-600 font-medium">{tech.role}</td>
                        <td className="py-3 px-3 text-center font-bold text-blue-700">{tech.billableHours} hrs</td>
                        <td className="py-3 px-3 text-center text-slate-600">{tech.driveHours} hrs</td>
                        <td className="py-3 px-3 text-center">
                          <span className="font-extrabold text-emerald-700 font-mono">{tech.utilization}%</span>
                        </td>
                        <td className="py-3 px-3 text-center font-semibold text-slate-800">{tech.firstTimeFix}%</td>
                        <td className="py-3 px-3 text-center font-bold text-slate-900">{tech.jobsCompleted}</td>
                        <td className="py-3 px-4 text-right font-mono font-bold text-slate-900">${tech.revenueGen.toLocaleString()}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* 4. SLA & QUALITY COMPLIANCE TAB */}
        <TabsContent value="sla" className="space-y-4">
          <Card className="border-slate-200 bg-white shadow-2xs">
            <CardHeader className="p-4 border-b">
              <div>
                <CardTitle className="text-base font-bold text-slate-900">Quality of Service & SLA Scorecard</CardTitle>
                <CardDescription className="text-xs">
                  Compliance tracking for healthcare facility SLAs, Joint Commission biomedical requirements, and response times.
                </CardDescription>
              </div>
            </CardHeader>
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-50 border-b border-slate-200 text-slate-600 font-semibold">
                    <tr>
                      <th className="py-2.5 px-4">Service Level Agreement (SLA)</th>
                      <th className="py-2.5 px-3 text-center">Target Threshold</th>
                      <th className="py-2.5 px-3 text-center">Achieved Performance</th>
                      <th className="py-2.5 px-3 text-center">Variance</th>
                      <th className="py-2.5 px-4 text-center">Compliance Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {SLA_COMPLIANCE_DATA.map((sla, idx) => (
                      <tr key={idx} className="hover:bg-slate-50/80 transition-colors">
                        <td className="py-3 px-4 font-bold text-slate-800">{sla.metric}</td>
                        <td className="py-3 px-3 text-center text-slate-500 font-medium">{sla.target}</td>
                        <td className="py-3 px-3 text-center font-extrabold text-slate-900 font-mono text-sm">{sla.actual}</td>
                        <td className="py-3 px-3 text-center font-bold text-emerald-700">{sla.delta}</td>
                        <td className="py-3 px-4 text-center">
                          <Badge className="bg-emerald-600 text-white text-[10px]">
                            <CheckCircle className="mr-1 size-3" /> SLA Passed
                          </Badge>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
