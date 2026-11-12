import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const targetPath = resolve("components/quickbooks-sync-center.tsx");
let content = readFileSync(targetPath, "utf-8");

// 1. Update React import
content = content.replace(
  'import { useState } from "react";',
  'import { useState, useEffect, useCallback } from "react";'
);

// 2. Replace state and sync handlers
const oldCodeBlock = `export function QuickBooksSyncCenter() {
  const [invoices, setInvoices] = useState<QuickBooksInvoice[]>(INITIAL_INVOICES);
  const [filterStatus, setFilterStatus] = useState<string>("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [isSyncingAll, setIsSyncingAll] = useState(false);
  const [syncingId, setSyncingId] = useState<string | null>(null);

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

  const handleSyncAll = () => {
    setIsSyncingAll(true);
    toast.info("Connecting to Intuit QuickBooks API...", {
      description: \`Pushing \${pendingCount + errorCount} pending invoice records to QuickBooks ledger.\`,
    });
    setTimeout(() => {
      setInvoices((prev) =>
        prev.map((inv) => ({
          ...inv,
          syncStatus: "synced",
          qbDocNumber: inv.qbDocNumber || \`QB-\${Math.floor(10944 + Math.random() * 50)}\`,
          lastSyncAttempt: "Just now",
          errorMessage: undefined,
        })),
      );
      setIsSyncingAll(false);
      toast.success("QuickBooks Synchronization Complete!", {
        description: "All pending invoices reconciled with Chart of Accounts.",
      });
    }, 1200);
  };

  const handleSyncSingle = (id: string) => {
    setSyncingId(id);
    setTimeout(() => {
      setInvoices((prev) =>
        prev.map((inv) =>
          inv.id === id
            ? {
                ...inv,
                syncStatus: "synced",
                qbDocNumber: inv.qbDocNumber || \`QB-\${Math.floor(10950 + Math.random() * 50)}\`,
                lastSyncAttempt: "Just now",
                errorMessage: undefined,
              }
            : inv,
        ),
      );
      setSyncingId(null);
      toast.success("Invoice pushed to QuickBooks successfully!");
    }, 800);
  };`;

const newCodeBlock = `export function QuickBooksSyncCenter() {
  const [invoices, setInvoices] = useState<QuickBooksInvoice[]>(INITIAL_INVOICES);
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
      if (data.invoices && data.invoices.length > 0) {
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
        description: \`Pushing \${pendingCount + errorCount} pending invoice records to QuickBooks ledger.\`,
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
  };`;

// 3. Update dynamic connection status card
const oldConnCard = `<div className="text-sm font-extrabold text-slate-900">TechFlex Mobility Solutions</div>
            <p className="text-[11px] text-slate-500 mt-1 font-mono">Realm: 934145209382</p>`;

const newConnCard = `<div className="text-sm font-extrabold text-slate-900">{connectionInfo.companyName}</div>
            <p className="text-[11px] text-slate-500 mt-1 font-mono">Realm: {connectionInfo.realmId}</p>`;

// Normalize before matching
let norm = content.replace(/\r\n/g, "\n");
const normOld = oldCodeBlock.replace(/\r\n/g, "\n");
const normCard = oldConnCard.replace(/\r\n/g, "\n");

if (!norm.includes(normOld)) {
  console.error("Could not find oldCodeBlock!");
  process.exit(1);
}

norm = norm.replace(normOld, newCodeBlock);
norm = norm.replace(normCard, newConnCard);

writeFileSync(targetPath, norm, "utf-8");
console.log("Successfully wired quickbooks-sync-center.tsx to /api/finance/quickbooks!");

