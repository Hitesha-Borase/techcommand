"use client";

import { useState, useEffect, useCallback } from "react";
import {
  AlertCircle,
  ArrowDownLeft,
  ArrowLeftRight,
  ArrowUpRight,
  Building2,
  CheckCircle2,
  Clock,
  DollarSign,
  ExternalLink,
  FileCheck,
  FileText,
  HelpCircle,
  RefreshCw,
  RotateCw,
  Search,
  ShieldCheck,
  Sparkles,
  Zap,
} from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

type QuickBooksInvoice = {
  id: string;
  invoiceNumber: string;
  workOrderId: string;
  customerName: string;
  amount: number;
  qbDocNumber: string | null;
  syncStatus: "synced" | "pending" | "error";
  lastSyncAttempt: string;
  errorMessage?: string;
  paymentStatus: "Paid" | "Net 30" | "Pending";
};

export function QuickBooksSyncCenter() {
  const [invoices, setInvoices] = useState<QuickBooksInvoice[]>([]);
  const [connectionInfo, setConnectionInfo] = useState({
    companyName: "TechFlex Mobility Solutions",
    realmId: "934145209382",
    isConnected: true,
    lastSyncAt: "Today",
  });
  const [loading, setLoading] = useState(true);
  const [filterStatus, setFilterStatus] = useState<string>("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [isSyncingAll, setIsSyncingAll] = useState(false);
  const [syncingId, setSyncingId] = useState<string | null>(null);

  // Fetch live ledger and connection status from /api/finance/quickbooks
  const fetchQuickBooksData = useCallback(async () => {
    try {
      setLoading(true);
      const res = await fetch("/api/finance/quickbooks");
      if (!res.ok) throw new Error("Failed to load QuickBooks sync ledger");
      const data = (await res.json()) as {
        success?: boolean;
        connection?: {
          companyName: string;
          realmId: string;
          isConnected: boolean;
          lastSyncAt: string;
        };
        invoices?: QuickBooksInvoice[];
      };
      if (Array.isArray(data.invoices)) {
        setInvoices(data.invoices);
      }
      if (data.connection) {
        setConnectionInfo(data.connection);
      }
    } catch (err) {
      console.error("Error loading QuickBooks sync data:", err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchQuickBooksData();
  }, [fetchQuickBooksData]);

  const filteredInvoices = invoices.filter((inv) => {
    const matchesStatus = filterStatus === "all" || inv.syncStatus === filterStatus;
    const matchesSearch =
      inv.invoiceNumber.toLowerCase().includes(searchQuery.toLowerCase()) ||
      inv.workOrderId.toLowerCase().includes(searchQuery.toLowerCase()) ||
      inv.customerName.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (inv.qbDocNumber && inv.qbDocNumber.toLowerCase().includes(searchQuery.toLowerCase()));
    return matchesStatus && matchesSearch;
  });

  const syncedCount = invoices.filter((i) => i.syncStatus === "synced").length;
  const pendingCount = invoices.filter((i) => i.syncStatus === "pending").length;
  const errorCount = invoices.filter((i) => i.syncStatus === "error").length;
  const totalSyncedValue = invoices
    .filter((i) => i.syncStatus === "synced")
    .reduce((sum, i) => sum + i.amount, 0);

  const handleSyncAll = async () => {
    try {
      setIsSyncingAll(true);
      toast.info("Connecting to Intuit QuickBooks API...", {
        description: `Pushing ${pendingCount + errorCount} pending invoice records to QuickBooks ledger.`,
      });

      const res = await fetch("/api/finance/quickbooks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "sync_all" }),
      });

      if (!res.ok) {
        const err = (await res.json()) as { error?: string };
        throw new Error(err?.error || "Batch sync failed");
      }

      await fetchQuickBooksData();
      toast.success("QuickBooks Synchronization Complete!", {
        description: "All pending invoices reconciled with Chart of Accounts.",
      });
    } catch (err: unknown) {
      toast.error("QuickBooks Sync Error", {
        description: err instanceof Error ? err.message : "Sync failed",
      });
    } finally {
      setIsSyncingAll(false);
    }
  };

  const handleSyncSingle = async (id: string) => {
    try {
      setSyncingId(id);
      const res = await fetch("/api/finance/quickbooks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "sync_single", invoiceId: id }),
      });

      if (!res.ok) {
        const err = (await res.json()) as { error?: string };
        throw new Error(err?.error || "Invoice sync failed");
      }

      await fetchQuickBooksData();
      toast.success("Invoice pushed to QuickBooks successfully!");
    } catch (err: unknown) {
      toast.error("QuickBooks Push Error", {
        description: err instanceof Error ? err.message : "Failed to push invoice",
      });
    } finally {
      setSyncingId(null);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header bar */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-xl font-bold tracking-tight text-slate-900">QuickBooks Accounting Sync</h2>
            <Badge className="bg-emerald-600 hover:bg-emerald-700 text-white font-semibold">
              <Zap className="mr-1 size-3" /> Intuit Connected
            </Badge>
          </div>
          <p className="text-xs text-slate-500 mt-0.5">
            Automated invoice transfer, general ledger mapping, and payment reconciliation with QuickBooks Online.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            size="sm"
            onClick={handleSyncAll}
            disabled={isSyncingAll || (pendingCount === 0 && errorCount === 0)}
            className="bg-emerald-600 hover:bg-emerald-700 text-white font-semibold text-xs cursor-pointer h-8"
          >
            <RefreshCw className={`mr-1.5 size-3.5 ${isSyncingAll ? "animate-spin" : ""}`} />
            {isSyncingAll ? "Syncing..." : `Sync All Pending (${pendingCount + errorCount})`}
          </Button>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card className="border-slate-200 bg-white shadow-2xs">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-xs font-semibold text-slate-500 uppercase">Synced to QuickBooks</CardTitle>
            <div className="p-2 rounded-lg bg-emerald-50 text-emerald-600"><CheckCircle2 className="size-4" /></div>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-extrabold text-slate-900">{syncedCount} Invoices</div>
            <p className="text-xs text-emerald-600 font-medium mt-1 font-mono">${totalSyncedValue.toLocaleString()} Transferred</p>
          </CardContent>
        </Card>

        <Card className="border-slate-200 bg-white shadow-2xs">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-xs font-semibold text-slate-500 uppercase">Pending Invoices</CardTitle>
            <div className="p-2 rounded-lg bg-amber-50 text-amber-600"><Clock className="size-4" /></div>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-extrabold text-amber-700">{pendingCount} Ready</div>
            <p className="text-xs text-slate-500 mt-1">Awaiting batch export</p>
          </CardContent>
        </Card>

        <Card className="border-slate-200 bg-white shadow-2xs">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-xs font-semibold text-slate-500 uppercase">Sync Conflicts / Errors</CardTitle>
            <div className="p-2 rounded-lg bg-red-50 text-red-600"><AlertCircle className="size-4" /></div>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-extrabold text-red-700">{errorCount} Item</div>
            <p className="text-xs text-red-600 font-medium mt-1">Retry with updated tax code</p>
          </CardContent>
        </Card>

        <Card className="border-slate-200 bg-white shadow-2xs">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-xs font-semibold text-slate-500 uppercase">Connection Status</CardTitle>
            <div className="p-2 rounded-lg bg-blue-50 text-blue-600"><Building2 className="size-4" /></div>
          </CardHeader>
          <CardContent>
            <div className="text-sm font-extrabold text-slate-900">{connectionInfo.companyName}</div>
            <p className="text-[11px] text-slate-500 mt-1 font-mono">Realm: {connectionInfo.realmId}</p>
          </CardContent>
        </Card>
      </div>

      {/* Main Table Card */}
      <Card className="border-slate-200 bg-white shadow-2xs">
        <CardHeader className="p-4 border-b">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <CardTitle className="text-base font-bold text-slate-900">Invoice Ledger & QuickBooks Synchronization</CardTitle>
              <CardDescription className="text-xs">
                Real-time audit trail linking completed work orders to QuickBooks Online transaction records.
              </CardDescription>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <div className="w-36">
                <Select value={filterStatus} onValueChange={setFilterStatus}>
                  <SelectTrigger className="h-8 text-xs bg-slate-50 border-slate-300">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Statuses</SelectItem>
                    <SelectItem value="synced">Synced Only</SelectItem>
                    <SelectItem value="pending">Pending Only</SelectItem>
                    <SelectItem value="error">Errors Only</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="relative">
                <Search className="absolute left-2.5 top-2 size-3.5 text-slate-400" />
                <Input
                  placeholder="Search invoice, WO, or customer..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="h-8 w-52 pl-8 text-xs bg-slate-50 border-slate-300"
                />
              </div>
            </div>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 border-b border-slate-200 text-slate-600 font-semibold">
                <tr>
                  <th className="py-2.5 px-4">Invoice #</th>
                  <th className="py-2.5 px-3">Work Order #</th>
                  <th className="py-2.5 px-3">Customer / Organization</th>
                  <th className="py-2.5 px-3 text-right">Amount</th>
                  <th className="py-2.5 px-3 font-mono">QB Doc #</th>
                  <th className="py-2.5 px-3 text-center">Sync Status</th>
                  <th className="py-2.5 px-3">Last Sync Attempt</th>
                  <th className="py-2.5 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredInvoices.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="py-12 text-center text-slate-500">
                      <CheckCircle2 className="size-8 mx-auto mb-2 text-slate-400 opacity-60" />
                      <div className="font-semibold text-slate-700 text-sm">No invoices in QuickBooks ledger</div>
                      <div className="text-xs text-slate-400 mt-0.5">
                        When work orders are completed and billed, they will appear here ready for QuickBooks sync.
                      </div>
                    </td>
                  </tr>
                ) : (
                  filteredInvoices.map((inv) => (
                  <tr key={inv.id} className="hover:bg-slate-50/80 transition-colors">
                    <td className="py-3 px-4 font-mono font-bold text-slate-900">{inv.invoiceNumber}</td>
                    <td className="py-3 px-3 font-mono text-blue-700 font-semibold">{inv.workOrderId}</td>
                    <td className="py-3 px-3 font-medium text-slate-800">{inv.customerName}</td>
                    <td className="py-3 px-3 text-right font-mono font-bold text-slate-900">${inv.amount.toFixed(2)}</td>
                    <td className="py-3 px-3 font-mono text-slate-600">
                      {inv.qbDocNumber ? (
                        <span className="font-semibold text-emerald-700">{inv.qbDocNumber}</span>
                      ) : (
                        <span className="text-slate-400 italic">Unassigned</span>
                      )}
                    </td>
                    <td className="py-3 px-3 text-center">
                      {inv.syncStatus === "synced" && (
                        <Badge className="bg-emerald-600 text-white text-[10px]">
                          <CheckCircle2 className="mr-1 size-3" /> Synced
                        </Badge>
                      )}
                      {inv.syncStatus === "pending" && (
                        <Badge className="bg-amber-500 text-white text-[10px]">
                          <Clock className="mr-1 size-3" /> Pending
                        </Badge>
                      )}
                      {inv.syncStatus === "error" && (
                        <Badge className="bg-red-600 text-white text-[10px]">
                          <AlertCircle className="mr-1 size-3" /> Conflict
                        </Badge>
                      )}
                    </td>
                    <td className="py-3 px-3">
                      <span className="text-slate-600">{inv.lastSyncAttempt}</span>
                      {inv.errorMessage && (
                        <span className="block text-[10px] text-red-600 font-semibold mt-0.5 truncate max-w-xs">
                          {inv.errorMessage}
                        </span>
                      )}
                    </td>
                    <td className="py-3 px-4 text-right">
                      {inv.syncStatus === "synced" ? (
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-7 text-[11px] text-blue-700 hover:text-blue-900"
                          onClick={() => toast.info(`Opening QuickBooks Online Transaction ${inv.qbDocNumber}...`)}
                        >
                          <ExternalLink className="mr-1 size-3" /> View in QB
                        </Button>
                      ) : (
                        <Button
                          size="sm"
                          className="h-7 text-[11px] bg-blue-600 hover:bg-blue-700 text-white font-semibold"
                          disabled={syncingId === inv.id}
                          onClick={() => handleSyncSingle(inv.id)}
                        >
                          <RotateCw className={`mr-1 size-3 ${syncingId === inv.id ? "animate-spin" : ""}`} />
                          {syncingId === inv.id ? "Pushing..." : "Push to QB"}
                        </Button>
                      )}
                    </td>
                  </tr>
                )))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      {/* Account Mapping Reference Card */}
      <Card className="border-slate-200 bg-white shadow-2xs">
        <CardHeader className="p-4 border-b">
          <CardTitle className="text-sm font-bold text-slate-900">QuickBooks Chart of Accounts Mapping</CardTitle>
          <CardDescription className="text-xs">Active ledger classifications in QuickBooks Online.</CardDescription>
        </CardHeader>
        <CardContent className="p-4">
          <div className="grid gap-4 sm:grid-cols-3 text-xs">
            <div className="p-3 rounded-lg border bg-slate-50">
              <span className="text-slate-500 block">Field Service Labor</span>
              <span className="font-mono font-bold text-slate-800 text-sm mt-0.5 block">4010 · Service Revenue: Field Labor</span>
            </div>
            <div className="p-3 rounded-lg border bg-slate-50">
              <span className="text-slate-500 block">Parts & Components</span>
              <span className="font-mono font-bold text-slate-800 text-sm mt-0.5 block">4020 · Product Sales: Mobility Parts</span>
            </div>
            <div className="p-3 rounded-lg border bg-slate-50">
              <span className="text-slate-500 block">Travel & Trip Fee</span>
              <span className="font-mono font-bold text-slate-800 text-sm mt-0.5 block">4030 · Service Revenue: Travel Charges</span>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
