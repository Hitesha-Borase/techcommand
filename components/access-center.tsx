"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import {
  Clock3,
  KeyRound,
  RefreshCw,
  ShieldCheck,
  UserCheck,
  UsersRound,
  Copy,
  UserPlus,
  type LucideIcon,
} from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { portalFetch, portalJson } from "@/lib/portal-fetch";
import { PasswordAccess } from "@/components/password-access";

type Administrator = {
  email: string;
  displayName: string;
  role: "owner_administrator" | "operations_administrator";
  approved: boolean;
  accountStatus: "active" | "first_sign_in_pending";
  lastSeenAt: string | null;
};

type AccessPayload = {
  viewerRole: string;
  approvedAdministrators: Administrator[];
  roleCapabilities: Record<Administrator["role"], string[]>;
  authentication: {
    mode: "individual_email_password";
    sharedPasswordEnabled: false;
    passwordChangeOnFirstSignIn: true;
    sessionAttribution: true;
  };
  error?: string;
};

function roleLabel(role: Administrator["role"]) {
  return role === "owner_administrator"
    ? "Owner administrator"
    : "Operations administrator";
}

function seenLabel(value: string | null) {
  if (!value) return "Waiting for first portal sign-in";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Portal account activated";
  return `Last verified ${new Intl.DateTimeFormat("en-US", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "America/New_York",
  }).format(date)} ET`;
}

export function AccessCenter() {
  const client = useQueryClient();
  const [reviewer, setReviewer] = useState({ displayName: "", email: "" });
  const [administrator, setAdministrator] = useState({ displayName: "", email: "", username: "" });
  const [setupPassword, setSetupPassword] = useState("");
  const [createTestTechnician, setCreateTestTechnician] = useState(false);
  const [testTechnicianUsername, setTestTechnicianUsername] = useState("");
  const [administratorResult, setAdministratorResult] = useState<{ administrator: { displayName: string; email: string; username: string }; loginCreated: boolean; temporaryPassword?: string; warning?: string;
    logins?: { userId: string; displayName: string; username: string; loginCreated: boolean; warning?: string }[] } | null>(null);
  const query = useQuery({
    queryKey: ["access-center"],
    queryFn: async () => {
      const response = await portalFetch("/api/access");
      return portalJson<AccessPayload>(response,"User access could not be loaded.");
    },
  });
  const addAdministrator = useMutation({
    mutationFn: async () => portalJson<NonNullable<typeof administratorResult>>(
      await portalFetch("/api/access", { method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...administrator, role: "operations_administrator", ...(setupPassword ? { temporaryPassword: setupPassword } : {}),
          ...(createTestTechnician ? { testTechnicianUsername } : {}) }) }),
      "Administrator setup could not be confirmed. Refresh status before trying again.",
    ),
    onSuccess: async result => {
      setAdministratorResult(result);
      setAdministrator({ displayName: "", email: "", username: "" });
      setSetupPassword(""); setCreateTestTechnician(false); setTestTechnicianUsername("");
      await Promise.all([client.invalidateQueries({ queryKey: ["access-center"] }), client.invalidateQueries({ queryKey: ["password-access"] })]);
      toast.success((result.logins?.every(row => row.loginCreated) ?? result.loginCreated) ? "Account logins ready" : "Profiles saved — check login status");
    },
  });
  const reviewerQuery = useQuery({
    queryKey: ["review-access"],
    queryFn: async () => {
      const response = await portalFetch("/api/review-access");
      const data = await portalJson<{ reviewers?: { membershipId: string; email: string; displayName: string; status: string; lastSeenAt: string | null }[] }>(response,"Reviewer access could not be loaded.");
      return data.reviewers ?? [];
    },
  });
  const prepareReviewer = useMutation({
    mutationFn: async () => {
      const response = await portalFetch("/api/review-access", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(reviewer) });
      await portalJson<{ reviewer: unknown }>(response,"Reviewer access could not be prepared.");
    },
    onSuccess: async () => {
      await client.invalidateQueries({ queryKey: ["review-access"] });
      await client.invalidateQueries({ queryKey: ["password-access"] });
      setReviewer({ displayName: "", email: "" });
      toast.success("Consultant review profile prepared");
    },
    onError: (error: Error) => toast.error(error.message),
  });
  const changeReviewerStatus = useMutation({
    mutationFn: async ({ membershipId, status }: { membershipId: string; status: "active" | "inactive" }) => {
      const response = await portalFetch("/api/review-access", { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ membershipId, status }) });
      await portalJson<{ access: unknown }>(response,"Reviewer access could not be changed.");
    },
    onSuccess: () => client.invalidateQueries({ queryKey: ["review-access"] }),
    onError: (error: Error) => toast.error(error.message),
  });

  if (query.isLoading) {
    return (
      <div className="grid min-h-[360px] place-items-center rounded-xl border bg-white text-sm font-semibold text-slate-500">
        Verifying administrator access…
      </div>
    );
  }

  if (query.error || !query.data) {
    return (
      <div className="rounded-xl border border-red-200 bg-red-50 p-5 text-sm text-red-800">
        {query.error?.message || "User access could not be loaded."}
      </div>
    );
  }

  const owners = query.data.approvedAdministrators.filter(
    (administrator) => administrator.role === "owner_administrator",
  ).length;
  const operations = query.data.approvedAdministrators.length - owners;

  return (
    <div className="space-y-5">
      {query.data.viewerRole === "owner_administrator" ? <section className="rounded-xl border bg-white p-5">
        <h3 className="flex items-center gap-2 text-lg font-bold"><UserPlus className="size-5 text-blue-700" />Add administrator</h3>
        <p className="mt-2 text-sm leading-6 text-slate-600">Creates an operations administrator and their individual login. They can manage customers, jobs, scheduling and technicians. Company ownership and owner-level controls are not transferred.</p>
        <div className="mt-4 grid gap-4 md:grid-cols-3">
          <div className="space-y-2"><Label htmlFor="administrator-name">Administrator name</Label><Input id="administrator-name" className="min-h-11" value={administrator.displayName} onChange={event => setAdministrator(current => ({ ...current, displayName: event.target.value }))} placeholder="First Last" disabled={addAdministrator.isPending} /></div>
          <div className="space-y-2"><Label htmlFor="administrator-email">Administrator email</Label><Input id="administrator-email" className="min-h-11" type="email" value={administrator.email} onChange={event => setAdministrator(current => ({ ...current, email: event.target.value }))} placeholder="name@company.com" disabled={addAdministrator.isPending} /></div>
          <div className="space-y-2"><Label htmlFor="administrator-username">Administrator username</Label><Input id="administrator-username" className="min-h-11" value={administrator.username} onChange={event => setAdministrator(current => ({ ...current, username: event.target.value }))} placeholder="First.Last" autoCapitalize="none" autoCorrect="off" spellCheck={false} disabled={addAdministrator.isPending} /></div>
        </div>
        <div className="mt-4 space-y-2"><Label htmlFor="administrator-temporary-password">Temporary password for this setup</Label><Input id="administrator-temporary-password" className="min-h-11 max-w-sm" type="password" autoComplete="new-password" minLength={8} maxLength={256} value={setupPassword} onChange={event => setSetupPassword(event.target.value)} placeholder="Leave blank to use the company default" disabled={addAdministrator.isPending} data-private="true" /><p className="text-sm text-slate-600">Used for these new logins only. Each account chooses a personal password at first sign-in.</p></div>
        <div className="mt-4 rounded-lg border p-4"><div className="flex items-center gap-3"><Checkbox id="administrator-test-technician" checked={createTestTechnician} disabled={addAdministrator.isPending} onCheckedChange={value => { setCreateTestTechnician(value === true); if (value === true && !testTechnicianUsername) setTestTechnicianUsername(`${administrator.username.split(".")[0] || "Demo"}.TestTech`); }} /><Label htmlFor="administrator-test-technician">Also create a separate technician test login</Label></div>{createTestTechnician ? <div className="mt-3 space-y-2"><Label htmlFor="test-technician-username">Test technician username</Label><Input id="test-technician-username" className="min-h-11 max-w-sm" value={testTechnicianUsername} onChange={event => setTestTechnicianUsername(event.target.value)} autoCapitalize="none" autoCorrect="off" spellCheck={false} disabled={addAdministrator.isPending} /><p className="text-sm leading-6 text-slate-600">Marked TEST technician, with biomedical and DME workflows, zero pay and no assigned jobs. This account uses the live portal; assign test jobs only. Its internal test email does not receive messages.</p></div> : null}</div>
        <AlertDialog><AlertDialogTrigger asChild><Button className="mt-4 min-h-11" disabled={addAdministrator.isPending || !administrator.displayName.trim() || !administrator.email.trim() || !administrator.username.trim() || (setupPassword.length > 0 && setupPassword.length < 8) || (createTestTechnician && !testTechnicianUsername.trim())}>{addAdministrator.isPending ? "Creating accounts…" : "Review administrator access"}</Button></AlertDialogTrigger>
          <AlertDialogContent><AlertDialogHeader><AlertDialogTitle>Add {administrator.displayName} as an administrator?</AlertDialogTitle><AlertDialogDescription>{administrator.email} will receive operations administrator access to TechCommand OS: customer records, jobs, scheduling, dispatch and technician management. Username: {administrator.username}. {createTestTechnician ? `A separate technician test login will also be created as ${testTechnicianUsername}. ` : ""}These logins use {setupPassword ? "the temporary password selected for this setup" : "the company’s configured temporary password"} and require personal passwords at first sign-in. This does not transfer company ownership or grant Site editing access.</AlertDialogDescription></AlertDialogHeader><AlertDialogFooter><AlertDialogCancel>Cancel</AlertDialogCancel><AlertDialogAction disabled={addAdministrator.isPending} onClick={() => addAdministrator.mutate()}>{createTestTechnician ? "Create both accounts" : "Add administrator"}</AlertDialogAction></AlertDialogFooter></AlertDialogContent>
        </AlertDialog>
        {addAdministrator.error ? <p role="alert" className="mt-3 text-sm text-red-700">{addAdministrator.error.message}</p> : null}
        {administratorResult ? <div className="mt-4 space-y-3 rounded-lg border border-blue-200 bg-blue-50 p-4" data-private="true" role="status"><p className="font-semibold">{administratorResult.loginCreated ? "Administrator login ready" : "Administrator profile saved"}: {administratorResult.administrator.displayName}</p><p className="break-all text-sm">Username: {administratorResult.administrator.username}<br />Email: {administratorResult.administrator.email}</p>{administratorResult.logins?.map(row => <p key={row.userId} className="text-sm"><b>{row.displayName}</b> · {row.username} · {row.loginCreated ? "Login ready" : "Check login status"}{row.warning ? <span className="block text-amber-900">{row.warning}</span> : null}</p>)}{administratorResult.temporaryPassword ? <><p className="text-sm">Temporary password for confirmed new logins only. Share privately. First sign-in requires a personal password.</p><code className="block rounded bg-white p-3 text-base">{administratorResult.temporaryPassword}</code></> : null}{!administratorResult.logins && administratorResult.warning ? <p className="text-sm text-amber-900">{administratorResult.warning}</p> : null}<Button variant="outline" onClick={() => setAdministratorResult(null)}>Hide setup details</Button></div> : null}
      </section> : null}
      <PasswordAccess />
      <section className="overflow-hidden rounded-xl border bg-white">
        <div className="flex flex-col gap-4 border-b bg-[radial-gradient(circle_at_90%_0%,rgba(52,211,235,.2),transparent_20rem),linear-gradient(110deg,#071827,#0a2b47_60%,#0b5165)] px-5 py-5 text-white sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-start gap-3">
            <span className="grid size-11 shrink-0 place-items-center rounded-xl bg-white/10 text-cyan-200">
              <ShieldCheck className="size-6" />
            </span>
            <div>
              <h2 className="text-lg font-bold">Users &amp; access</h2>
              <p className="mt-1 text-sm leading-5 text-blue-100">
                Approved TechFlex administrators and their permission boundary.
              </p>
            </div>
          </div>
          <Button
            variant="outline"
            className="border-white/20 bg-white/10 text-white hover:bg-white/20 hover:text-white"
            onClick={() => query.refetch()}
            disabled={query.isFetching}
          >
            <RefreshCw className={query.isFetching ? "animate-spin" : ""} />
            Refresh status
          </Button>
        </div>

        <div className="grid gap-px bg-slate-200 sm:grid-cols-3">
          {([
            ["Approved administrators", query.data.approvedAdministrators.length, UsersRound],
            ["Owner administrators", owners, KeyRound],
            ["Operations administrators", operations, UserCheck],
          ] satisfies Array<[string, number, LucideIcon]>).map(([label, value, Icon]) => (
            <div key={String(label)} className="bg-white px-5 py-4">
              <div className="flex items-center gap-2 text-sm font-semibold text-slate-500">
                <Icon className="size-4 text-blue-600" /> {String(label)}
              </div>
              <p className="mt-2 text-2xl font-bold text-slate-900">
                {String(value)}
              </p>
            </div>
          ))}
        </div>
      </section>

      <section className="rounded-xl border border-blue-200 bg-blue-50 p-5">
        <div className="flex gap-3">
          <KeyRound className="mt-0.5 size-5 shrink-0 text-blue-700" />
          <div>
            <h3 className="font-bold text-blue-950">Individual sign-in is enforced</h3>
            <p className="mt-1 text-sm leading-6 text-blue-900">
              Each person uses an individual login. Existing permissions stay attached
              to their profile, so approvals and record changes remain attributable to one person.
            </p>
          </div>
        </div>
      </section>

      <section className="grid gap-4 xl:grid-cols-3">
        {query.data.approvedAdministrators.map((administrator) => (
          <article key={administrator.email} className="rounded-xl border bg-white p-5">
            <div className="flex items-start justify-between gap-3">
              <span className="grid size-10 place-items-center rounded-full bg-slate-900 text-sm font-bold text-white">
                {administrator.displayName
                  .split(" ")
                  .map((part) => part[0])
                  .join("")
                  .slice(0, 2)
                  .toUpperCase()}
              </span>
              <Badge
                variant="outline"
                className={
                  administrator.accountStatus === "active"
                    ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                    : "border-amber-200 bg-amber-50 text-amber-800"
                }
              >
                {administrator.accountStatus === "active"
                  ? "Active"
                  : "Approved"}
              </Badge>
            </div>
            <h3 className="mt-4 font-bold text-slate-900">
              {administrator.displayName}
            </h3>
            <p className="mt-1 break-all text-sm text-slate-600">
              {administrator.email}
            </p>
            <p className="mt-3 text-sm font-semibold text-blue-700">
              {administrator.email === "fboyer@ahcc.com" ? "Compliance Administrator · Full portal access" : roleLabel(administrator.role)}
            </p>
            <div className="mt-4 flex items-start gap-2 border-t pt-4 text-xs leading-5 text-slate-500">
              <Clock3 className="mt-0.5 size-3.5 shrink-0" />
              <span>{seenLabel(administrator.lastSeenAt)}</span>
            </div>
          </article>
        ))}
      </section>

      <section className="grid gap-4 lg:grid-cols-2">
        {(
          ["owner_administrator", "operations_administrator"] as const
        ).map((role) => (
          <article key={role} className="rounded-xl border bg-white p-5">
            <h3 className="font-bold text-slate-900">{roleLabel(role)}</h3>
            <ul className="mt-3 space-y-2 text-sm leading-5 text-slate-600">
              {query.data.roleCapabilities[role].map((capability) => (
                <li key={capability} className="flex gap-2">
                  <UserCheck className="mt-0.5 size-4 shrink-0 text-emerald-600" />
                  <span>{capability}</span>
                </li>
              ))}
            </ul>
          </article>
        ))}
      </section>

      <section className="overflow-hidden rounded-xl border bg-white">
        <div className="border-b bg-slate-950 p-5 text-white">
          <div className="flex items-start gap-3"><UserPlus className="mt-0.5 size-5 text-cyan-300" /><div><h3 className="font-bold">Consultant review access</h3><p className="mt-1 text-sm leading-6 text-slate-300">A read-only product review that explains the architecture and workflows without exposing production database rows, payroll, attachments, or credentials.</p></div></div>
        </div>
        <div className="grid gap-5 p-5 lg:grid-cols-[.8fr_1.2fr]">
          <div className="space-y-4">
            <div className="space-y-2"><Label>Name</Label><Input value={reviewer.displayName} onChange={(event) => setReviewer({ ...reviewer, displayName: event.target.value })} placeholder="Consultant name" /></div>
            <div className="space-y-2"><Label>Business email</Label><Input type="email" value={reviewer.email} onChange={(event) => setReviewer({ ...reviewer, email: event.target.value })} placeholder="consultant@company.com" /></div>
            <Button className="w-full" disabled={prepareReviewer.isPending || !reviewer.displayName || !reviewer.email} onClick={() => prepareReviewer.mutate()}><UserPlus />Prepare review login</Button>
            <p className="text-sm leading-6 text-slate-500">After preparing the profile, create its login in TechCommand logins above. Reviewers receive a unique temporary password and must replace it at first sign-in. They can read the product walkthrough and submit feedback, but cannot access production records or edit the application.</p>
          </div>
          <div className="space-y-3">
            {reviewerQuery.isLoading ? <p className="text-sm text-slate-500">Loading reviewers…</p> : null}
            {reviewerQuery.data?.length === 0 ? <div className="rounded-lg border border-dashed p-6 text-center text-sm text-slate-500">No consultant reviewers prepared yet.</div> : null}
            {reviewerQuery.data?.map((item) => <article key={item.membershipId} className="rounded-lg border p-4"><div className="flex flex-wrap items-start justify-between gap-3"><div><div className="flex items-center gap-2"><p className="font-bold">{item.displayName}</p><Badge variant="outline" className={item.status === "active" ? "border-emerald-200 bg-emerald-50 text-emerald-700" : "border-slate-200 text-slate-500"}>{item.status === "active" ? item.lastSeenAt ? "Verified" : "Prepared" : "Suspended"}</Badge></div><p className="mt-1 text-sm text-slate-600">{item.email}</p></div><div className="flex gap-2"><Button size="sm" variant="outline" onClick={async () => { await navigator.clipboard.writeText(`Your TechCommand OS consultant profile is prepared. Open ${window.location.origin} and sign in using ${item.email} after your administrator privately shares your individual temporary password. Choose your own password on first sign-in. This account supports the product walkthrough and feedback, not production records or code editing.`); toast.success("Review invitation copied"); }}><Copy />Copy invite</Button><Button size="sm" variant="outline" onClick={() => changeReviewerStatus.mutate({ membershipId: item.membershipId, status: item.status === "active" ? "inactive" : "active" })}>{item.status === "active" ? "Suspend" : "Restore"}</Button></div></div></article>)}
          </div>
        </div>
      </section>
    </div>
  );
}
