"use client";
import { useMemo, useState, type ReactNode } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Contact, FileText, Plus, Search } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
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
type Account = { id: string; name: string };
type Location = {
  id: string;
  accountId: string;
  name: string;
  city: string;
  state: string;
};
type Customer = {
  id: string;
  name: string;
  externalId?: string | null;
  email?: string | null;
  phone?: string | null;
  address1?: string | null;
  city?: string | null;
  state?: string | null;
  postalCode?: string | null;
  accountId: string;
  accountName: string;
  locationId?: string | null;
  locationName?: string | null;
  workOrderCount: number;
  documentCount: number;
};
async function api<T>(url: string, init?: RequestInit): Promise<T> {
  const r = await fetch(url, {
    ...init,
    headers: { "Content-Type": "application/json", ...(init?.headers || {}) },
  });
  const d = (await r.json()) as T & { error?: string };
  if (!r.ok) throw new Error(d.error || "Customer file could not be saved.");
  return d;
}
const initial = {
  accountId: "",
  locationId: "none",
  externalId: "",
  name: "",
  email: "",
  phone: "",
  address1: "",
  city: "",
  state: "OH",
  postalCode: "",
  notes: "",
};
export function CustomerCenter() {
  const client = useQueryClient();
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [form, setForm] = useState(initial);
  const customers = useQuery({
    queryKey: ["customers"],
    queryFn: () => api<{ customers: Customer[] }>("/api/customers"),
  });
  const accounts = useQuery({
    queryKey: ["accounts"],
    queryFn: () => api<{ accounts: Account[] }>("/api/accounts"),
  });
  const locations = useQuery({
    queryKey: ["locations"],
    queryFn: () => api<{ locations: Location[] }>("/api/locations"),
  });
  const available = (locations.data?.locations || []).filter(
    (l) => l.accountId === form.accountId,
  );
  const create = useMutation({
    mutationFn: () =>
      api("/api/customers", {
        method: "POST",
        body: JSON.stringify({
          ...form,
          locationId: form.locationId === "none" ? null : form.locationId,
        }),
      }),
    onSuccess: async () => {
      await client.invalidateQueries({ queryKey: ["customers"] });
      setForm(initial);
      setOpen(false);
      toast.success("Customer file created");
    },
    onError: (e) => toast.error(e.message),
  });
  const visible = useMemo(
    () =>
      (customers.data?.customers || []).filter((c) =>
        Object.values(c).join(" ").toLowerCase().includes(search.toLowerCase()),
      ),
    [customers.data, search],
  );
  return (
    <div className="space-y-5">
      <section className="grid gap-3 sm:grid-cols-3">
        <Metric label="Customer files" value={visible.length} />
        <Metric
          label="Linked work orders"
          value={visible.reduce((n, c) => n + Number(c.workOrderCount || 0), 0)}
        />
        <Metric
          label="Filed documents"
          value={visible.reduce((n, c) => n + Number(c.documentCount || 0), 0)}
          dark
        />
      </section>
      <article className="overflow-hidden rounded-xl border bg-white">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b p-5">
          <div>
            <h2 className="font-bold">
              Customer and service-recipient directory
            </h2>
            <p className="mt-1 text-sm text-slate-500">
              Separate the person receiving service from the contract account
              paying for it.
            </p>
          </div>
          <div className="flex gap-2">
            <div className="flex items-center rounded-lg border bg-slate-50 px-3">
              <Search className="size-4 text-slate-400" />
              <input
                className="h-9 w-48 bg-transparent px-2 text-sm outline-none"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search customers…"
              />
            </div>
            <Sheet open={open} onOpenChange={setOpen}>
              <SheetTrigger asChild>
                <Button>
                  <Plus />
                  New customer
                </Button>
              </SheetTrigger>
              <SheetContent className="w-full overflow-y-auto sm:max-w-xl">
                <SheetHeader className="border-b px-6 pb-5 pt-6">
                  <SheetTitle>Create customer file</SheetTitle>
                  <SheetDescription>
                    Attach the recipient to the correct account and service
                    location so future work orders inherit clean information.
                  </SheetDescription>
                </SheetHeader>
                <form
                  className="space-y-4 p-6"
                  onSubmit={(e) => {
                    e.preventDefault();
                    create.mutate();
                  }}
                >
                  <Field label="Contract account">
                    <Select
                      value={form.accountId}
                      onValueChange={(v) =>
                        setForm({ ...form, accountId: v, locationId: "none" })
                      }
                    >
                      <SelectTrigger className="w-full">
                        <SelectValue placeholder="Select account" />
                      </SelectTrigger>
                      <SelectContent>
                        {accounts.data?.accounts.map((a) => (
                          <SelectItem key={a.id} value={a.id}>
                            {a.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </Field>
                  <Field label="Service location">
                    <Select
                      value={form.locationId}
                      onValueChange={(v) => setForm({ ...form, locationId: v })}
                    >
                      <SelectTrigger className="w-full">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">
                          Individual address / not yet linked
                        </SelectItem>
                        {available.map((l) => (
                          <SelectItem key={l.id} value={l.id}>
                            {l.name} · {l.city}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </Field>
                  <div className="grid gap-4 sm:grid-cols-2">
                    <Field label="Customer name">
                      <Input
                        required
                        value={form.name}
                        onChange={(e) =>
                          setForm({ ...form, name: e.target.value })
                        }
                      />
                    </Field>
                    <Field label="External customer ID">
                      <Input
                        value={form.externalId}
                        onChange={(e) =>
                          setForm({ ...form, externalId: e.target.value })
                        }
                      />
                    </Field>
                    <Field label="Phone">
                      <Input
                        value={form.phone}
                        onChange={(e) =>
                          setForm({ ...form, phone: e.target.value })
                        }
                      />
                    </Field>
                    <Field label="Email">
                      <Input
                        type="email"
                        value={form.email}
                        onChange={(e) =>
                          setForm({ ...form, email: e.target.value })
                        }
                      />
                    </Field>
                  </div>
                  <Field label="Service address">
                    <Input
                      value={form.address1}
                      onChange={(e) =>
                        setForm({ ...form, address1: e.target.value })
                      }
                    />
                  </Field>
                  <div className="grid grid-cols-[1fr_80px_100px] gap-3">
                    <Field label="City">
                      <Input
                        value={form.city}
                        onChange={(e) =>
                          setForm({ ...form, city: e.target.value })
                        }
                      />
                    </Field>
                    <Field label="State">
                      <Input
                        value={form.state}
                        onChange={(e) =>
                          setForm({
                            ...form,
                            state: e.target.value.toUpperCase(),
                          })
                        }
                      />
                    </Field>
                    <Field label="ZIP">
                      <Input
                        value={form.postalCode}
                        onChange={(e) =>
                          setForm({ ...form, postalCode: e.target.value })
                        }
                      />
                    </Field>
                  </div>
                  <Field label="Customer file notes">
                    <Textarea
                      value={form.notes}
                      onChange={(e) =>
                        setForm({ ...form, notes: e.target.value })
                      }
                    />
                  </Field>
                  <Button
                    className="w-full"
                    disabled={create.isPending || !form.accountId}
                  >
                    {create.isPending ? "Creating…" : "Create customer file"}
                  </Button>
                </form>
              </SheetContent>
            </Sheet>
          </div>
        </div>
        {visible.length ? (
          <Table>
            <TableHeader>
              <TableRow className="bg-slate-50">
                <TableHead className="pl-5">CUSTOMER</TableHead>
                <TableHead>ACCOUNT</TableHead>
                <TableHead>SERVICE ADDRESS</TableHead>
                <TableHead>CONTACT</TableHead>
                <TableHead>HISTORY</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {visible.map((c) => (
                <TableRow key={c.id}>
                  <TableCell className="pl-5">
                    <p className="font-bold">{c.name}</p>
                    <p className="mt-1 text-xs text-slate-500">
                      {c.externalId || "No external ID"}
                    </p>
                  </TableCell>
                  <TableCell>
                    <p className="font-semibold">{c.accountName}</p>
                    <p className="text-xs text-slate-500">
                      {c.locationName || "Individual address"}
                    </p>
                  </TableCell>
                  <TableCell className="text-sm text-slate-600">
                    {[c.address1, c.city, c.state, c.postalCode]
                      .filter(Boolean)
                      .join(", ") || "Not entered"}
                  </TableCell>
                  <TableCell>
                    <p className="text-sm">{c.phone || "—"}</p>
                    <p className="text-xs text-slate-500">{c.email || "—"}</p>
                  </TableCell>
                  <TableCell>
                    <span className="inline-flex items-center gap-1 text-sm">
                      <Contact className="size-4" />
                      {c.workOrderCount} visits
                    </span>
                    <span className="ml-3 inline-flex items-center gap-1 text-sm">
                      <FileText className="size-4" />
                      {c.documentCount}
                    </span>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        ) : (
          <div className="p-12 text-center text-sm text-slate-500">
            No customer files yet. Start with customers on active work orders.
          </div>
        )}
      </article>
    </div>
  );
}
function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="block space-y-1.5 text-sm font-semibold text-slate-700">
      {label}
      {children}
    </label>
  );
}
function Metric({
  label,
  value,
  dark,
}: {
  label: string;
  value: number;
  dark?: boolean;
}) {
  return (
    <div
      className={`rounded-xl border p-4 ${dark ? "bg-[#102748] text-white" : "bg-white"}`}
    >
      <p className={`text-sm ${dark ? "text-blue-200" : "text-slate-500"}`}>
        {label}
      </p>
      <p className="mt-2 text-3xl font-bold">{value}</p>
    </div>
  );
}
