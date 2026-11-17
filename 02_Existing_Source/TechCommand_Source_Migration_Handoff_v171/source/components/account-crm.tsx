"use client";

import { portalFetch } from "@/lib/portal-fetch";
import { crmErrorMessage } from "@/lib/crm-validation";

import { useState, useEffect, type ReactNode } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  AlertTriangle,
  Building2,
  Calendar,
  Check,
  CircleAlert,
  Copy,
  Eye,
  Mail,
  MapPin,
  Pencil,
  Plus,
  RefreshCw,
  Search,
  ShieldCheck,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

type Account = {
  id: string;
  name: string;
  accountType: string;
  externalId?: string | null;
  billingEmail: string | null;
  paymentTermsDays: number;
  serviceLevel: string | null;
  serviceDiscipline: string | null;
  locationCount: number;
  assetCount: number;
  status?: string;
  updatedAt?: string;
};

type Location = {
  id: string;
  accountId: string;
  accountName: string;
  name: string;
  locationType: string | null;
  address1: string;
  address2: string | null;
  city: string;
  state: string;
  postalCode: string;
  departmentCount: number;
  assetCount: number;
};

async function api<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await portalFetch(url, {
    ...init,
    headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) },
  });
  const data = (await response.json()) as T & { error?: string };
  if (!response.ok) throw new Error(crmErrorMessage(data));
  return data;
}

function EmptyState({ mode, onOpen }: { mode: "accounts" | "locations"; onOpen: () => void }) {
  const Icon = mode === "accounts" ? Building2 : MapPin;
  return (
    <div className="grid min-h-72 place-items-center px-6 py-12 text-center">
      <div>
        <span className="mx-auto grid size-12 place-items-center rounded-xl bg-blue-50 text-blue-700"><Icon className="size-5" /></span>
        <h3 className="mt-4 font-bold text-slate-900">No live {mode} yet</h3>
        <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-slate-500">
          Add the first record manually or use Imports & Sync to bring in the current TechFlex spreadsheet.
        </p>
        <Button className="mt-5" onClick={onOpen}><Plus /> Add first {mode === "accounts" ? "account" : "location"}</Button>
      </div>
    </div>
  );
}

function AddAccountForm({ close }: { close: () => void }) {
  const queryClient = useQueryClient();
  const [name, setName] = useState("");
  const [accountType, setAccountType] = useState("facility");
  const [billingEmail, setBillingEmail] = useState("");
  const [terms, setTerms] = useState("30");
  const [serviceLevel, setServiceLevel] = useState("");
  const [serviceDiscipline, setServiceDiscipline] = useState("");
  const mutation = useMutation({
    mutationFn: () => api<{ account?: Account }>("/api/accounts", {
      method: "POST",
      body: JSON.stringify({ name, accountType, billingEmail, paymentTermsDays: Number(terms), serviceLevel, serviceDiscipline: serviceDiscipline || null }),
    }),
    onSuccess: async (data) => {
      if (data?.account) {
        queryClient.setQueryData(["accounts"], (old: { accounts: Account[] } | undefined) => {
          const list = old?.accounts || [];
          return {
            accounts: [
              data.account!,
              ...list.filter((a) => a.id !== data.account!.id),
            ],
          };
        });
      }
      await queryClient.invalidateQueries({ queryKey: ["accounts"] });
      await queryClient.refetchQueries({ queryKey: ["accounts"] });
      toast.success("Account created", { description: name });
      close();
    },
    onError: (error) => toast.error(error.message),
  });
  return (
    <form className="space-y-4 px-6 py-5" onSubmit={(event) => { event.preventDefault(); mutation.mutate(); }}>
      <Field label="Account name"><Input value={name} onChange={(event) => setName(event.target.value)} placeholder="Example: SpinLife" minLength={2} maxLength={160} required /></Field>
      <Field label="Account category">
        <Select value={accountType} onValueChange={setAccountType}><SelectTrigger className="w-full"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="manufacturer">Manufacturer</SelectItem><SelectItem value="retailer">Retailer</SelectItem><SelectItem value="facility">Healthcare facility</SelectItem><SelectItem value="direct_customer">Direct customer</SelectItem><SelectItem value="partner">Partner</SelectItem></SelectContent></Select>
      </Field>
      <Field label="Work type"><select className="min-h-11 w-full rounded-md border px-3" value={serviceDiscipline} onChange={event => setServiceDiscipline(event.target.value)}><option value="">Choose later</option><option value="biomedical">Biomedical / PM</option><option value="dme_mobility">DME / Mobility</option></select></Field>
      <Field label="Billing email"><Input type="email" value={billingEmail} onChange={(event) => setBillingEmail(event.target.value)} placeholder="accounts@company.com" /></Field>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Payment terms (days)"><Input type="number" min={0} max={365} step={1} required value={terms} onChange={(event) => setTerms(event.target.value)} /></Field>
        <Field label="Service level"><Input value={serviceLevel} onChange={(event) => setServiceLevel(event.target.value)} placeholder="Standard / Preferred" /></Field>
      </div>
      <div className="rounded-xl border border-blue-100 bg-blue-50/70 p-4 text-xs leading-5 text-blue-900">Save the account now; add missing details later. Biomedical accounts track facility assets and PM. DME / Mobility accounts follow partner work orders and product service details.</div>
      {mutation.error ? <p role="alert" className="text-sm text-red-700">{mutation.error.message}</p> : null}
      <Button type="submit" className="w-full" disabled={mutation.isPending}>{mutation.isPending ? "Creating…" : "Create account"}</Button>
    </form>
  );
}

function AddLocationForm({ accounts, close }: { accounts: Account[]; close: () => void }) {
  const queryClient = useQueryClient();
  const [accountId, setAccountId] = useState("");
  const [name, setName] = useState("");
  const [locationType, setLocationType] = useState("healthcare_facility");
  const [address1, setAddress1] = useState("");
  const [city, setCity] = useState("");
  const [state, setState] = useState("OH");
  const [postalCode, setPostalCode] = useState("");
  const [departmentName, setDepartmentName] = useState("");
  const mutation = useMutation({
    mutationFn: () => api<{ location?: Location }>("/api/locations", {
      method: "POST",
      body: JSON.stringify({ accountId, name, locationType, address1, city, state, postalCode, departmentName }),
    }),
    onSuccess: async (data) => {
      if (data?.location) {
        queryClient.setQueryData(["locations"], (old: { locations: Location[] } | undefined) => {
          const list = old?.locations || [];
          return {
            locations: [
              data.location!,
              ...list.filter((l) => l.id !== data.location!.id),
            ],
          };
        });
      }
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["accounts"] }),
        queryClient.invalidateQueries({ queryKey: ["locations"] }),
        queryClient.refetchQueries({ queryKey: ["accounts"] }),
        queryClient.refetchQueries({ queryKey: ["locations"] }),
      ]);
      toast.success("Location created", { description: name });
      close();
    },
    onError: (error) => toast.error(error.message),
  });
  return (
    <form className="space-y-4 px-6 py-5" onSubmit={(event) => { event.preventDefault(); mutation.mutate(); }}>
      <Field label="Account">
        <Select value={accountId} onValueChange={setAccountId}><SelectTrigger className="w-full"><SelectValue placeholder="Select an account" /></SelectTrigger><SelectContent>{accounts.map((account) => <SelectItem key={account.id} value={account.id}>{account.name}</SelectItem>)}</SelectContent></Select>
        {!accounts.length ? <p className="text-sm font-normal text-amber-800">Create an account in Accounts first, then return here to add its location.</p> : null}
      </Field>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Location name"><Input value={name} onChange={(event) => setName(event.target.value)} placeholder="Dublin Clinic" minLength={2} maxLength={160} required /></Field>
        <Field label="Location type"><Input value={locationType} onChange={(event) => setLocationType(event.target.value)} /></Field>
      </div>
      <Field label="Street address"><Input value={address1} onChange={(event) => setAddress1(event.target.value)} minLength={3} maxLength={200} required /></Field>
      <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_80px_110px]">
        <Field label="City"><Input value={city} onChange={(event) => setCity(event.target.value)} minLength={2} maxLength={100} required /></Field>
        <Field label="State"><Input minLength={2} maxLength={2} value={state} onChange={(event) => setState(event.target.value.toUpperCase())} required /></Field>
        <Field label="ZIP"><Input value={postalCode} onChange={(event) => setPostalCode(event.target.value)} minLength={5} maxLength={10} required /></Field>
      </div>
      <Field label="First department (optional)"><Input value={departmentName} onChange={(event) => setDepartmentName(event.target.value)} placeholder="Rehab Wing" /></Field>
      {mutation.error ? <p role="alert" className="text-sm text-red-700">{mutation.error.message} Your entries are still here.</p> : null}
      <Button type="submit" className="w-full" disabled={mutation.isPending || !accountId}>{mutation.isPending ? "Creating…" : "Create location"}</Button>
    </form>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return <label className="block space-y-1.5 text-sm font-semibold text-slate-700">{label}{children}</label>;
}

function ViewAccountDialog({
  account,
  open,
  onOpenChange,
  onEdit,
}: {
  account: Account | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onEdit: (account: Account) => void;
}) {
  const [copied, setCopied] = useState(false);
  const locationsQuery = useQuery({
    queryKey: ["locations", account?.id],
    queryFn: () => api<{ locations: Location[] }>(`/api/locations?accountId=${account?.id}`),
    enabled: open && !!account?.id,
  });

  const locations = locationsQuery.data?.locations || [];

  if (!account) return null;

  const copyId = () => {
    navigator.clipboard.writeText(account.id);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
    toast.success("Account ID copied to clipboard");
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader className="border-b pb-4">
          <div className="flex flex-wrap items-center justify-between gap-2 pr-6">
            <div className="flex items-center gap-3">
              <span className="grid size-10 place-items-center rounded-xl bg-blue-50 text-blue-700">
                <Building2 className="size-5" />
              </span>
              <div>
                <DialogTitle className="text-xl font-bold text-slate-900">{account.name}</DialogTitle>
                <DialogDescription className="text-xs text-slate-500">
                  Account overview and operational details
                </DialogDescription>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Badge variant="outline" className="bg-emerald-50 text-emerald-700 border-emerald-200">
                Active
              </Badge>
              <Badge variant="secondary" className="capitalize">
                {(account.accountType || "facility").replaceAll("_", " ")}
              </Badge>
            </div>
          </div>
        </DialogHeader>

        <div className="space-y-5 py-4">
          {/* Key Metric Cards */}
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <div className="rounded-lg border bg-slate-50 p-3">
              <p className="text-xs font-medium text-slate-500">Service Sites</p>
              <p className="mt-1 text-2xl font-bold text-slate-900">{account.locationCount}</p>
            </div>
            <div className="rounded-lg border bg-slate-50 p-3">
              <p className="text-xs font-medium text-slate-500">Connected Assets</p>
              <p className="mt-1 text-2xl font-bold text-slate-900">{account.assetCount}</p>
            </div>
            <div className="rounded-lg border bg-slate-50 p-3">
              <p className="text-xs font-medium text-slate-500">Payment Terms</p>
              <p className="mt-1 text-2xl font-bold text-slate-900">{account.paymentTermsDays}d</p>
            </div>
            <div className="rounded-lg border bg-slate-50 p-3">
              <p className="text-xs font-medium text-slate-500">Service Level</p>
              <p className="mt-1 text-sm font-bold text-slate-900 truncate">{account.serviceLevel || "Standard"}</p>
            </div>
          </div>

          {/* Account Specifications Grid */}
          <div className="rounded-xl border border-slate-200 bg-white p-4 space-y-3">
            <h4 className="text-xs font-semibold uppercase tracking-wider text-slate-400">Account Specifications</h4>
            <div className="grid gap-3 sm:grid-cols-2 text-sm">
              <div>
                <p className="text-xs text-slate-500">Work Type / Discipline</p>
                <p className="font-medium text-slate-900 mt-0.5">
                  {account.serviceDiscipline === "biomedical"
                    ? "Biomedical / Preventive Maintenance (PM)"
                    : account.serviceDiscipline === "dme_mobility"
                    ? "DME / Mobility Restorations"
                    : "Work type pending"}
                </p>
              </div>
              <div>
                <p className="text-xs text-slate-500">Billing Email</p>
                <p className="font-medium text-slate-900 mt-0.5 flex items-center gap-1.5">
                  <Mail className="size-3.5 text-slate-400 shrink-0" />
                  {account.billingEmail || <span className="text-slate-400 italic">None provided</span>}
                </p>
              </div>
              <div>
                <p className="text-xs text-slate-500">Account ID</p>
                <div className="flex items-center gap-1.5 mt-0.5">
                  <code className="text-xs font-mono bg-slate-100 text-slate-700 px-1.5 py-0.5 rounded truncate max-w-[200px]">
                    {account.id}
                  </code>
                  <button onClick={copyId} className="text-slate-400 hover:text-slate-700 p-0.5" title="Copy ID">
                    {copied ? <Check className="size-3.5 text-emerald-600" /> : <Copy className="size-3.5" />}
                  </button>
                </div>
              </div>
              <div>
                <p className="text-xs text-slate-500">External ID</p>
                <p className="font-medium text-slate-900 mt-0.5 font-mono text-xs">
                  {account.externalId || <span className="text-slate-400 italic font-sans">None</span>}
                </p>
              </div>
            </div>
          </div>

          {/* Linked Locations Section */}
          <div className="space-y-2.5">
            <h4 className="text-xs font-semibold uppercase tracking-wider text-slate-500">
              Linked Service Locations ({locations.length})
            </h4>
            {locationsQuery.isLoading ? (
              <p className="text-xs text-slate-400 py-2">Loading locations...</p>
            ) : locations.length === 0 ? (
              <p className="text-xs text-slate-400 italic py-2 border rounded-lg p-3 bg-slate-50">
                No service locations linked yet.
              </p>
            ) : (
              <div className="max-h-48 overflow-y-auto rounded-lg border divide-y">
                {locations.map((loc) => (
                  <div key={loc.id} className="p-3 text-sm flex items-center justify-between hover:bg-slate-50">
                    <div>
                      <p className="font-semibold text-slate-800">{loc.name}</p>
                      <p className="text-xs text-slate-500 mt-0.5 flex items-center gap-1">
                        <MapPin className="size-3 text-slate-400 shrink-0" />
                        {loc.address1 ? `${loc.address1}, ${loc.city}, ${loc.state} ${loc.postalCode}` : `${loc.city}, ${loc.state}`}
                      </p>
                    </div>
                    <div className="text-right text-xs text-slate-500">
                      <span className="font-semibold text-slate-700">{loc.assetCount || 0}</span> assets
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        <DialogFooter className="border-t pt-3 flex sm:justify-between items-center gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Close
          </Button>
          <Button
            onClick={() => {
              onOpenChange(false);
              onEdit(account);
            }}
            className="gap-1.5"
          >
            <Pencil className="size-4" /> Edit Account
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function EditAccountDialog({
  account,
  open,
  onOpenChange,
}: {
  account: Account | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const queryClient = useQueryClient();
  const [name, setName] = useState("");
  const [accountType, setAccountType] = useState("facility");
  const [billingEmail, setBillingEmail] = useState("");
  const [terms, setTerms] = useState("30");
  const [serviceLevel, setServiceLevel] = useState("");
  const [serviceDiscipline, setServiceDiscipline] = useState("");
  const [externalId, setExternalId] = useState("");

  useEffect(() => {
    if (account) {
      setName(account.name || "");
      setAccountType(account.accountType || "facility");
      setBillingEmail(account.billingEmail || "");
      setTerms(String(account.paymentTermsDays ?? 30));
      setServiceLevel(account.serviceLevel || "");
      setServiceDiscipline(account.serviceDiscipline || "");
      setExternalId(account.externalId || "");
    }
  }, [account, open]);

  const mutation = useMutation({
    mutationFn: () =>
      api<{ account?: Account }>(`/api/accounts/${account?.id}`, {
        method: "PUT",
        body: JSON.stringify({
          name,
          accountType,
          billingEmail: billingEmail || null,
          paymentTermsDays: Number(terms) || 30,
          serviceLevel: serviceLevel || null,
          serviceDiscipline: serviceDiscipline || null,
          externalId: externalId || null,
        }),
      }),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["accounts"] }),
        queryClient.invalidateQueries({ queryKey: ["locations"] }),
        queryClient.refetchQueries({ queryKey: ["accounts"] }),
      ]);
      toast.success("Account updated successfully", { description: name });
      onOpenChange(false);
    },
    onError: (error) => toast.error(error.message),
  });

  if (!account) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl max-h-[90vh] overflow-y-auto">
        <DialogHeader className="border-b pb-4">
          <DialogTitle className="flex items-center gap-2 text-xl font-bold text-slate-900">
            <Pencil className="size-5 text-blue-600" /> Edit Account
          </DialogTitle>
          <DialogDescription className="text-xs text-slate-500">
            Update account configuration, billing details, and service disciplines.
          </DialogDescription>
        </DialogHeader>

        <form
          className="space-y-4 py-3"
          onSubmit={(e) => {
            e.preventDefault();
            mutation.mutate();
          }}
        >
          <Field label="Account name">
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Example: SpinLife"
              minLength={2}
              maxLength={160}
              required
            />
          </Field>
          <Field label="Account category">
            <Select value={accountType} onValueChange={setAccountType}>
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="manufacturer">Manufacturer</SelectItem>
                <SelectItem value="retailer">Retailer</SelectItem>
                <SelectItem value="facility">Healthcare facility</SelectItem>
                <SelectItem value="direct_customer">Direct customer</SelectItem>
                <SelectItem value="partner">Partner</SelectItem>
              </SelectContent>
            </Select>
          </Field>
          <Field label="Work type">
            <select
              className="min-h-10 w-full rounded-md border px-3 text-sm"
              value={serviceDiscipline}
              onChange={(e) => setServiceDiscipline(e.target.value)}
            >
              <option value="">Choose later / General</option>
              <option value="biomedical">Biomedical / PM</option>
              <option value="dme_mobility">DME / Mobility</option>
            </select>
          </Field>
          <Field label="Billing email">
            <Input
              type="email"
              value={billingEmail}
              onChange={(e) => setBillingEmail(e.target.value)}
              placeholder="accounts@company.com"
            />
          </Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Payment terms (days)">
              <Input
                type="number"
                min={0}
                max={365}
                step={1}
                required
                value={terms}
                onChange={(e) => setTerms(e.target.value)}
              />
            </Field>
            <Field label="Service level">
              <Input
                value={serviceLevel}
                onChange={(e) => setServiceLevel(e.target.value)}
                placeholder="Standard / Preferred"
              />
            </Field>
          </div>
          <Field label="External ID (optional)">
            <Input
              value={externalId}
              onChange={(e) => setExternalId(e.target.value)}
              placeholder="External ERP or partner reference ID"
            />
          </Field>

          {mutation.error ? (
            <p role="alert" className="text-sm text-red-700 bg-red-50 p-2.5 rounded-lg border border-red-200">
              {mutation.error.message}
            </p>
          ) : null}

          <DialogFooter className="border-t pt-4">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={mutation.isPending}>
              {mutation.isPending ? "Saving changes…" : "Save Changes"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function DeleteAccountDialog({
  account,
  open,
  onOpenChange,
}: {
  account: Account | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const queryClient = useQueryClient();
  const mutation = useMutation({
    mutationFn: () =>
      api<{ ok?: boolean }>(`/api/accounts/${account?.id}`, {
        method: "DELETE",
      }),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["accounts"] }),
        queryClient.invalidateQueries({ queryKey: ["locations"] }),
        queryClient.refetchQueries({ queryKey: ["accounts"] }),
      ]);
      toast.success("Account deleted successfully", { description: account?.name });
      onOpenChange(false);
    },
    onError: (error) => toast.error(error.message),
  });

  if (!account) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <div className="mx-auto grid size-12 place-items-center rounded-full bg-red-100 text-red-600 mb-2">
            <Trash2 className="size-6" />
          </div>
          <DialogTitle className="text-center text-lg font-bold text-slate-900">
            Delete Account?
          </DialogTitle>
          <DialogDescription className="text-center text-sm text-slate-500">
            Are you sure you want to delete <span className="font-semibold text-slate-800">&quot;{account.name}&quot;</span>?
            This will remove the account from the active directory.
          </DialogDescription>
        </DialogHeader>

        {account.locationCount > 0 ? (
          <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800 flex items-start gap-2">
            <AlertTriangle className="size-4 shrink-0 text-amber-600 mt-0.5" />
            <span>
              This account has <strong>{account.locationCount} linked service location(s)</strong>.
              It will be safely archived to protect active job history.
            </span>
          </div>
        ) : null}

        {mutation.error ? (
          <p role="alert" className="text-sm text-red-700 bg-red-50 p-2.5 rounded-lg border border-red-200">
            {mutation.error.message}
          </p>
        ) : null}

        <DialogFooter className="mt-4 flex sm:justify-end gap-2">
          <Button
            type="button"
            variant="outline"
            disabled={mutation.isPending}
            onClick={() => onOpenChange(false)}
          >
            Cancel
          </Button>
          <Button
            type="button"
            variant="destructive"
            disabled={mutation.isPending}
            onClick={() => mutation.mutate()}
          >
            {mutation.isPending ? "Deleting…" : "Yes, Delete Account"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function AccountCrm({ mode }: { mode: "accounts" | "locations" }) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [viewingAccount, setViewingAccount] = useState<Account | null>(null);
  const [editingAccount, setEditingAccount] = useState<Account | null>(null);
  const [deletingAccount, setDeletingAccount] = useState<Account | null>(null);
  const accountsQuery = useQuery({
    queryKey: ["accounts"],
    queryFn: () => api<{ accounts: Account[] }>("/api/accounts"),
  });
  const locationsQuery = useQuery({
    queryKey: ["locations"],
    queryFn: () => api<{ locations: Location[] }>("/api/locations"),
    enabled: mode === "locations",
  });
  const accounts = accountsQuery.data?.accounts ?? [];
  const locations = locationsQuery.data?.locations ?? [];
  const loading = accountsQuery.isLoading || (mode === "locations" && locationsQuery.isLoading);
  const error = accountsQuery.error || (mode === "locations" ? locationsQuery.error : null);
  const refreshing = accountsQuery.isFetching || (mode === "locations" && locationsQuery.isFetching);
  const refreshRecords = () => Promise.all([
    accountsQuery.refetch(),
    ...(mode === "locations" ? [locationsQuery.refetch()] : []),
  ]);
  const filteredAccounts = accounts.filter((account) => Object.values(account).join(" ").toLowerCase().includes(search.toLowerCase()));
  const filteredLocations = locations.filter((location) => Object.values(location).join(" ").toLowerCase().includes(search.toLowerCase()));

  return (
    <div className="space-y-5">
      <section className="grid gap-3 sm:grid-cols-3">
        <div className="rounded-xl border bg-white p-4"><p className="text-sm font-medium text-slate-500">Live accounts</p><p className="mt-2 text-3xl font-bold text-slate-900">{accounts.length}</p><p className="mt-2 text-xs text-slate-500">Versioned contracts and rate cards</p></div>
        <div className="rounded-xl border bg-white p-4"><p className="text-sm font-medium text-slate-500">Service locations</p><p className="mt-2 text-3xl font-bold text-slate-900">{accounts.reduce((sum, account) => sum + Number(account.locationCount || 0), 0)}</p><p className="mt-2 text-xs text-slate-500">With department-level structure</p></div>
        <div className="rounded-xl border bg-[#102748] p-4 text-white"><p className="text-sm font-medium text-blue-200">Assets connected</p><p className="mt-2 text-3xl font-bold">{accounts.reduce((sum, account) => sum + Number(account.assetCount || 0), 0)}</p><p className="mt-2 text-xs text-blue-100/70">One service history per asset</p></div>
      </section>
      <article className="overflow-hidden rounded-xl border bg-white">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b p-5">
          <div><h2 className="font-bold text-slate-900">{mode === "accounts" ? "Account directory" : "Location directory"}</h2><p className="mt-1 text-xs text-slate-500">{mode === "accounts" ? "The top level of every TechFlex customer relationship" : "Service sites, departments, access details, and asset totals"}</p></div>
          <div className="flex min-w-0 flex-wrap items-center gap-2">
            <div className="flex items-center rounded-lg border bg-slate-50 px-3"><Search className="size-4 text-slate-400" /><input aria-label={`Filter ${mode}`} className="h-9 w-40 bg-transparent px-2 text-sm outline-none" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Filter…" /></div>
            <Button variant="outline" size="icon" onClick={refreshRecords} disabled={refreshing} aria-label="Refresh records"><RefreshCw className={refreshing ? "animate-spin" : undefined} /></Button>
            <Sheet open={open} onOpenChange={setOpen}>
              <SheetTrigger asChild><Button><Plus /> Add {mode === "accounts" ? "account" : "location"}</Button></SheetTrigger>
              <SheetContent className="w-full overflow-y-auto sm:max-w-xl">
                <SheetHeader className="border-b px-6 pb-5 pt-6"><SheetTitle>Add {mode === "accounts" ? "account" : "location"}</SheetTitle><SheetDescription>This becomes a live TechFlex record and is added to the audit trail.</SheetDescription></SheetHeader>
                {mode === "accounts" ? <AddAccountForm close={() => setOpen(false)} /> : <AddLocationForm accounts={accounts} close={() => setOpen(false)} />}
              </SheetContent>
            </Sheet>
          </div>
        </div>
        {error ? <div role="alert" className="flex items-center gap-3 border-b border-amber-200 bg-amber-50 px-5 py-4 text-sm text-amber-900"><CircleAlert className="size-4 shrink-0" /><span>{error.message} Use Refresh records to try loading again.</span></div> : null}
        {loading ? <div className="px-5 py-12 text-center text-sm text-slate-500">Loading live records…</div> : null}
        {!loading && !error && (mode === "accounts" ? accounts : locations).length === 0 ? <EmptyState mode={mode} onOpen={() => setOpen(true)} /> : null}
        {!loading && !error && (mode === "accounts" ? accounts : locations).length > 0 && (mode === "accounts" ? filteredAccounts : filteredLocations).length === 0 ? <div className="space-y-3 px-5 py-10 text-center text-sm text-slate-600"><p>No {mode} match your filter. Your saved records have not been removed.</p><Button variant="outline" onClick={() => setSearch("")}>Clear filter</Button></div> : null}
        {!loading && mode === "accounts" && filteredAccounts.length > 0 ? (
          <Table>
            <TableHeader>
              <TableRow className="bg-slate-50">
                <TableHead className="pl-5">ACCOUNT</TableHead>
                <TableHead>TYPE</TableHead>
                <TableHead>LOCATIONS</TableHead>
                <TableHead>BIOMEDICAL ASSETS</TableHead>
                <TableHead>TERMS / SLA</TableHead>
                <TableHead className="text-right pr-6">ACTIONS</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredAccounts.map((account) => (
                <TableRow key={account.id} className="hover:bg-slate-50/70 transition-colors">
                  <TableCell className="pl-5">
                    <p className="font-bold text-slate-900">{account.name}</p>
                    <p className="mt-1 text-xs text-slate-500">{account.billingEmail || "No billing email"}</p>
                  </TableCell>
                  <TableCell className="capitalize text-slate-600">
                    {account.serviceDiscipline === "biomedical" ? "Biomedical / PM" : account.serviceDiscipline === "dme_mobility" ? "DME / Mobility" : "Work type pending"} · {(account.accountType || "facility").replaceAll("_", " ")}
                  </TableCell>
                  <TableCell className="font-bold">{account.locationCount}</TableCell>
                  <TableCell className="font-bold">{account.serviceDiscipline === "dme_mobility" ? "—" : account.assetCount}</TableCell>
                  <TableCell>
                    <p className="font-semibold">{account.paymentTermsDays} days</p>
                    <p className="mt-1 text-xs text-slate-500">{account.serviceLevel || "Standard"}</p>
                  </TableCell>
                  <TableCell className="text-right pr-6">
                    <div className="flex items-center justify-end gap-1.5">
                      <Button
                        variant="outline"
                        size="sm"
                        className="h-8 px-2.5 text-xs font-medium text-slate-700 hover:bg-slate-100 hover:text-slate-900 border-slate-200"
                        onClick={() => setViewingAccount(account)}
                        title="View account details"
                      >
                        <Eye className="size-3.5 mr-1 text-slate-500" />
                        View
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        className="h-8 px-2.5 text-xs font-medium text-blue-700 hover:bg-blue-50 hover:text-blue-800 border-blue-200"
                        onClick={() => setEditingAccount(account)}
                        title="Edit account"
                      >
                        <Pencil className="size-3.5 mr-1 text-blue-600" />
                        Edit
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        className="h-8 px-2.5 text-xs font-medium text-red-600 hover:bg-red-50 hover:text-red-700 border-red-200"
                        onClick={() => setDeletingAccount(account)}
                        title="Delete account"
                      >
                        <Trash2 className="size-3.5 mr-1 text-red-500" />
                        Delete
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        ) : null}
        {!loading && mode === "locations" && filteredLocations.length > 0 ? (
          <Table><TableHeader><TableRow className="bg-slate-50"><TableHead className="pl-5">LOCATION</TableHead><TableHead>ACCOUNT</TableHead><TableHead>ADDRESS</TableHead><TableHead>DEPARTMENTS</TableHead><TableHead>BIOMEDICAL ASSETS</TableHead></TableRow></TableHeader><TableBody>{filteredLocations.map((location) => <TableRow key={location.id}><TableCell className="pl-5"><p className="font-bold text-slate-900">{location.name}</p><p className="mt-1 text-xs capitalize text-slate-500">{location.locationType?.replaceAll("_", " ") || "Service location"}</p></TableCell><TableCell className="font-semibold">{location.accountName}</TableCell><TableCell className="text-slate-600">{location.address1}, {location.city}, {location.state} {location.postalCode}</TableCell><TableCell className="font-bold">{location.departmentCount}</TableCell><TableCell className="font-bold">{location.assetCount}</TableCell></TableRow>)}</TableBody></Table>
        ) : null}
      </article>

      {/* Action Dialogs */}
      <ViewAccountDialog
        account={viewingAccount}
        open={!!viewingAccount}
        onOpenChange={(isOpen) => !isOpen && setViewingAccount(null)}
        onEdit={(acc) => setEditingAccount(acc)}
      />
      <EditAccountDialog
        account={editingAccount}
        open={!!editingAccount}
        onOpenChange={(isOpen) => !isOpen && setEditingAccount(null)}
      />
      <DeleteAccountDialog
        account={deletingAccount}
        open={!!deletingAccount}
        onOpenChange={(isOpen) => !isOpen && setDeletingAccount(null)}
      />
    </div>
  );
}
