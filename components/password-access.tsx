"use client";
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Copy, KeyRound } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { portalFetch, portalJson } from "@/lib/portal-fetch";

type User = { userId: string; email: string; login: string; username: string | null; displayName: string; role: string; loginStatus: "not_created" | "temporary_password" | "ready" | "disabled" };
export function PasswordAccess() {
  const client = useQueryClient();
  const [search, setSearch] = useState("");
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [credential, setCredential] = useState<{ login: string; temporaryPassword: string } | null>(null);
  const [usernames, setUsernames] = useState<Record<string, string>>({});
  const [prepared, setPrepared] = useState<{ results: { name: string; login: string; status: string; message?: string }[]; temporaryPassword?: string } | null>(null);
  const query = useQuery({ queryKey: ["password-access"], queryFn: async () => portalJson<{ configured: boolean; users: User[] }>(await portalFetch("/api/access/passwords"), "Logins could not be loaded.") });
  async function manage(user: User, action: "create" | "reset" | "disable" | "username") {
    if (action === "disable" && !window.confirm(`Disable ${user.displayName}'s TechCommand password login?`)) return;
    if (action === "reset" && !window.confirm(`Replace ${user.displayName}'s current password with a new temporary password?`)) return;
    setBusy(user.userId); setError(""); setCredential(null);
    try {
      const result = await portalJson<{ login: string; email: string; temporaryPassword?: string; warning?: string }>(await portalFetch("/api/access/passwords", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action, userId: user.userId, ...(action !== "disable" && user.username ? { username: usernames[user.userId] ?? user.username } : {}) }) }), "Login change could not be confirmed.");
      if (result.temporaryPassword) setCredential({ login: result.login || result.email, temporaryPassword: result.temporaryPassword });
      if (result.warning) setError(result.warning);
      await client.invalidateQueries({ queryKey: ["password-access"] });
    } catch (caught) { setError(caught instanceof Error ? caught.message : "Login change could not be completed."); }
    finally { setBusy(""); }
  }
  async function prepareTechnicians() {
    if (!window.confirm("Prepare First.Last logins for current technicians? Only missing logins and temporary passwords will be created or reset. Personal passwords and disabled accounts will be preserved.")) return;
    setBusy("prepare"); setError(""); setCredential(null); setPrepared(null);
    try {
      const result = await portalJson<{ results: { name: string; login: string; status: string; message?: string }[]; temporaryPassword?: string }>(await portalFetch("/api/access/passwords", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "prepare_technicians" }) }), "Technician login setup could not be confirmed. Refresh individual login statuses before retrying.");
      setPrepared(result);
      await client.invalidateQueries({ queryKey: ["password-access"] });
    } catch (caught) { setError(caught instanceof Error ? caught.message : "Technician login setup could not be confirmed."); }
    finally { setBusy(""); }
  }
  return <section className="rounded-xl border bg-white p-5">
    <h3 className="flex items-center gap-2 text-lg font-bold"><KeyRound className="size-5 text-blue-700" />TechCommand logins</h3>
    <p className="mt-2 text-sm leading-6 text-slate-600">Technicians and administrators can use First.Last usernames or their email. You can edit a username below without resetting the password. Create or Reset supplies the company’s configured temporary password; first sign-in asks for a personal password, then opens their dashboard. Partners and reviewers keep email logins. Reviewers receive unique passwords. Existing assignments and permissions are preserved.</p>
    <Button className="mt-4 min-h-11" variant="outline" disabled={!!busy || !query.data?.configured} onClick={prepareTechnicians}>{busy === "prepare" ? "Preparing…" : "Prepare existing technician logins"}</Button>
    {prepared ? <div className="mt-4 space-y-3 rounded-lg border bg-blue-50 p-4" data-private="true"><p className="font-semibold">Existing technician login results</p>{prepared.temporaryPassword ? <p className="text-sm">Temporary password for created/reset logins only: <code>{prepared.temporaryPassword}</code>. First sign-in requires a personal password.</p> : null}<ul className="space-y-2">{prepared.results.map(row => <li key={row.login} className="text-sm"><b>{row.name}</b> · {row.login} · {row.status}{row.message ? <p className="text-slate-600">{row.message}</p> : null}</li>)}</ul><Button variant="ghost" onClick={() => setPrepared(null)}>Hide results</Button></div> : null}
    {credential ? <div className="mt-4 space-y-2 rounded-lg border border-blue-200 bg-blue-50 p-4" data-private="true"><p className="font-semibold">Login ready: {credential.login}</p><p className="text-sm">Share this temporary password privately. It is shown only now.</p><code className="block break-all rounded bg-white p-3 text-base">{credential.temporaryPassword}</code><div className="flex flex-wrap gap-2"><Button variant="outline" onClick={async () => { try { await navigator.clipboard.writeText(`TechCommand login\nhttps://app.techcommandhq.com/login\nLogin: ${credential.login}\nTemporary password: ${credential.temporaryPassword}\nChoose your own password when you sign in. Your dashboard opens your jobs and guided workflow.`); } catch { setError("Copy was unavailable. Select the temporary password and copy it manually."); } }}><Copy />Copy login details</Button><Button variant="ghost" onClick={() => setCredential(null)}>Hide password</Button></div></div> : null}
    {error || query.error ? <p role="alert" className="mt-3 text-sm text-red-700">{error || query.error?.message}</p> : null}
    {query.isPending ? <p className="mt-4 text-sm">Loading team logins…</p> : query.data?.configured === false ? <p className="mt-4 text-sm text-amber-800">Direct sign-in setup is still in progress.</p> : <>
      <Input className="my-4 min-h-11" aria-label="Find a team member" placeholder="Find a name, username or email" value={search} onChange={e => setSearch(e.target.value)} />
      <ul className="divide-y">{query.data?.users.filter(u => `${u.displayName} ${u.login} ${u.email}`.toLowerCase().includes(search.toLowerCase())).map(user => <li className="flex flex-wrap items-center justify-between gap-3 py-4" key={user.userId}><div className="min-w-0"><p className="font-semibold">{user.displayName}</p><p className="break-all text-sm text-slate-600">{user.email}</p>{user.username ? <div className="mt-2 flex flex-wrap gap-2"><Input className="min-h-11 max-w-60" aria-label={`Username for ${user.displayName}`} value={usernames[user.userId] ?? user.username} autoCapitalize="none" autoCorrect="off" spellCheck={false} onChange={e => setUsernames(current => ({ ...current, [user.userId]: e.target.value }))} /><Button className="min-h-11" variant="outline" disabled={!!busy || !usernames[user.userId] || usernames[user.userId] === user.username} onClick={() => manage(user, "username")}>Save username</Button></div> : null}<p className="mt-1 text-sm text-slate-500">{({ not_created: "Login not created", temporary_password: "Ready — change password on first sign-in", ready: "Personal password active", disabled: "Password login disabled" })[user.loginStatus]}</p></div><div className="flex flex-wrap gap-2"><Button className="min-h-11" disabled={!!busy} onClick={() => manage(user, user.loginStatus === "not_created" ? "create" : "reset")}>{busy === user.userId ? "Saving…" : user.loginStatus === "not_created" ? "Create login" : user.loginStatus === "disabled" ? "Restore with new password" : "Reset password"}</Button>{["ready", "temporary_password"].includes(user.loginStatus) ? <Button variant="outline" className="min-h-11" disabled={!!busy} onClick={() => manage(user, "disable")}>Disable login</Button> : null}</div></li>)}</ul>
      {!query.data?.users.length ? <p className="text-sm text-slate-600">Add a technician profile or prepare facility access in Partner access, then manage the login here.</p> : null}
    </>}
  </section>;
}
