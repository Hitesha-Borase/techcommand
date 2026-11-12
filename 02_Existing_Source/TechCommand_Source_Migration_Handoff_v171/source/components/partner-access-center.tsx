"use client";

import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Building2,
  Check,
  Copy,
  KeyRound,
  Link2,
  MessageSquareText,
  Send,
  ShieldCheck,
  UserPlus,
  type LucideIcon,
} from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { PartnerLaunchStudio } from "@/components/partner-launch-studio";
import { portalFetch, portalJson } from "@/lib/portal-fetch";

type Payload = {
  accounts: { id: string; name: string }[];
  locations: { id: string; accountId: string; name: string }[];
  access: {
    id: string;
    userId: string;
    accountId: string;
    locationId: string | null;
    role: string;
    status: string;
    email: string;
    displayName: string;
    lastSeenAt: string | null;
    accountName: string;
    locationName: string | null;
  }[];
  messages: {
    id: string;
    accountId: string;
    accountName: string;
    workOrderId: string | null;
    subject: string;
    body: string;
    createdAt: string;
    senderName: string;
    senderRole: string;
  }[];
  error?: string;
};

type LoginStatus = { userId: string; loginStatus: "not_created" | "temporary_password" | "ready" | "disabled" };
type Credential = { email: string; temporaryPassword?: string; warning?: string };

type IntegrationPayload = {
  keys: {
    id: string;
    accountId: string;
    accountName: string;
    name: string;
    keyPrefix: string;
    scopes: string[];
    status: string;
    lastUsedAt: string | null;
    expiresAt: string | null;
    createdAt: string;
  }[];
};

export function PartnerAccessCenter() {
  const client = useQueryClient();
  const [form, setForm] = useState({
    displayName: "",
    email: "",
    accountId: "",
    role: "client_administrator",
    locationId: "",
  });
  const [message, setMessage] = useState({
    accountId: "",
    subject: "",
    body: "",
  });
  const [apiKeyForm, setApiKeyForm] = useState({
    accountId: "",
    name: "Primary partner connection",
  });
  const [newToken, setNewToken] = useState("");
  const [credential, setCredential] = useState<Credential | null>(null);
  const [loginError, setLoginError] = useState("");
  const [loginBusy, setLoginBusy] = useState("");
  const logins = useQuery({
    queryKey: ["password-access"],
    queryFn: async () => portalJson<{ configured: boolean; users: LoginStatus[] }>(await portalFetch("/api/access/passwords"), "Login status could not be loaded."),
  });
  async function manageLogin(userId: string, action: "create" | "reset") {
    if (action === "reset" && !window.confirm("Replace this person's password with the standard temporary password? They must choose a personal password on their next sign-in.")) return;
    setLoginBusy(userId); setLoginError(""); setCredential(null);
    try {
      const result = await portalJson<Credential>(await portalFetch("/api/access/passwords", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action, userId }) }), "Login change could not be confirmed.");
      setCredential(result);
      if (result.warning) setLoginError(result.warning);
    } catch (error) { setLoginError(error instanceof Error ? error.message : "Login change could not be confirmed."); }
    finally { setLoginBusy(""); await client.invalidateQueries({ queryKey: ["password-access"] }); }
  }
  const query = useQuery({
    queryKey: ["client-access"],
    queryFn: async () => {
      const response = await portalFetch("/api/client-access");
      return portalJson<Payload>(response,"Partner access could not be loaded.");
    },
  });
  const integrations = useQuery({
    queryKey: ["partner-integrations"],
    queryFn: async () => {
      const response = await portalFetch("/api/integrations/partner");
      return portalJson<IntegrationPayload>(response,"Partner integrations could not be loaded.");
    },
  });
  const createApiKey = useMutation({
    mutationFn: async () => {
      const response = await portalFetch("/api/integrations/partner", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(apiKeyForm),
      });
      const data = await portalJson<{ key?: { token: string } }>(response,"Partner credential could not be created.");
      if (!data.key) throw new Error("Partner credential could not be created.");
      return data.key;
    },
    onSuccess: (key) => {
      setNewToken(key.token);
      integrations.refetch();
      toast.success("Partner API credential created");
    },
    onError: (error: Error) => toast.error(error.message),
  });
  const revokeApiKey = useMutation({
    mutationFn: async (id: string) => {
      const response = await portalFetch("/api/integrations/partner", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "revoke", id }),
      });
      await portalJson<{ revoked: boolean }>(response,"The credential could not be revoked.");
    },
    onSuccess: () => {
      integrations.refetch();
      toast.success("Partner API credential revoked");
    },
  });
  const locations = useMemo(
    () =>
      query.data?.locations.filter(
        (location) => location.accountId === form.accountId,
      ) ?? [],
    [query.data, form.accountId],
  );
  const invite = useMutation({
    mutationFn: async () => {
      setCredential(null); setLoginError("");
      const response = await portalFetch("/api/client-access", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ ...form, locationId: form.locationId || null }),
      });
      const data = await portalJson<{ access: { userId: string }; nextStep?: string }>(response,"Facility access could not be saved.");
      // Permissions are already saved. Keep that success visible if login setup
      // is interrupted; the saved directory has a Create login recovery action.
      try {
        const directory = await portalJson<{ configured: boolean; users: LoginStatus[] }>(await portalFetch("/api/access/passwords"), "Login status could not be loaded.");
        const current = directory.users.find(user => user.userId === data.access.userId);
        if (!directory.configured || !current) throw new Error("Login setup is unavailable. Use Create login in the saved facility directory when service returns.");
        if (current.loginStatus === "not_created") {
          const login = await portalJson<Credential>(await portalFetch("/api/access/passwords", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "create", userId: current.userId }) }), "Login creation could not be confirmed. Refresh its status before retrying.");
          return { ...data, login, loginError: login.warning || "" };
        }
        return { ...data, login: null, loginError: current.loginStatus === "disabled" ? "Facility access saved. This password login is disabled; use Reset password to restore it." : "" };
      } catch (error) {
        return { ...data, login: null, loginError: `Facility permissions saved. ${error instanceof Error ? error.message : "Login setup needs a retry."}` };
      }
    },
    onSuccess: (data) => {
      setCredential(data.login);
      setLoginError(data.loginError);
      if (data.loginError) toast.warning("Facility permissions saved; check login status");
      else toast.success(data.login ? "Facility access and login ready" : "Facility permissions saved; existing password kept");
      setForm({
        displayName: "",
        email: "",
        accountId: "",
        role: "client_administrator",
        locationId: "",
      });
      client.invalidateQueries({ queryKey: ["client-access"] });
      client.invalidateQueries({ queryKey: ["password-access"] });
    },
    onError: (error: Error) => toast.error(error.message),
  });
  const status = useMutation({
    mutationFn: async ({
      accessId,
      nextStatus,
    }: {
      accessId: string;
      nextStatus: string;
    }) => {
      const response = await portalFetch("/api/client-access", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ accessId, status: nextStatus }),
      });
      await portalJson<{ access: unknown }>(response,"Access could not be updated.");
    },
    onSuccess: async () => {
      await Promise.all([client.invalidateQueries({ queryKey: ["client-access"] }), client.invalidateQueries({ queryKey: ["password-access"] })]);
    },
    onError: (error: Error) => toast.error(error.message),
  });
  const sendMessage = useMutation({
    mutationFn: async () => {
      const response = await portalFetch("/api/client-access", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "send_message", ...message }),
      });
      await portalJson<{ message: unknown }>(response,"Message could not be sent.");
    },
    onSuccess: () => {
      toast.success("Partner message sent");
      setMessage({ accountId: "", subject: "", body: "" });
      client.invalidateQueries({ queryKey: ["client-access"] });
    },
    onError: (error: Error) => toast.error(error.message),
  });
  const activationText = (email: string, accountName: string) =>
    `Open https://app.techcommandhq.com for ${accountName}. Your username is ${email}. Use the password provided by your administrator; a temporary password must be changed before accessing your facility. No ChatGPT account is required.`;

  return (
    <div className="space-y-5">
      <section className="overflow-hidden rounded-xl border bg-white">
        <div className="bg-[radial-gradient(circle_at_90%_0%,rgba(34,211,238,.22),transparent_22rem),linear-gradient(115deg,#061827,#0a3150_62%,#07546b)] px-6 py-6 text-white">
          <div className="flex items-start gap-4">
            <span className="grid size-12 place-items-center rounded-2xl bg-white/10 text-cyan-200">
              <Building2 />
            </span>
            <div>
              <p className="text-xs font-bold uppercase tracking-[.2em] text-cyan-200">
                TechCommand Partner
              </p>
              <h2 className="mt-1 text-xl font-bold">
                Business-to-business portal
              </h2>
              <p className="mt-2 max-w-3xl text-sm leading-6 text-blue-100">
                Give every client contact an individual, account-scoped identity
                for requests, protected quotes, approvals, job visibility, and
                communication.
              </p>
            </div>
          </div>
        </div>
        <div className="grid gap-px bg-slate-200 md:grid-cols-3">
          {([
            ["Partner users", query.data?.access.length ?? 0, UserPlus],
            [
              "Client accounts",
              new Set(query.data?.access.map((item) => item.accountId)).size ??
                0,
              Building2,
            ],
            [
              "Verified sign-ins",
              query.data?.access.filter((item) => item.lastSeenAt).length ?? 0,
              ShieldCheck,
            ],
          ] satisfies Array<[string, number, LucideIcon]>).map(([label, value, Icon]) => (
            <div key={String(label)} className="bg-white p-5">
              <div className="flex items-center gap-2 text-sm font-semibold text-slate-500">
                <Icon className="size-4 text-cyan-700" />
                {String(label)}
              </div>
              <p className="mt-2 text-2xl font-bold">{String(value)}</p>
            </div>
          ))}
        </div>
      </section>

      {credential?.temporaryPassword ? <div className="space-y-2 rounded-xl border border-blue-200 bg-blue-50 p-4" data-private="true"><p className="font-semibold">Login ready: {credential.email}</p><p className="text-sm">Temporary password — a personal password is required on first sign-in.</p><code className="block break-all rounded bg-white p-3">{credential.temporaryPassword}</code><div className="flex flex-wrap gap-2"><Button variant="outline" onClick={async () => { try { await navigator.clipboard.writeText(`TechCommand login\nhttps://app.techcommandhq.com\nUsername: ${credential.email}\nTemporary password: ${credential.temporaryPassword}\nChoose your own password on first sign-in.`); toast.success("Login details copied"); } catch { setLoginError("Copy was unavailable. Select and copy the login details manually."); } }}><Copy />Copy login details</Button><Button variant="ghost" onClick={() => setCredential(null)}>Hide password</Button></div></div> : null}
      {loginError || logins.error ? <p role="alert" className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-950">{loginError || logins.error?.message}</p> : null}
      <PartnerLaunchStudio accounts={query.data?.accounts ?? []} />

      <section className="grid gap-5 xl:grid-cols-[.9fr_1.1fr]">
        <div className="rounded-xl border bg-white p-5">
          <div className="flex items-center gap-3">
            <span className="grid size-10 place-items-center rounded-xl bg-cyan-50 text-cyan-700">
              <KeyRound className="size-5" />
            </span>
            <div>
              <h3 className="font-bold">Add facility access</h3>
              <p className="text-sm text-slate-500">
                Enter the person’s email, then choose their account and permitted location.
              </p>
            </div>
          </div>
          <div className="mt-5 grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label>Name</Label>
              <Input
                value={form.displayName}
                onChange={(e) =>
                  setForm({ ...form, displayName: e.target.value })
                }
                placeholder="Client contact name"
              />
            </div>
            <div className="space-y-2">
              <Label>Email (username)</Label>
              <Input
                type="email"
                value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
                placeholder="contact@client.com"
              />
            </div>
            <div className="space-y-2">
              <Label>Client account</Label>
              <Select
                value={form.accountId}
                onValueChange={(value) =>
                  setForm({ ...form, accountId: value, locationId: "" })
                }
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select account" />
                </SelectTrigger>
                <SelectContent>
                  {query.data?.accounts.map((account) => (
                    <SelectItem key={account.id} value={account.id}>
                      {account.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Permission</Label>
              <Select
                value={form.role}
                onValueChange={(value) =>
                  setForm({ ...form, role: value, locationId: "" })
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="client_administrator">
                    All account locations
                  </SelectItem>
                  <SelectItem value="client_location_user">
                    One location only
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>
            {form.role === "client_location_user" && (
              <div className="space-y-2 sm:col-span-2">
                <Label>Allowed location</Label>
                <Select
                  value={form.locationId}
                  onValueChange={(value) =>
                    setForm({ ...form, locationId: value })
                  }
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select location" />
                  </SelectTrigger>
                  <SelectContent>
                    {locations.map((location) => (
                      <SelectItem key={location.id} value={location.id}>
                        {location.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
          </div>
          <Button
            className="mt-5 w-full bg-cyan-700 hover:bg-cyan-800"
            onClick={() => invite.mutate()}
            disabled={invite.isPending || !!loginBusy}
          >
            <UserPlus />
            {invite.isPending ? "Saving access and login…" : "Save facility access & create login"}
          </Button>
          <div className="mt-4 rounded-lg border border-blue-200 bg-blue-50 p-4 text-xs leading-5 text-blue-900">
            Email is the username. New logins use the company’s standard temporary password and require a personal password on first sign-in. Existing personal passwords stay unchanged when you update facility permissions. No ChatGPT account or viewer invitation is needed.
          </div>
        </div>

        <div className="rounded-xl border bg-white p-5">
          <h3 className="font-bold">Partner directory</h3>
          <p className="mt-1 text-sm text-slate-500">
            Scope, activation, and access status for every B2B contact.
          </p>
          <div className="mt-4 space-y-3">
            {query.isLoading && (
              <p className="text-sm text-slate-500">Loading partner access…</p>
            )}
            {query.error && (
              <p className="text-sm text-red-700">{query.error.message}</p>
            )}
            {query.data?.access.length === 0 && (
              <div className="rounded-lg border border-dashed p-6 text-center text-sm text-slate-500">
                No partner logins prepared yet.
              </div>
            )}
            {query.data?.access.map((item) => (
              <article key={item.id} className="rounded-lg border p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <div className="flex items-center gap-2">
                      <h4 className="font-bold">{item.displayName}</h4>
                      <Badge
                        variant="outline"
                        className={
                          item.status === "active"
                            ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                            : "border-slate-200 text-slate-500"
                        }
                      >
                        {item.status === "active"
                          ? item.lastSeenAt
                            ? "Verified"
                            : "Prepared"
                          : "Inactive"}
                      </Badge>
                    </div>
                    <p className="mt-1 text-sm text-slate-600">{item.email}</p>
                    <p className="mt-2 text-xs font-semibold text-cyan-800">
                      {item.accountName}
                      {item.locationName
                        ? ` · ${item.locationName}`
                        : " · All locations"}
                    </p>
                    <p className="mt-1 text-xs text-slate-600">{!logins.data?.users.some(user => user.userId === item.userId) ? (item.status === "inactive" ? "Facility access suspended" : "Login status unavailable") : ({ not_created: "Login not created — use Create login", temporary_password: "Login ready — password change required", ready: "Personal password active", disabled: "Password login disabled" })[logins.data?.users.find(user => user.userId === item.userId)?.loginStatus || "not_created"]}</p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {item.status === "active" ? <Button variant="outline" size="sm" disabled={!!loginBusy || invite.isPending || !logins.data?.configured || !logins.data.users.some(user => user.userId === item.userId)} onClick={() => manageLogin(item.userId, logins.data?.users.find(user => user.userId === item.userId)?.loginStatus === "not_created" ? "create" : "reset")}><KeyRound />{loginBusy === item.userId ? "Saving…" : logins.data?.users.find(user => user.userId === item.userId)?.loginStatus === "not_created" ? "Create login" : "Reset password"}</Button> : null}
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={async () => {
                        await navigator.clipboard.writeText(
                          activationText(item.email, item.accountName),
                        );
                        toast.success("Activation message copied");
                      }}
                    >
                      <Copy />
                      Copy sign-in instructions
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() =>
                        status.mutate({
                          accessId: item.id,
                          nextStatus:
                            item.status === "active" ? "inactive" : "active",
                        })
                      }
                    >
                      {item.status === "active" ? (
                        "Suspend"
                      ) : (
                        <>
                          <Check />
                          Restore
                        </>
                      )}
                    </Button>
                  </div>
                </div>
              </article>
            ))}
          </div>
        </div>
      </section>
      <section className="grid gap-5 xl:grid-cols-[.8fr_1.2fr]">
        <div className="rounded-xl border bg-white p-5">
          <div className="flex items-center gap-3">
            <span className="grid size-10 place-items-center rounded-xl bg-cyan-50 text-cyan-700">
              <MessageSquareText className="size-5" />
            </span>
            <div>
              <h3 className="font-bold">Partner communications</h3>
              <p className="text-sm text-slate-500">
                Send an account-visible message.
              </p>
            </div>
          </div>
          <div className="mt-5 space-y-4">
            <div className="space-y-2">
              <Label>Client account</Label>
              <Select
                value={message.accountId}
                onValueChange={(value) =>
                  setMessage({ ...message, accountId: value })
                }
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select account" />
                </SelectTrigger>
                <SelectContent>
                  {query.data?.accounts.map((account) => (
                    <SelectItem key={account.id} value={account.id}>
                      {account.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Subject</Label>
              <Input
                value={message.subject}
                onChange={(event) =>
                  setMessage({ ...message, subject: event.target.value })
                }
                placeholder="Authorization, scheduling, documentation…"
              />
            </div>
            <div className="space-y-2">
              <Label>Message</Label>
              <Textarea
                rows={5}
                value={message.body}
                onChange={(event) =>
                  setMessage({ ...message, body: event.target.value })
                }
              />
            </div>
            <Button
              className="w-full bg-cyan-700 hover:bg-cyan-800"
              onClick={() => sendMessage.mutate()}
              disabled={sendMessage.isPending}
            >
              <Send />
              Send to partner portal
            </Button>
          </div>
        </div>
        <div className="rounded-xl border bg-white p-5">
          <h3 className="font-bold">Shared message stream</h3>
          <p className="mt-1 text-sm text-slate-500">
            Only the selected client account and TechFlex administrators can
            read each thread.
          </p>
          <div className="mt-4 space-y-3">
            {query.data?.messages.map((item) => (
              <article key={item.id} className="rounded-lg border p-4">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <p className="text-sm font-bold">{item.subject}</p>
                    <p className="mt-1 text-xs text-slate-500">
                      {item.senderName} ·{" "}
                      {new Date(item.createdAt).toLocaleString()}
                    </p>
                  </div>
                  <Badge
                    variant="outline"
                    className="border-cyan-200 bg-cyan-50 text-cyan-800"
                  >
                    {item.accountName}
                  </Badge>
                </div>
                <p className="mt-3 whitespace-pre-wrap text-sm leading-6 text-slate-700">
                  {item.body}
                </p>
              </article>
            ))}
            {query.data?.messages.length === 0 && (
              <p className="rounded-lg border border-dashed p-6 text-center text-sm text-slate-500">
                No partner messages yet.
              </p>
            )}
          </div>
        </div>
      </section>
      <section className="rounded-xl border bg-white p-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <Link2 className="size-5 text-cyan-700" />
              <h3 className="font-bold">Partner API connections</h3>
            </div>
            <p className="mt-1 text-sm text-slate-500">
              Account-scoped, revocable credentials let a partner submit jobs
              directly into the same controlled intake queue.
            </p>
          </div>
          <Badge
            variant="outline"
            className="border-emerald-200 bg-emerald-50 text-emerald-700"
          >
            Idempotent intake
          </Badge>
        </div>
        <div className="mt-5 grid gap-3 md:grid-cols-[1fr_1fr_auto]">
          <Select
            value={apiKeyForm.accountId}
            onValueChange={(accountId) =>
              setApiKeyForm({ ...apiKeyForm, accountId })
            }
          >
            <SelectTrigger>
              <SelectValue placeholder="Select partner account" />
            </SelectTrigger>
            <SelectContent>
              {query.data?.accounts.map((account) => (
                <SelectItem key={account.id} value={account.id}>
                  {account.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Input
            value={apiKeyForm.name}
            onChange={(event) =>
              setApiKeyForm({ ...apiKeyForm, name: event.target.value })
            }
            placeholder="Connection name"
          />
          <Button
            disabled={!apiKeyForm.accountId || createApiKey.isPending}
            onClick={() => createApiKey.mutate()}
          >
            <KeyRound />
            Create API key
          </Button>
        </div>
        {newToken ? (
          <div className="mt-4 rounded-lg border border-amber-200 bg-amber-50 p-4">
            <p className="text-xs font-bold uppercase tracking-wide text-amber-800">
              Copy once — not retrievable later
            </p>
            <div className="mt-2 flex gap-2">
              <Input readOnly value={newToken} />
              <Button
                variant="outline"
                onClick={async () => {
                  await navigator.clipboard.writeText(newToken);
                  toast.success("Credential copied");
                }}
              >
                <Copy />
                Copy
              </Button>
            </div>
            <p className="mt-2 text-xs text-amber-800">
              Send as <code>Authorization: Bearer …</code> with a unique{" "}
              <code>Idempotency-Key</code> to{" "}
              <code>/api/integrations/v1/work-orders</code>.
            </p>
          </div>
        ) : null}
        <div className="mt-4 space-y-2">
          {integrations.data?.keys.map((key) => (
            <div
              key={key.id}
              className="flex flex-wrap items-center justify-between gap-3 rounded-lg border p-3"
            >
              <div>
                <p className="text-sm font-bold">
                  {key.accountName} · {key.name}
                </p>
                <p className="mt-1 text-xs text-slate-500">
                  {key.keyPrefix}… ·{" "}
                  {key.lastUsedAt
                    ? `last used ${new Date(key.lastUsedAt).toLocaleString()}`
                    : "never used"}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <Badge variant="outline">{key.status}</Badge>
                {key.status === "active" ? (
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => revokeApiKey.mutate(key.id)}
                  >
                    Revoke
                  </Button>
                ) : null}
              </div>
            </div>
          ))}
        </div>
        <p className="mt-4 text-xs leading-5 text-slate-500">
          The current private Site access layer may reject unauthenticated
          machine traffic before it reaches this endpoint. The API is
          implemented and account-fenced; production partner activation requires
          either an approved machine-auth path on the custom domain or a
          separate public integration gateway using the same database.
        </p>
      </section>
      <section className="rounded-xl border border-cyan-200 bg-cyan-50 p-5">
        <div className="flex gap-3">
          <Link2 className="mt-0.5 size-5 shrink-0 text-cyan-800" />
          <div>
            <h3 className="font-bold text-cyan-950">
              Two locks protect every client
            </h3>
            <p className="mt-1 text-sm leading-6 text-cyan-900">
              Site authorization controls who can reach TechCommand. The portal
              account scope controls which company and locations they can see.
              Both must match, and every quote decision or message is recorded
              under the individual user.
            </p>
          </div>
        </div>
      </section>
    </div>
  );
}
