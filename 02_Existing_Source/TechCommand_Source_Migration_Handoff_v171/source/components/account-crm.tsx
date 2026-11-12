"use client";

import { portalFetch } from "@/lib/portal-fetch";
import { crmErrorMessage } from "@/lib/crm-validation";

import { useState, type ReactNode } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Building2,
  CircleAlert,
  MapPin,
  Plus,
  RefreshCw,
  Search,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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
  billingEmail: string | null;
  paymentTermsDays: number;
  serviceLevel: string | null;
  serviceDiscipline: string | null;
  locationCount: number;
  assetCount: number;
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
    mutationFn: () => api("/api/accounts", {
      method: "POST",
      body: JSON.stringify({ name, accountType, billingEmail, paymentTermsDays: Number(terms), serviceLevel, serviceDiscipline: serviceDiscipline || null }),
    }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["accounts"] });
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
    mutationFn: () => api("/api/locations", {
      method: "POST",
      body: JSON.stringify({ accountId, name, locationType, address1, city, state, postalCode, departmentName }),
    }),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["accounts"] }),
        queryClient.invalidateQueries({ queryKey: ["locations"] }),
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

export function AccountCrm({ mode }: { mode: "accounts" | "locations" }) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
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
          <Table><TableHeader><TableRow className="bg-slate-50"><TableHead className="pl-5">ACCOUNT</TableHead><TableHead>TYPE</TableHead><TableHead>LOCATIONS</TableHead><TableHead>BIOMEDICAL ASSETS</TableHead><TableHead>TERMS / SLA</TableHead></TableRow></TableHeader><TableBody>{filteredAccounts.map((account) => <TableRow key={account.id}><TableCell className="pl-5"><p className="font-bold text-slate-900">{account.name}</p><p className="mt-1 text-xs text-slate-500">{account.billingEmail || "No billing email"}</p></TableCell><TableCell className="capitalize text-slate-600">{account.serviceDiscipline === "biomedical" ? "Biomedical / PM" : account.serviceDiscipline === "dme_mobility" ? "DME / Mobility" : "Work type pending"} · {account.accountType.replaceAll("_", " ")}</TableCell><TableCell className="font-bold">{account.locationCount}</TableCell><TableCell className="font-bold">{account.serviceDiscipline === "dme_mobility" ? "—" : account.assetCount}</TableCell><TableCell><p className="font-semibold">{account.paymentTermsDays} days</p><p className="mt-1 text-xs text-slate-500">{account.serviceLevel || "Standard"}</p></TableCell></TableRow>)}</TableBody></Table>
        ) : null}
        {!loading && mode === "locations" && filteredLocations.length > 0 ? (
          <Table><TableHeader><TableRow className="bg-slate-50"><TableHead className="pl-5">LOCATION</TableHead><TableHead>ACCOUNT</TableHead><TableHead>ADDRESS</TableHead><TableHead>DEPARTMENTS</TableHead><TableHead>BIOMEDICAL ASSETS</TableHead></TableRow></TableHeader><TableBody>{filteredLocations.map((location) => <TableRow key={location.id}><TableCell className="pl-5"><p className="font-bold text-slate-900">{location.name}</p><p className="mt-1 text-xs capitalize text-slate-500">{location.locationType?.replaceAll("_", " ") || "Service location"}</p></TableCell><TableCell className="font-semibold">{location.accountName}</TableCell><TableCell className="text-slate-600">{location.address1}, {location.city}, {location.state} {location.postalCode}</TableCell><TableCell className="font-bold">{location.departmentCount}</TableCell><TableCell className="font-bold">{location.assetCount}</TableCell></TableRow>)}</TableBody></Table>
        ) : null}
      </article>
    </div>
  );
}
