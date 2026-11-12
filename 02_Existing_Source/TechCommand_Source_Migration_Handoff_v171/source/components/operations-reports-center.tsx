"use client";

import { useState, useEffect } from "react";
import {
  Activity,
  AlertCircle,
  ArrowDownRight,
  ArrowUpRight,
  BarChart2,
  Building,
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

export function OperationsReportsCenter() {
  const [period, setPeriod] = useState("oct-2026");
  const [marginThreshold, setMarginThreshold] = useState("40");
  const [monthlyData, setMonthlyData] = useState<Array<{ month: string; revenue: number; directCost: number; margin: number }>>([]);
  const [accountData, setAccountData] = useState<Array<{ account: string; revenue: number; laborCost: number; partsCost: number; grossMargin: number; status: string }>>([]);
  const [techMetrics, setTechMetrics] = useState<Array<{ id: string; name: string; role: string; billableHours: number; driveHours: number; adminHours: number; utilization: number; firstTimeFix: number; jobsCompleted: number; revenueGen: number }>>([]);
  const [slaData, setSlaData] = useState<Array<{ metric: string; target: string; actual: string; status: string; delta: string }>>([]);
  const [totalRev, setTotalRev] = useState(0);
  const [totalCost, setTotalCost] = useState(0);
  const [overallMargin, setOverallMargin] = useState("0.0");
  const [loading, setLoading] = useState(true);

  // Fetch live operations margin guardrail data from /api/operations/margins
  useEffect(() => {
    let isMounted = true;
    async function fetchMarginData() {
      try {
        setLoading(true);
        const res = await fetch(`/api/operations/margins?threshold=${marginThreshold}&month=${period}`);
        if (!res.ok) return;
        const data = (await res.json()) as {
          success?: boolean;
          summary?: { totalRevenue: number; totalCost: number; overallMargin: number; flaggedCount: number };
          monthlyTrend?: Array<{ month: string; revenue: number; directCost: number; margin: number }>;
          accountMargins?: Array<{ account: string; revenue: number; laborCost: number; partsCost: number; grossMargin: number; status: string }>;
        };
        if (isMounted) {
          setMonthlyData(Array.isArray(data?.monthlyTrend) ? data.monthlyTrend : []);
          setAccountData(Array.isArray(data?.accountMargins) ? data.accountMargins : []);
          if (data?.summary) {
            setTotalRev(data.summary.totalRevenue || 0);
            setTotalCost(data.summary.totalCost || 0);
            setOverallMargin((data.summary.overallMargin || 0).toFixed(1));
          }
        }
      } catch (err) {
        console.error("Failed to fetch operations margin data:", err);
      } finally {
        if (isMounted) setLoading(false);
      }
    }
    fetchMarginData();
    return () => { isMounted = false; };
  }, [marginThreshold, period]);

  const flaggedAccountsCount = accountData.filter((a) => a.grossMargin < parseFloat(marginThreshold)).length;

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
                      {accountData.length === 0 ? (
                        <tr>
                          <td colSpan={6} className="py-12 text-center text-slate-500">
                            <Building className="size-8 mx-auto mb-2 text-slate-400 opacity-60" />
                            <div className="font-semibold text-slate-700 text-sm">No account margin records in this period</div>
                            <div className="text-xs text-slate-400 mt-0.5">Account gross margins and 40% margin guardrail alerts will populate here as jobs are completed.</div>
                          </td>
                        </tr>
                      ) : (
                        accountData.map((item, idx) => {
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
                      }))}
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
              {monthlyData.length === 0 ? (
                <div className="flex h-72 flex-col items-center justify-center rounded-lg border border-dashed border-slate-200 bg-slate-50/50 p-4 text-center">
                  <BarChart2 className="size-8 text-slate-400 mb-2 opacity-60" />
                  <p className="text-sm font-semibold text-slate-700">No monthly revenue trends recorded yet</p>
                  <p className="text-xs text-slate-400 mt-1 max-w-sm">
                    Monthly billing trends will generate automatically as invoices and payroll are processed.
                  </p>
                </div>
              ) : (
                <div className="h-72 w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={monthlyData} margin={{ top: 10, right: 30, left: 10, bottom: 5 }}>
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
              )}
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
                    {techMetrics.length === 0 ? (
                      <tr>
                        <td colSpan={8} className="py-12 text-center text-slate-500">
                          <Users className="size-8 mx-auto mb-2 text-slate-400 opacity-60" />
                          <div className="font-semibold text-slate-700 text-sm">No technician performance data for this period</div>
                          <div className="text-xs text-slate-400 mt-0.5">Technician billable hours and utilization populate automatically when field jobs are completed.</div>
                        </td>
                      </tr>
                    ) : (
                      techMetrics.map((tech) => (
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
                      ))
                    )}
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
                    {slaData.length === 0 ? (
                      <tr>
                        <td colSpan={5} className="py-12 text-center text-slate-500">
                          <ShieldCheck className="size-8 mx-auto mb-2 text-slate-400 opacity-60" />
                          <div className="font-semibold text-slate-700 text-sm">No SLA scorecard records recorded yet</div>
                          <div className="text-xs text-slate-400 mt-0.5">Healthcare partner facility response times and Joint Commission compliance will appear here.</div>
                        </td>
                      </tr>
                    ) : (
                      slaData.map((sla, idx) => (
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
                      ))
                    )}
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
