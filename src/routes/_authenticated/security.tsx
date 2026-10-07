import { useEffect, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";

import { supabase } from "@/integrations/supabase/client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { RecoveryCodes } from "@/components/security-gate";
import { PrivacyRequestsCard } from "@/components/privacy-requests-card";
import { generateRecoveryCodes, getMySecurity, signOutOtherSessions } from "@/lib/account-security.functions";

export const Route = createFileRoute("/_authenticated/security")({
  head: () => ({
    meta: [
      { title: "Account security - Harmonious" },
      { name: "description", content: "Manage passkeys, authenticator apps, recovery codes, devices and sign-in history." },
      { property: "og:title", content: "Account security - Harmonious" },
      { property: "og:description", content: "Passkeys, two-step sign-in, devices and sign-in history." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: SecurityPage,
});

const fmt = (iso: string) => new Date(iso).toLocaleString();
const browser = (ua?: string | null) => {
  if (!ua) return "Unknown device";
  const b = /Edg\//.test(ua) ? "Edge" : /Chrome\//.test(ua) ? "Chrome" : /Safari\//.test(ua) ? "Safari" : /Firefox\//.test(ua) ? "Firefox" : "Browser";
  const os = /iPhone|iPad/.test(ua) ? "iOS" : /Android/.test(ua) ? "Android" : /Mac OS/.test(ua) ? "macOS" : /Windows/.test(ua) ? "Windows" : /Linux/.test(ua) ? "Linux" : "";
  return `${b}${os ? ` on ${os}` : ""}`;
};
const EVENT_LABELS: Record<string, string> = {
  sign_in: "Signed in",
  sign_out: "Signed out",
  sensitive_action: "Sensitive page",
  mfa_verified: "Second step passed",
  mfa_failed: "Second step failed",
  mfa_enrolled: "Method added",
  mfa_removed: "Method removed",
  recovery_code_used: "Recovery code used",
  session_timeout: "Timed out",
};

function SecurityPage() {
  const qc = useQueryClient();
  const fetchSec = useServerFn(getMySecurity);
  const signOutOthers = useServerFn(signOutOtherSessions);
  const genCodes = useServerFn(generateRecoveryCodes);
  const { data } = useQuery({ queryKey: ["my-security"], queryFn: () => fetchSec() });
  const [factors, setFactors] = useState<any[]>([]);
  const [codes, setCodes] = useState<string[] | null>(null);
  const [totp, setTotp] = useState<{ id: string; qr: string; secret: string } | null>(null);
  const [code, setCode] = useState("");

  const loadFactors = () =>
    supabase.auth.mfa.listFactors().then(({ data }) => setFactors(((data?.all ?? []) as any[]).filter((f) => f.status === "verified")));
  useEffect(() => {
    void loadFactors();
  }, []);

  async function addPasskey() {
    const { error } = await supabase.auth.mfa.webauthn.register({ friendlyName: `Passkey ${new Date().toLocaleDateString()}` });
    if (error) { toast.error("Passkey setup didn't finish."); return; }
    toast.success("Passkey added");
    void loadFactors();
  }
  async function startTotp() {
    const { data, error } = await supabase.auth.mfa.enroll({ factorType: "totp", issuer: "Harmonious", friendlyName: `Authenticator ${Date.now()}` });
    if (error || !data) { toast.error("Couldn't start authenticator setup."); return; }
    setTotp({ id: data.id, qr: data.totp.qr_code, secret: data.totp.secret });
  }
  async function confirmTotp() {
    if (!totp) return;
    const { error } = await supabase.auth.mfa.challengeAndVerify({ factorId: totp.id, code: code.trim() });
    if (error) { toast.error("That code didn't match."); return; }
    setTotp(null);
    setCode("");
    toast.success("Authenticator added");
    void loadFactors();
  }
  async function remove(id: string) {
    if (factors.length <= 1) { toast.error("Keep at least one method - two-step sign-in is required."); return; }
    const { error } = await supabase.auth.mfa.unenroll({ factorId: id });
    if (error) { toast.error(error.message); return; }
    toast.success("Method removed");
    void loadFactors();
  }

  if (codes) return <div className="mx-auto max-w-md p-6"><RecoveryCodes codes={codes} onDone={() => { setCodes(null); void qc.invalidateQueries({ queryKey: ["my-security"] }); }} /></div>;

  return (
    <div className="mx-auto max-w-4xl space-y-6 p-6">
      <h1 className="font-heading text-2xl">Account security</h1>

      <Card>
        <CardHeader>
          <CardTitle className="font-heading text-lg">Two-step sign-in</CardTitle>
          <CardDescription>Required for every account. Adding a second method helps if you lose a device.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {factors.map((f) => (
            <div key={f.id} className="flex items-center justify-between rounded-md border p-3">
              <div>
                <p className="text-sm font-medium">{f.factor_type === "webauthn" ? "Passkey" : "Authenticator app"}</p>
                <p className="text-xs text-muted-foreground">{f.friendly_name} · added {fmt(f.created_at)}</p>
              </div>
              <Button variant="outline" size="sm" onClick={() => remove(f.id)}>Remove</Button>
            </div>
          ))}
          {totp ? (
            <div className="space-y-2 rounded-md border p-3">
              <img src={totp.qr} alt="Authenticator QR code" className="h-40 w-40 bg-card" />
              <p className="break-all text-xs text-muted-foreground">{totp.secret}</p>
              <Input inputMode="numeric" placeholder="6-digit code" value={code} onChange={(e) => setCode(e.target.value)} />
              <Button size="sm" onClick={confirmTotp}>Confirm</Button>
            </div>
          ) : (
            <div className="flex flex-wrap gap-2">
              {typeof window !== "undefined" && window.PublicKeyCredential && <Button size="sm" onClick={addPasskey}>Add passkey</Button>}
              <Button size="sm" variant="outline" onClick={startTotp}>Add authenticator app</Button>
            </div>
          )}
          <div className="flex items-center justify-between border-t pt-3">
            <p className="text-sm">Recovery codes left: <strong>{data?.recoveryCodesLeft ?? "…"}</strong></p>
            <Button size="sm" variant="outline" onClick={async () => { try { setCodes((await genCodes()).codes); } catch (e) { toast.error((e as Error).message); } }}>
              New recovery codes
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <CardTitle className="font-heading text-lg">Devices</CardTitle>
            <CardDescription>Where your account has signed in.</CardDescription>
          </div>
          <Button size="sm" variant="outline" onClick={async () => { await signOutOthers(); toast.success("Other sessions signed out"); void qc.invalidateQueries({ queryKey: ["my-security"] }); }}>
            Sign out everywhere else
          </Button>
        </CardHeader>
        <CardContent className="space-y-2">
          {(data?.devices ?? []).map((d) => (
            <div key={d.id} className="flex items-center justify-between rounded-md border p-3 text-sm">
              <div>
                <p className="font-medium">{browser(d.user_agent)}</p>
                <p className="text-xs text-muted-foreground">
                  {[d.last_city, d.last_region, d.country].filter(Boolean).join(", ") || "Unknown location"} · last active {fmt(d.last_seen)}
                </p>
              </div>
              {d.revoked_at && <Badge variant="outline">Signed out</Badge>}
            </div>
          ))}
          {data && data.devices.length === 0 && <p className="text-sm text-muted-foreground">No devices recorded yet.</p>}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="font-heading text-lg">Recent security activity</CardTitle>
        </CardHeader>
        <CardContent className="space-y-1">
          {(data?.events ?? []).map((e) => (
            <div key={e.id} className="flex flex-wrap justify-between gap-2 border-b py-2 text-sm last:border-0">
              <span>{EVENT_LABELS[e.event_type] ?? e.event_type}{e.action ? ` - ${e.action}` : ""}</span>
              <span className="text-xs text-muted-foreground">
                {[e.city, e.country].filter(Boolean).join(", ") || "-"} · {e.ip ?? "-"} · {fmt(e.created_at)}
              </span>
            </div>
          ))}
        </CardContent>
      </Card>
      <PrivacyRequestsCard />
    </div>
  );
}
