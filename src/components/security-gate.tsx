import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { useRouterState } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";

import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { generateRecoveryCodes, logSecurityEvent, useRecoveryCode } from "@/lib/account-security.functions";

const IDLE_MS = 30 * 60_000;
const WARN_MS = 2 * 60_000;
const SENSITIVE = /(bank|wire|sign|tax|access|payment|distribution|approv|document|download|kyc|identity)/i;

function deviceId() {
  try {
    let id = localStorage.getItem("hm-device-id");
    if (!id) {
      id = crypto.randomUUID();
      localStorage.setItem("hm-device-id", id);
    }
    return id;
  } catch {
    return undefined;
  }
}

type Gps = { lat?: number; lng?: number; accuracy?: number; gpsDeclined?: boolean };
let gpsCache: Gps | null = null;
function getGps(): Promise<Gps> {
  if (gpsCache) return Promise.resolve(gpsCache);
  return new Promise((resolve) => {
    if (!("geolocation" in navigator)) return resolve((gpsCache = { gpsDeclined: true }));
    navigator.geolocation.getCurrentPosition(
      (p) =>
        resolve(
          (gpsCache = { lat: p.coords.latitude, lng: p.coords.longitude, accuracy: p.coords.accuracy }),
        ),
      () => resolve((gpsCache = { gpsDeclined: true })),
      { enableHighAccuracy: true, timeout: 10_000, maximumAge: 5 * 60_000 },
    );
  });
}

type Stage = "loading" | "setup" | "verify" | "codes" | "ok";

export function SecurityGate({ children, onSignOut }: { children: ReactNode; onSignOut: () => void }) {
  const [stage, setStage] = useState<Stage>("loading");
  const [codes, setCodes] = useState<string[]>([]);
  const log = useServerFn(logSecurityEvent);

  const check = useCallback(async () => {
    const { data } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
    if (!data) return setStage("setup");
    if (data.currentLevel === "aal2") return setStage((s) => (s === "codes" ? s : "ok"));
    setStage(data.nextLevel === "aal2" ? "verify" : "setup");
  }, []);

  useEffect(() => {
    void check();
  }, [check]);

  const send = useCallback(
    async (eventType: string, extra: Record<string, unknown> = {}) => {
      try {
        const gps = await getGps();
        const res = await log({
          data: { eventType, deviceId: deviceId(), path: window.location.pathname, ...gps, ...extra } as never,
        });
        if (res?.signOut) {
          toast.error("This session was signed out for security.");
          onSignOut();
        }
      } catch {
        /* logging never blocks the user */
      }
    },
    [log, onSignOut],
  );

  // Sign-in event once per browser session after the second step passes.
  useEffect(() => {
    if (stage !== "ok") return;
    if (sessionStorage.getItem("hm-signin-logged")) return;
    sessionStorage.setItem("hm-signin-logged", "1");
    void send("sign_in");
  }, [stage, send]);

  if (stage === "loading")
    return <div className="flex min-h-screen items-center justify-center text-muted-foreground">Checking security…</div>;
  if (stage === "setup")
    return (
      <Shell onSignOut={onSignOut}>
        <MfaSetup
          onDone={async () => {
            await supabase.auth.refreshSession();
            void send("mfa_enrolled");
            try {
              const r = await generateRecoveryCodes();
              setCodes(r.codes);
              setStage("codes");
            } catch {
              setStage("ok");
            }
          }}
        />
      </Shell>
    );
  if (stage === "verify")
    return (
      <Shell onSignOut={onSignOut}>
        <MfaVerify
          onDone={async () => {
            await supabase.auth.refreshSession();
            void send("mfa_verified");
            setStage("ok");
          }}
          onFail={() => void send("mfa_failed")}
          onRecovered={async () => {
            await supabase.auth.refreshSession();
            setStage("setup");
          }}
        />
      </Shell>
    );
  if (stage === "codes")
    return (
      <Shell onSignOut={onSignOut}>
        <RecoveryCodes codes={codes} onDone={() => setStage("ok")} />
      </Shell>
    );
  return (
    <>
      <ActivityTracker send={send} onSignOut={onSignOut} />
      {children}
    </>
  );
}

function Shell({ children, onSignOut }: { children: ReactNode; onSignOut: () => void }) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-4">
      <div className="w-full max-w-md space-y-4">
        {children}
        <Button variant="ghost" className="w-full" onClick={onSignOut}>
          Sign out
        </Button>
      </div>
    </div>
  );
}

const passkeysSupported = () => typeof window !== "undefined" && !!window.PublicKeyCredential;

function MfaSetup({ onDone }: { onDone: () => void }) {
  const [totp, setTotp] = useState<{ id: string; qr: string; secret: string } | null>(null);
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);

  async function addPasskey() {
    setBusy(true);
    const { error } = await supabase.auth.mfa.webauthn.register({ friendlyName: `Passkey ${new Date().toLocaleDateString()}` });
    setBusy(false);
    if (error) { toast.error("Passkey setup didn't finish. Try again or use an authenticator app."); return; }
    onDone();
  }

  async function startTotp() {
    setBusy(true);
    const { data, error } = await supabase.auth.mfa.enroll({ factorType: "totp", friendlyName: `Authenticator ${Date.now()}` });
    setBusy(false);
    if (error || !data) { toast.error("Couldn't start authenticator setup."); return; }
    setTotp({ id: data.id, qr: data.totp.qr_code, secret: data.totp.secret });
  }

  async function confirmTotp() {
    if (!totp) return;
    setBusy(true);
    const { error } = await supabase.auth.mfa.challengeAndVerify({ factorId: totp.id, code: code.trim() });
    setBusy(false);
    if (error) { toast.error("That code didn't match. Check the app and try again."); return; }
    onDone();
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="font-heading">Protect your account</CardTitle>
        <CardDescription>
          Harmonious requires a second step at every sign-in. Choose a passkey or an authenticator app.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {!totp && (
          <>
            {passkeysSupported() && (
              <Button className="w-full" disabled={busy} onClick={addPasskey}>
                Use a passkey (Face ID, Touch ID, Windows Hello)
              </Button>
            )}
            <Button variant="outline" className="w-full" disabled={busy} onClick={startTotp}>
              Use an authenticator app
            </Button>
          </>
        )}
        {totp && (
          <div className="space-y-3">
            <p className="text-sm">Scan this code with Google Authenticator, 1Password, Authy or similar.</p>
            <img src={totp.qr} alt="Authenticator QR code" className="mx-auto h-48 w-48 bg-card" />
            <p className="break-all text-center text-xs text-muted-foreground">Or enter: {totp.secret}</p>
            <Input
              inputMode="numeric"
              autoComplete="one-time-code"
              placeholder="6-digit code"
              value={code}
              onChange={(e) => setCode(e.target.value)}
            />
            <Button className="w-full" disabled={busy || code.trim().length < 6} onClick={confirmTotp}>
              Confirm
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function MfaVerify({
  onDone,
  onFail,
  onRecovered,
}: {
  onDone: () => void;
  onFail: () => void;
  onRecovered: () => void;
}) {
  const [factors, setFactors] = useState<{ id: string; factor_type: string; friendly_name?: string | null }[]>([]);
  const [code, setCode] = useState("");
  const [recovery, setRecovery] = useState("");
  const [showRecovery, setShowRecovery] = useState(false);
  const [busy, setBusy] = useState(false);
  const useCode = useServerFn(useRecoveryCode);

  useEffect(() => {
    void supabase.auth.mfa.listFactors().then(({ data }) => {
      setFactors(((data?.all ?? []) as any[]).filter((f) => f.status === "verified"));
    });
  }, []);

  const passkey = factors.find((f) => f.factor_type === "webauthn");
  const totp = factors.find((f) => f.factor_type === "totp");

  async function viaPasskey() {
    if (!passkey) return;
    setBusy(true);
    const { error } = await supabase.auth.mfa.webauthn.authenticate({ factorId: passkey.id });
    setBusy(false);
    if (error) {
      onFail();
      { toast.error("Passkey check didn't finish."); return; }
    }
    onDone();
  }

  async function viaTotp() {
    if (!totp) return;
    setBusy(true);
    const { error } = await supabase.auth.mfa.challengeAndVerify({ factorId: totp.id, code: code.trim() });
    setBusy(false);
    if (error) {
      onFail();
      { toast.error("That code didn't match."); return; }
    }
    onDone();
  }

  async function viaRecovery() {
    setBusy(true);
    const r = await useCode({ data: { code: recovery } }).catch(() => ({ ok: false }));
    setBusy(false);
    if (!r.ok) { toast.error("That recovery code isn't valid."); return; }
    toast.success("Recovery code accepted. Set up a new second step now.");
    onRecovered();
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="font-heading">Confirm it's you</CardTitle>
        <CardDescription>Complete your second sign-in step to continue.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {passkey && passkeysSupported() && (
          <Button className="w-full" disabled={busy} onClick={viaPasskey}>
            Use passkey
          </Button>
        )}
        {totp && (
          <div className="space-y-2">
            <Input
              inputMode="numeric"
              autoComplete="one-time-code"
              placeholder="6-digit code from your app"
              value={code}
              onChange={(e) => setCode(e.target.value)}
            />
            <Button variant={passkey ? "outline" : "default"} className="w-full" disabled={busy || code.trim().length < 6} onClick={viaTotp}>
              Verify code
            </Button>
          </div>
        )}
        {!showRecovery ? (
          <Button variant="link" className="w-full" onClick={() => setShowRecovery(true)}>
            Lost access? Use a recovery code
          </Button>
        ) : (
          <div className="space-y-2">
            <Input placeholder="XXXXX-XXXXX" value={recovery} onChange={(e) => setRecovery(e.target.value)} />
            <Button variant="outline" className="w-full" disabled={busy || recovery.length < 6} onClick={viaRecovery}>
              Use recovery code
            </Button>
            <p className="text-xs text-muted-foreground">
              No codes? Contact Harmonious; two staff members must confirm your identity before resetting.
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export function RecoveryCodes({ codes, onDone }: { codes: string[]; onDone: () => void }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="font-heading">Save your recovery codes</CardTitle>
        <CardDescription>
          Each code works once if you lose your passkey or phone. They won't be shown again - store them somewhere safe.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-2 gap-2 rounded-md border bg-muted p-3 font-mono text-sm">
          {codes.map((c) => (
            <span key={c}>{c}</span>
          ))}
        </div>
        <Button className="w-full" onClick={onDone}>
          I've saved them
        </Button>
      </CardContent>
    </Card>
  );
}

/** Logs page views (sensitive pages flagged), runs the inactivity timeout and revocation heartbeat. */
function ActivityTracker({
  send,
  onSignOut,
}: {
  send: (t: any, extra?: Record<string, unknown>) => Promise<void>;
  onSignOut: () => void;
}) {
  const pathname = useRouterState({ select: (r) => r.location.pathname });
  const [warn, setWarn] = useState(false);
  const last = useRef(Date.now());

  useEffect(() => {
    void send(SENSITIVE.test(pathname) ? "sensitive_action" : "page_view", { path: pathname, action: SENSITIVE.test(pathname) ? `viewed ${pathname}` : undefined });
  }, [pathname, send]);

  useEffect(() => {
    const bump = () => {
      last.current = Date.now();
      setWarn(false);
    };
    const evs = ["mousemove", "keydown", "click", "scroll", "touchstart"] as const;
    evs.forEach((e) => window.addEventListener(e, bump, { passive: true }));
    const tick = window.setInterval(() => {
      const idle = Date.now() - last.current;
      if (idle >= IDLE_MS) {
        void send("session_timeout").finally(onSignOut);
      } else if (idle >= IDLE_MS - WARN_MS) setWarn(true);
    }, 15_000);
    const hb = window.setInterval(() => void send("heartbeat"), 5 * 60_000);
    return () => {
      evs.forEach((e) => window.removeEventListener(e, bump));
      window.clearInterval(tick);
      window.clearInterval(hb);
    };
  }, [send, onSignOut]);

  if (!warn) return null;
  return (
    <div className="fixed inset-x-0 bottom-4 z-[2147483645] mx-auto w-fit rounded-md border bg-card p-4 shadow-lg">
      <p className="mb-2 text-sm">You'll be signed out in about 2 minutes for inactivity.</p>
      <Button
        size="sm"
        onClick={() => {
          last.current = Date.now();
          setWarn(false);
        }}
      >
        Stay signed in
      </Button>
    </div>
  );
}
