"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Banknote,
  CheckCircle2,
  CircleAlert,
  CloudUpload,
  Download,
  FileSpreadsheet,
  LoaderCircle,
  ReceiptText,
  RefreshCw,
  ShieldCheck,
  WalletCards,
} from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

type Invoice = {
  id: string;
  invoiceNumber: string;
  status: string;
  issuedOn: string;
  dueOn: string;
  totalCents: number;
  balanceCents: number;
  paidAt: string | null;
  paymentReference: string | null;
  externalProvider: string | null;
  externalId: string | null;
  pdfAttachmentId: string | null;
  workOrderNumber: string;
  accountName: string;
};
type PayStub = {
  id: string;
  periodStart: string;
  periodEnd: string;
  status: string;
  jobCount: number;
  grossRevenueCents: number;
  grossPayCents: number;
  pdfAttachmentId: string | null;
  technicianName: string;
  technicianCode: string;
};
type IntegrationState = { configured: boolean; missing: string[] };
type FinancePayload = {
  invoices: Invoice[];
  payStubs: PayStub[];
  payoutSummary: {
    payoutCount: number;
    approvedCents: number;
    collectedCents: number;
    coveredContractCents: number;
    coveredContractCount: number;
    paidCents: number;
  };
  payroll: {
    periodStart: string;
    periodEnd: string;
    scheduledFor: string;
    generatedNow: number;
  };
  integrations: {
    googleSheets: IntegrationState;
    googleWorkspaceEmail: IntegrationState;
    quickBooks: {
      webhookConfigured: boolean;
      accountingApiConfigured: boolean;
    };
    queue: Array<{ integrationKey: string; status: string; count: number }>;
  };
};

async function api<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, {
    ...init,
    headers: { "Content-Type": "application/json", ...(init?.headers || {}) },
  });
  const data = (await response.json()) as T & { error?: string };
  if (!response.ok) throw new Error(data.error || "Finance workflow failed.");
  return data;
}

function money(cents: number | null | undefined) {
  return (Number(cents || 0) / 100).toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
  });
}

function integrationLabel(ready: boolean) {
  return ready ? "Connected configuration" : "Setup required";
}

export function FinanceCloseoutCenter() {
  const client = useQueryClient();
  const [paymentInvoice, setPaymentInvoice] = useState<Invoice | null>(null);
  const [payment, setPayment] = useState({
    amount: "",
    receivedOn: new Date().toISOString().slice(0, 10),
    reference: "",
  });
  const finance = useQuery({
    queryKey: ["finance-closeout"],
    queryFn: () => api<FinancePayload>("/api/finance"),
  });
  const action = useMutation({
    mutationFn: (body: Record<string, unknown>) =>
      api<Record<string, unknown>>("/api/finance", {
        method: "POST",
        body: JSON.stringify(body),
      }),
    onSuccess: async (result, variables) => {
      await client.invalidateQueries({ queryKey: ["finance-closeout"] });
      setPaymentInvoice(null);
      const generatedCount = Array.isArray(result.generated)
        ? result.generated.length
        : 0;
      toast.success(
        variables.action === "record_payment"
          ? "Payment recorded and workflow updated"
          : variables.action === "sync_google_sheets"
            ? "Google Sheets queue synchronized"
            : variables.action === "mark_pay_stub_paid"
              ? "Technician pay confirmed"
              : generatedCount
                ? `${generatedCount} pay ${generatedCount === 1 ? "statement" : "statements"} generated`
                : "No due pay statements were waiting",
      );
    },
    onError: (error) => toast.error(error.message),
  });
  const queued = (key: string) =>
    finance.data?.integrations.queue
      .filter((item) => item.integrationKey === key)
      .reduce((sum, item) => sum + Number(item.count || 0), 0) || 0;

  if (finance.isLoading)
    return (
      <div className="grid min-h-[360px] place-items-center rounded-xl border bg-white text-sm text-slate-500">
        <span className="flex items-center gap-2">
          <LoaderCircle className="size-4 animate-spin" /> Loading financial
          closeout…
        </span>
      </div>
    );
  if (finance.error)
    return (
      <div className="flex gap-2 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800">
        <CircleAlert className="size-4" /> {finance.error.message}
      </div>
    );
  const data = finance.data!;

  return (
    <div className="space-y-5">
      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
        {[
          [
            "Open invoice balance",
            money(
              data.invoices.reduce(
                (sum, item) => sum + Number(item.balanceCents || 0),
                0,
              ),
            ),
            ReceiptText,
            "Invoice-to-payment ledger",
          ],
          [
            "Approved technician pay",
            money(data.payoutSummary.approvedCents),
            WalletCards,
            "QA-approved and unpaid",
          ],
          [
            "Customer funds received",
            money(data.payoutSummary.collectedCents),
            Banknote,
            "Linked to paid invoices",
          ],
          [
            "Agreement-covered pay",
            money(data.payoutSummary.coveredContractCents),
            ShieldCheck,
            `${Number(data.payoutSummary.coveredContractCount || 0)} covered ${Number(data.payoutSummary.coveredContractCount || 0) === 1 ? "visit" : "visits"} · included in approved pay`,
          ],
          [
            "Technician pay issued",
            money(data.payoutSummary.paidCents),
            CheckCircle2,
            "Confirmed paid statements",
          ],
        ].map(([label, value, Icon, note]) => {
          const Component = Icon as typeof ReceiptText;
          return (
            <article
              key={String(label)}
              className="rounded-xl border bg-white p-4"
            >
              <Component className="size-5 text-blue-600" />
              <p className="mt-3 text-xs font-bold uppercase tracking-wide text-slate-500">
                {String(label)}
              </p>
              <p className="mt-2 text-2xl font-bold">{String(value)}</p>
              <p className="mt-1 text-xs text-slate-500">{String(note)}</p>
            </article>
          );
        })}
      </section>

      {Number(data.payoutSummary.coveredContractCount || 0) > 0 ? (
        <section className="flex gap-3 rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-950">
          <ShieldCheck className="mt-0.5 size-5 shrink-0 text-emerald-700" />
          <div>
            <p className="font-bold">Annual-agreement work is ready for normal technician payroll.</p>
            <p className="mt-1 leading-6 text-emerald-900">
              The completion invoice is $0 because the visit is covered, not because technician pay is $0. The approved pay above remains eligible for its normal weekly statement. Contract revenue is not counted as received until accounting records the actual annual-agreement payment.
            </p>
          </div>
        </section>
      ) : null}

      <section className="grid gap-4 lg:grid-cols-3">
        <article className="rounded-xl border bg-white p-5">
          <div className="flex items-center justify-between">
            <FileSpreadsheet className="size-5 text-emerald-600" />
            <Badge variant="outline">{queued("google_sheets")} queued</Badge>
          </div>
          <h2 className="mt-4 font-bold">Google Sheets ledger</h2>
          <p className="mt-1 text-sm text-slate-500">
            {integrationLabel(data.integrations.googleSheets.configured)}.
            Completed Orders, Technician Pay, Pay Stubs, and Payments use
            idempotent row updates.
          </p>
          {!data.integrations.googleSheets.configured ? (
            <p className="mt-3 text-xs text-amber-700">
              Missing: {data.integrations.googleSheets.missing.join(", ")}
            </p>
          ) : null}
          <Button
            className="mt-4"
            size="sm"
            variant="outline"
            disabled={action.isPending}
            onClick={() => action.mutate({ action: "sync_google_sheets" })}
          >
            <CloudUpload /> Sync queue
          </Button>
        </article>
        <article className="rounded-xl border bg-white p-5">
          <div className="flex items-center justify-between">
            <ReceiptText className="size-5 text-blue-600" />
            <Badge variant="outline">{queued("quickbooks")} queued</Badge>
          </div>
          <h2 className="mt-4 font-bold">QuickBooks Online</h2>
          <p className="mt-1 text-sm text-slate-500">
            Signed webhook intake and durable invoice/payment reconciliation
            queue are installed.
          </p>
          <p className="mt-3 text-xs text-amber-700">
            {data.integrations.quickBooks.webhookConfigured &&
            data.integrations.quickBooks.accountingApiConfigured
              ? "Runtime credentials detected"
              : "OAuth company connection, verifier token, and account mappings still required"}
          </p>
        </article>
        <article className="rounded-xl border bg-[#102748] p-5 text-white">
          <div className="flex items-center justify-between">
            <WalletCards className="size-5 text-blue-300" />
            <Badge className="bg-white/10 text-white">Wednesday 3 PM ET</Badge>
          </div>
          <h2 className="mt-4 font-bold">Weekly payroll close</h2>
          <p className="mt-1 text-sm text-blue-100/75">
            Current period: {data.payroll.periodStart} through{" "}
            {data.payroll.periodEnd}. Generation is repeat-safe.
          </p>
          <Button
            className="mt-4 bg-white text-slate-950 hover:bg-blue-50"
            size="sm"
            disabled={action.isPending}
            onClick={() => action.mutate({ action: "generate_payroll" })}
          >
            <RefreshCw /> Generate due statements
          </Button>
        </article>
      </section>

      <section className="overflow-hidden rounded-xl border bg-white">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b p-5">
          <div>
            <h2 className="font-bold">Invoice and collection register</h2>
            <p className="mt-1 text-sm text-slate-500">
              QA-approved jobs only. QuickBooks payments will reconcile here
              after connection.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button asChild variant="outline" size="sm">
              <a href="/api/finance?export=completed_orders">
                <Download /> Completed orders CSV
              </a>
            </Button>
            <Button asChild variant="outline" size="sm">
              <a href="/api/finance?export=technician_pay">
                <Download /> Technician pay CSV
              </a>
            </Button>
          </div>
        </div>
        {data.invoices.length ? (
          <Table>
            <TableHeader>
              <TableRow className="bg-slate-50">
                <TableHead>INVOICE / WORK ORDER</TableHead>
                <TableHead>ACCOUNT</TableHead>
                <TableHead>DUE</TableHead>
                <TableHead className="text-right">TOTAL</TableHead>
                <TableHead className="text-right">BALANCE</TableHead>
                <TableHead>STATUS</TableHead>
                <TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.invoices.map((invoice) => (
                <TableRow key={invoice.id}>
                  <TableCell>
                    <p className="font-mono text-xs font-bold">
                      {invoice.invoiceNumber}
                    </p>
                    <p className="mt-1 text-xs text-slate-500">
                      {invoice.workOrderNumber}
                    </p>
                  </TableCell>
                  <TableCell className="font-semibold">
                    {invoice.accountName}
                  </TableCell>
                  <TableCell>{invoice.dueOn || "—"}</TableCell>
                  <TableCell className="text-right font-bold">
                    {money(invoice.totalCents)}
                  </TableCell>
                  <TableCell className="text-right font-bold">
                    {money(invoice.balanceCents)}
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline" className="capitalize">
                      {invoice.status}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <div className="flex justify-end gap-2">
                      {invoice.pdfAttachmentId ? (
                        <Button asChild size="sm" variant="ghost">
                          <a
                            href={`/api/attachments?attachmentId=${invoice.pdfAttachmentId}`}
                          >
                            <Download /> PDF
                          </a>
                        </Button>
                      ) : null}
                      {invoice.balanceCents > 0 ? (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => {
                            setPaymentInvoice(invoice);
                            setPayment({
                              amount: (invoice.balanceCents / 100).toFixed(2),
                              receivedOn: new Date().toISOString().slice(0, 10),
                              reference: "",
                            });
                          }}
                        >
                          Record payment
                        </Button>
                      ) : null}
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        ) : (
          <div className="p-10 text-center text-sm text-slate-500">
            Invoices appear after completion QA approval.
          </div>
        )}
      </section>

      <section className="overflow-hidden rounded-xl border bg-white">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b p-5">
          <div>
            <h2 className="font-bold">Technician pay statements</h2>
            <p className="mt-1 text-sm text-slate-500">
              PDF statements include only approved job-pay records in the closed
              period.
            </p>
          </div>
          <Button asChild variant="outline" size="sm">
            <a href="/api/finance?export=pay_stubs">
              <Download /> Pay stubs CSV
            </a>
          </Button>
        </div>
        {data.payStubs.length ? (
          <Table>
            <TableHeader>
              <TableRow className="bg-slate-50">
                <TableHead>TECHNICIAN</TableHead>
                <TableHead>PERIOD</TableHead>
                <TableHead>JOBS</TableHead>
                <TableHead className="text-right">PAY</TableHead>
                <TableHead>STATUS</TableHead>
                <TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.payStubs.map((stub) => (
                <TableRow key={stub.id}>
                  <TableCell>
                    <p className="font-bold">{stub.technicianName}</p>
                    <p className="text-xs text-slate-500">
                      {stub.technicianCode}
                    </p>
                  </TableCell>
                  <TableCell>
                    {stub.periodStart} – {stub.periodEnd}
                  </TableCell>
                  <TableCell>{stub.jobCount}</TableCell>
                  <TableCell className="text-right font-bold">
                    {money(stub.grossPayCents)}
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline" className="capitalize">
                      {stub.status}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <div className="flex justify-end gap-2">
                      {stub.pdfAttachmentId ? (
                        <Button asChild size="sm" variant="ghost">
                          <a
                            href={`/api/attachments?attachmentId=${stub.pdfAttachmentId}`}
                          >
                            <Download /> PDF
                          </a>
                        </Button>
                      ) : null}
                      {stub.status !== "paid" ? (
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={action.isPending}
                          onClick={() =>
                            action.mutate({
                              action: "mark_pay_stub_paid",
                              payStubId: stub.id,
                            })
                          }
                        >
                          Confirm paid
                        </Button>
                      ) : null}
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        ) : (
          <div className="p-10 text-center text-sm text-slate-500">
            No weekly statements generated yet.
          </div>
        )}
      </section>

      <Dialog
        open={Boolean(paymentInvoice)}
        onOpenChange={(open) => {
          if (!open) setPaymentInvoice(null);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Record customer payment</DialogTitle>
            <DialogDescription>
              {paymentInvoice?.invoiceNumber} · remaining{" "}
              {money(paymentInvoice?.balanceCents)}
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="space-y-1.5 text-sm font-semibold">
              Amount received
              <Input
                type="number"
                min="0.01"
                step="0.01"
                value={payment.amount}
                onChange={(event) =>
                  setPayment({ ...payment, amount: event.target.value })
                }
              />
            </label>
            <label className="space-y-1.5 text-sm font-semibold">
              Received date
              <Input
                type="date"
                value={payment.receivedOn}
                onChange={(event) =>
                  setPayment({ ...payment, receivedOn: event.target.value })
                }
              />
            </label>
            <label className="space-y-1.5 text-sm font-semibold sm:col-span-2">
              Reference / deposit ID
              <Input
                value={payment.reference}
                onChange={(event) =>
                  setPayment({ ...payment, reference: event.target.value })
                }
              />
            </label>
          </div>
          <DialogFooter>
            <Button
              disabled={action.isPending || Number(payment.amount) <= 0}
              onClick={() =>
                action.mutate({
                  action: "record_payment",
                  invoiceId: paymentInvoice!.id,
                  amountCents: Math.round(Number(payment.amount) * 100),
                  receivedOn: payment.receivedOn,
                  reference: payment.reference,
                })
              }
            >
              Confirm payment
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
