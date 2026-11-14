"use client";
/* eslint-disable @next/next/no-html-link-for-pages -- Authentication transitions require a full document reload to discard the previous identity's client state. */

import { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { CheckCircle2, Eye, EyeOff, KeyRound, LogOut, ShieldCheck, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { z } from "zod";
import { clearIdentityBoundClientState } from "@/lib/identity-cache";
import { clearIdentityBoundDeviceState } from "@/lib/device-state";
import { portalFetch, portalJson } from "@/lib/portal-fetch";

const resultSchema = z.object({
  error: z.string().optional(),
  ok: z.boolean().optional(),
  signedIn: z.boolean().optional(),
  needsPasswordChange: z.boolean().optional(),
});

async function authAction(data: Record<string, unknown>) {
  const response = await fetch("/api/auth", {
    method: "POST",
    credentials: "same-origin",
    cache: "no-store",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify(data),
  });
  let result;
  try {
    result = resultSchema.parse(await response.json());
  } catch {
    throw new Error("Sign-in could not be confirmed. Please try again.");
  }
  if (!response.ok) throw new Error(result.error || "Sign-in could not be completed.");
  if (result.ok !== true) throw new Error("Sign-in was not confirmed. Please try again.");
  return result;
}

export function PasswordLogin({
  configured = true,
  initialStep = "login",
  initialEmail = "",
  initialError = "",
}: {
  configured?: boolean;
  initialStep?: "login" | "password" | "ready";
  initialEmail?: string;
  initialError?: string;
}) {
  const [visible, setVisible] = useState(false);
  const [deviceCleanupWarning, setDeviceCleanupWarning] = useState(false);
  const [loginVal, setLoginVal] = useState(initialEmail);
  const [passVal, setPassVal] = useState("");
  const change = initialStep === "password";

  useEffect(() => {
    const timer = window.setTimeout(
      () => setDeviceCleanupWarning(new URLSearchParams(window.location.search).get("device_cleanup") === "check"),
      0,
    );
    return () => window.clearTimeout(timer);
  }, []);

  return (
    <main className="fixed inset-0 h-screen max-h-screen w-screen overflow-hidden flex items-center justify-center bg-gradient-to-br from-[#05131f] via-[#082236] to-[#040e17] p-3 sm:p-4 select-none selection:bg-cyan-500 selection:text-white">
      {/* Background ambient lighting */}
      <div className="absolute -top-32 -left-32 size-96 rounded-full bg-cyan-500/10 blur-3xl pointer-events-none" />
      <div className="absolute -bottom-32 -right-32 size-96 rounded-full bg-blue-600/10 blur-3xl pointer-events-none" />

      {/* Main compact card */}
      <section
        className="relative z-10 w-full max-w-[420px] max-h-[94vh] rounded-2xl bg-white shadow-2xl border border-white/20 overflow-hidden flex flex-col my-auto"
        aria-labelledby="login-title"
      >
        {/* Header bar */}
        <div className="shrink-0 bg-gradient-to-r from-[#07243d] via-[#093554] to-[#0a455a] px-5 py-3 text-white flex items-center justify-between border-b border-cyan-400/20">
          <div className="flex items-center gap-2.5">
            <div className="p-1.5 rounded-lg bg-cyan-400/15 text-cyan-300 ring-1 ring-cyan-300/30">
              <ShieldCheck className="size-5" />
            </div>
            <div>
              <div className="flex items-center gap-1.5">
                <span className="text-sm font-extrabold tracking-tight text-white leading-tight">TechCommand</span>
                <span className="rounded bg-cyan-400/25 px-1 py-0.5 text-[9px] font-black tracking-wider text-cyan-200">OS</span>
              </div>
              <p className="text-[10px] text-cyan-200/80 font-medium leading-none mt-0.5">TechFlex Mobility Solutions</p>
            </div>
          </div>
          <div className="flex items-center gap-1.5 text-[10px] font-semibold text-emerald-300 bg-emerald-500/15 px-2 py-0.5 rounded-full ring-1 ring-emerald-400/30">
            <span className="size-1.5 rounded-full bg-emerald-400 animate-pulse" />
            Live Portal
          </div>
        </div>

        {/* Form Body */}
        <div className="p-4 sm:p-5 space-y-3 overflow-y-auto">
          <div className="text-center pb-0.5">
            <h1 id="login-title" className="text-base font-bold text-slate-900 tracking-tight">
              {change ? "Choose Your New Password" : initialStep === "ready" ? "You're Signed In" : "Sign in to your work"}
            </h1>
            <p className="text-[11px] text-slate-500 mt-0.5">
              {change
                ? "Replace temporary password to open your dashboard."
                : initialStep === "ready"
                  ? initialEmail
                  : "Technicians use First.Last | Administrators use email"}
            </p>
          </div>

          {initialError ? (
            <p role="alert" className="rounded-lg bg-red-50 border border-red-200 p-2 text-xs text-red-800 text-center font-medium">
              {initialError}
            </p>
          ) : null}

          {initialStep === "ready" ? (
            <div className="space-y-2 py-2">
              <a
                className="flex h-10 items-center justify-center rounded-xl bg-blue-600 hover:bg-blue-700 font-bold text-white text-sm shadow-md transition-all"
                href="/"
              >
                Open My Dashboard
              </a>

              <a
                className="flex h-9 items-center justify-center rounded-xl border border-slate-200 hover:bg-slate-50 text-slate-700 text-xs font-semibold transition-all"
                href="/login?change=1"
              >
                Change My Password
              </a>
              <form action="/api/auth" method="post" className="w-full pt-1">
                <input type="hidden" name="action" value="logout" />
                <button
                  type="submit"
                  className="flex h-9 w-full items-center justify-center rounded-xl border border-red-200 hover:bg-red-50 text-red-600 text-xs font-semibold transition-all cursor-pointer"
                >
                  <LogOut className="size-3 mr-1" /> Sign Out / Switch Account
                </button>
              </form>


            </div>
          ) : (
            <form className="space-y-2.5" action="/api/auth" method="post">
              <input type="hidden" name="action" value={change ? "password" : "login"} />

              {!change ? (
                <div className="space-y-1">
                  <Label htmlFor="login-username" className="text-xs font-semibold text-slate-700">
                    Username or Email
                  </Label>
                  <Input
                    id="login-username"
                    name="login"
                    type="text"
                    inputMode="text"
                    autoComplete="username"
                    autoCapitalize="none"
                    autoCorrect="off"
                    spellCheck={false}
                    required
                    maxLength={254}
                    placeholder="First.Last or email"
                    value={loginVal}
                    onChange={(e) => setLoginVal(e.target.value)}
                    className="h-9 text-xs bg-slate-50/80 border-slate-200 focus:bg-white focus:border-blue-500 rounded-lg transition-all"
                  />
                </div>
              ) : (
                <input type="hidden" name="email" autoComplete="username" value={initialEmail} />
              )}

              <div className="space-y-1">
                <div className="flex items-center justify-between">
                  <Label htmlFor="login-password" className="text-xs font-semibold text-slate-700">
                    {change ? "New Password" : "Password"}
                  </Label>
                  <button
                    type="button"
                    tabIndex={-1}
                    onClick={() => setVisible(!visible)}
                    className="text-[11px] text-blue-600 hover:text-blue-800 font-medium flex items-center gap-1 cursor-pointer"
                  >
                    {visible ? <><EyeOff className="size-3" /> Hide</> : <><Eye className="size-3" /> Show</>}
                  </button>
                </div>
                <div className="relative">
                  <Input
                    id="login-password"
                    name="password"
                    type={visible ? "text" : "password"}
                    autoComplete={change ? "new-password" : "current-password"}
                    autoCapitalize="none"
                    autoCorrect="off"
                    spellCheck={false}
                    minLength={change ? 6 : 1}
                    maxLength={256}
                    required
                    placeholder={change ? "Enter new password (min. 6 characters)" : "Enter password"}
                    value={passVal}
                    onChange={(e) => setPassVal(e.target.value)}
                    className="h-9 text-xs bg-slate-50/80 border-slate-200 focus:bg-white focus:border-blue-500 rounded-lg pr-9 transition-all"
                  />
                </div>
              </div>

              {change ? (
                <div className="space-y-1">
                  <Label htmlFor="login-confirm" className="text-xs font-semibold text-slate-700">
                    Confirm New Password
                  </Label>
                  <Input
                    id="login-confirm"
                    name="confirmation"
                    type={visible ? "text" : "password"}
                    autoComplete="new-password"
                    minLength={6}
                    maxLength={256}
                    required
                    placeholder="Re-enter new password"
                    className="h-9 text-xs bg-slate-50/80 border-slate-200 rounded-lg"
                  />
                </div>
              ) : null}

              <Button
                type="submit"
                className="h-10 w-full rounded-xl bg-gradient-to-r from-blue-600 to-cyan-600 hover:from-blue-700 hover:to-cyan-700 font-bold text-white text-xs shadow-md shadow-blue-500/20 transition-all cursor-pointer flex items-center justify-center gap-2 mt-1"
              >
                <KeyRound className="size-3.5" />
                {change ? "Save Password & Open My Work" : "Sign In to Dashboard"}
              </Button>

              {change ? (
                <div className="pt-2 text-center">
                  <a href="/" className="text-xs text-slate-500 hover:text-slate-800 hover:underline">
                    ← Cancel & Return to Dashboard
                  </a>
    
                </div>
              ) : null}

              {!change && (
                <div className="rounded-xl border border-blue-100 bg-blue-50/50 p-2.5 text-xs mt-2">
                  <div className="flex items-center justify-between mb-1.5 px-0.5">
                    <span className="font-bold text-blue-950 flex items-center gap-1 text-[11px]">
                      <Sparkles className="size-3 text-blue-600" /> Demo Accounts (1-Click Fill):
                    </span>
                    <span className="text-[10px] text-blue-700/80 font-mono">pwd: &lt;role&gt;1234</span>
                  </div>
                  <div className="grid grid-cols-2 gap-1.5">
                    <button
                      type="button"
                      onClick={() => { setLoginVal("admin@demo.com"); setPassVal("admin1234"); }}
                      className="flex items-center gap-2 p-1.5 rounded-lg bg-white border border-blue-200/70 hover:border-blue-400 hover:bg-blue-50 transition text-left cursor-pointer shadow-2xs group"
                    >
                      <span className="text-sm">👑</span>
                      <div className="min-w-0">
                        <div className="font-bold text-slate-800 text-[11px] leading-tight group-hover:text-blue-700">Super Admin</div>
                        <div className="text-[10px] text-slate-500 truncate leading-none mt-0.5">admin@demo.com</div>
                      </div>
                    </button>

                    <button
                      type="button"
                      onClick={() => { setLoginVal("tech@demo.com"); setPassVal("tech1234"); }}
                      className="flex items-center gap-2 p-1.5 rounded-lg bg-white border border-blue-200/70 hover:border-blue-400 hover:bg-blue-50 transition text-left cursor-pointer shadow-2xs group"
                    >
                      <span className="text-sm">🔧</span>
                      <div className="min-w-0">
                        <div className="font-bold text-slate-800 text-[11px] leading-tight group-hover:text-blue-700">Technician</div>
                        <div className="text-[10px] text-slate-500 truncate leading-none mt-0.5">tech@demo.com</div>
                      </div>
                    </button>

                    <button
                      type="button"
                      onClick={() => { setLoginVal("biomed@demo.com"); setPassVal("biomed1234"); }}
                      className="flex items-center gap-2 p-1.5 rounded-lg bg-white border border-blue-200/70 hover:border-blue-400 hover:bg-blue-50 transition text-left cursor-pointer shadow-2xs group"
                    >
                      <span className="text-sm">🏥</span>
                      <div className="min-w-0">
                        <div className="font-bold text-slate-800 text-[11px] leading-tight group-hover:text-blue-700">Biomedical</div>
                        <div className="text-[10px] text-slate-500 truncate leading-none mt-0.5">biomed@demo.com</div>
                      </div>
                    </button>

                    <button
                      type="button"
                      onClick={() => { setLoginVal("finance@demo.com"); setPassVal("finance1234"); }}
                      className="flex items-center gap-2 p-1.5 rounded-lg bg-white border border-blue-200/70 hover:border-blue-400 hover:bg-blue-50 transition text-left cursor-pointer shadow-2xs group"
                    >
                      <span className="text-sm">💰</span>
                      <div className="min-w-0">
                        <div className="font-bold text-slate-800 text-[11px] leading-tight group-hover:text-blue-700">Finance</div>
                        <div className="text-[10px] text-slate-500 truncate leading-none mt-0.5">finance@demo.com</div>
                      </div>
                    </button>
                  </div>
                </div>
              )}
            </form>
          )}

          {deviceCleanupWarning ? (
            <p role="alert" className="rounded-lg bg-amber-50 p-2 text-[11px] leading-normal text-amber-900 text-center">
              Sign-out completed. Please sign back in.
            </p>
          ) : null}

          <div className="pt-0.5 text-center">
            <p className="text-[10px] text-slate-400">
              Need assistance? Contact{" "}
              <a href="mailto:support@techflexmobility.com" className="text-blue-600 hover:underline font-semibold">
                TechFlex Support
              </a>

            </p>
          </div>
        </div>
      </section>
    </main>
  );
}

export function PortalLoginControls({ passwordLogin }: { passwordLogin: boolean }) {
  const client = useQueryClient();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [openModal, setOpenModal] = useState(false);
  const [newPass, setNewPass] = useState("");
  const [confirmPass, setConfirmPass] = useState("");
  const [showPass, setShowPass] = useState(false);
  const [modalBusy, setModalBusy] = useState(false);
  const [modalError, setModalError] = useState("");
  const [modalSuccess, setModalSuccess] = useState(false);

  async function handlePasswordChange(e: React.FormEvent) {
    e.preventDefault();
    setModalError("");
    if (newPass.length < 6) {
      setModalError("Password must be at least 6 characters.");
      return;
    }
    if (newPass !== confirmPass) {
      setModalError("Passwords do not match. Enter the same password twice.");
      return;
    }
    setModalBusy(true);
    try {
      const res = await fetch("/api/auth", {
        method: "POST",
        credentials: "same-origin",
        cache: "no-store",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({ action: "password", password: newPass }),
      });
      const data = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string };
      if (!res.ok || data.ok !== true) {
        throw new Error(data.error || "Password update failed. Please try again.");
      }
      setModalSuccess(true);
      setTimeout(() => {
        setOpenModal(false);
        setModalSuccess(false);
        setNewPass("");
        setConfirmPass("");
      }, 1500);
    } catch (err: unknown) {
      setModalError(err instanceof Error ? err.message : "Failed to update password.");
    } finally {
      setModalBusy(false);
    }
  }

  return (
    <>
      <div className="flex min-h-8 items-center justify-end gap-3 border-b border-slate-200/60 bg-white/90 px-3 sm:px-4 xl:px-6 py-0.5 text-xs text-slate-600 lg:pl-[210px] xl:pl-[235px] 2xl:pl-[258px]">
        {passwordLogin ? (
          <button
            type="button"
            onClick={() => {
              setModalError("");
              setModalSuccess(false);
              setNewPass("");
              setConfirmPass("");
              setOpenModal(true);
            }}
            className="inline-flex h-7 items-center font-medium text-blue-700 hover:underline cursor-pointer"
          >
            Change password
          </button>
        ) : null}
        <Button
          variant="ghost"
          size="sm"
          className="h-7 px-2 text-xs text-slate-600 hover:text-slate-900"
          disabled={busy}
          onClick={async () => {
            setBusy(true);
            setError("");
            let departingUserId = client.getQueryData<{ userId?: string }>(["portal-identity"])?.userId || "";
            if (!departingUserId) {
              try {
                const response = await portalFetch("/api/me");
                departingUserId =
                  (await portalJson<{ identity?: { userId?: string } }>(response, "Your identity could not be confirmed for safe sign-out.")).identity?.userId || "";
              } catch {
                setError("Your identity could not be confirmed for safe sign-out. Keep this page open and try again.");
                setBusy(false);
                return;
              }
            }
            try {
              await authAction({ action: "logout" });
            } catch {
              setError("Sign-out was not confirmed. Try again.");
              setBusy(false);
              return;
            }
            let deviceCleanupFailed = false;
            try {
              await clearIdentityBoundDeviceState(departingUserId);
            } catch {
              deviceCleanupFailed = true;
            }
            clearIdentityBoundClientState(client);
            window.dispatchEvent(new Event("techcommand:session-required"));
            window.location.assign(deviceCleanupFailed ? "/login?device_cleanup=check" : "/login");
          }}
        >
          <LogOut />
          {busy ? "Signing out…" : "Sign out"}
        </Button>
        {error ? <p role="alert" className="text-red-700">{error}</p> : null}
      </div>

      <Dialog open={openModal} onOpenChange={setOpenModal}>
        <DialogContent className="sm:max-w-md bg-white p-6 rounded-2xl shadow-2xl border border-slate-200">
          <DialogHeader>
            <DialogTitle className="text-base font-bold text-slate-900 flex items-center gap-2">
              <KeyRound className="size-4 text-blue-600" />
              Change Password
            </DialogTitle>
            <DialogDescription className="text-xs text-slate-500">
              Enter and confirm your new password below.
            </DialogDescription>
          </DialogHeader>

          {modalSuccess ? (
            <div className="rounded-xl bg-emerald-50 border border-emerald-200 p-4 text-center space-y-1 my-2">
              <div className="text-emerald-700 font-bold text-sm flex items-center justify-center gap-1.5">
                <CheckCircle2 className="size-4" /> Password Updated!
              </div>
              <p className="text-xs text-emerald-600">Your new password has been saved successfully.</p>
            </div>
          ) : (
            <form onSubmit={handlePasswordChange} className="space-y-4 pt-1">
              {modalError ? (
                <div className="rounded-lg bg-red-50 border border-red-200 p-2.5 text-xs text-red-700 font-medium">
                  {modalError}
                </div>
              ) : null}

              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <Label htmlFor="modal-new-pass" className="text-xs font-semibold text-slate-700">
                    New Password
                  </Label>
                  <button
                    type="button"
                    onClick={() => setShowPass(!showPass)}
                    className="text-[11px] text-blue-600 hover:text-blue-800 font-medium flex items-center gap-1 cursor-pointer"
                  >
                    {showPass ? <><EyeOff className="size-3" /> Hide</> : <><Eye className="size-3" /> Show</>}
                  </button>
                </div>
                <Input
                  id="modal-new-pass"
                  type={showPass ? "text" : "password"}
                  value={newPass}
                  onChange={(e) => setNewPass(e.target.value)}
                  placeholder="Enter new password (min. 6 characters)"
                  minLength={6}
                  maxLength={256}
                  required
                  className="h-9 text-xs"
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="modal-confirm-pass" className="text-xs font-semibold text-slate-700">
                  Confirm New Password
                </Label>
                <Input
                  id="modal-confirm-pass"
                  type={showPass ? "text" : "password"}
                  value={confirmPass}
                  onChange={(e) => setConfirmPass(e.target.value)}
                  placeholder="Re-enter new password"
                  minLength={6}
                  maxLength={256}
                  required
                  className="h-9 text-xs"
                />
              </div>

              <DialogFooter className="flex items-center justify-end gap-2 pt-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="text-xs h-8 cursor-pointer"
                  onClick={() => setOpenModal(false)}
                  disabled={modalBusy}
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  size="sm"
                  className="text-xs h-8 bg-blue-600 hover:bg-blue-700 text-white font-medium cursor-pointer"
                  disabled={modalBusy}
                >
                  {modalBusy ? "Updating…" : "Update Password"}
                </Button>
              </DialogFooter>
            </form>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
