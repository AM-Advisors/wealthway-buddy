import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { getClientServiceSetup, saveClientServiceConfig } from "@/lib/client-service-config.functions";
import {
  CAP_TIERS, CLIENT_SERVICE_STATUS_LABEL, PACKAGES, includedComponents, priceConfig, serviceLabel, summarize, validateConfig,
  type ClientServiceConfig,
} from "@/lib/service-packages";

const money = (c: number) => `$${(c / 100).toLocaleString("en-US", { maximumFractionDigits: 0 })}`;

function Included({ pkg }: { pkg: string }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="text-xs">
      <button type="button" className="text-primary underline" onClick={() => setOpen(!open)}>{open ? "Hide what's included" : "View what's included"}</button>
      {open && <ul className="mt-1 grid list-disc gap-0.5 pl-5 text-muted-foreground sm:grid-cols-2">{PACKAGES[pkg]!.includedText.map((t) => <li key={t}>{t} — Included</li>)}</ul>}
    </div>
  );
}

/** Client-level Expected Services. Intent only — not a Fund SOW and never a blocker. */
export function ExpectedServicesEditor({ clientId, onSaved }: { clientId: string; onSaved?: () => void }) {
  const load = useServerFn(getClientServiceSetup);
  const save = useServerFn(saveClientServiceConfig);
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ["client-service-setup", clientId], queryFn: () => load({ data: { clientId } }) });
  const [c, setC] = useState<ClientServiceConfig>({ alaCarte: [] });
  const [raise, setRaise] = useState("");
  const [addKey, setAddKey] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const d = q.data;
    if (!d) return;
    const start = d.current?.config ?? d.proposal?.config ?? { alaCarte: [] };
    setC({ alaCarte: [], ...start });
    setRaise(start.spv?.expectedRaiseCents ? String(start.spv.expectedRaiseCents / 100) : "");
  }, [q.data]);

  const names = useMemo(() => Object.fromEntries((q.data?.catalog ?? []).map((s) => [s.key, s.name])), [q.data]);
  const lines = useMemo(() => priceConfig(c, q.data?.rate ?? [], names), [c, q.data, names]);
  const errors = validateConfig(c);
  const included = includedComponents(c);
  const review = q.data?.current?.mappingReview ?? q.data?.proposal?.review ?? [];

  if (q.isLoading) return <p className="text-sm text-muted-foreground">Loading services…</p>;
  if (q.error) return <p className="text-sm text-muted-foreground">{(q.error as Error).message}</p>;
  const d = q.data!;
  const up = (patch: Partial<ClientServiceConfig>) => setC((p) => ({ ...p, ...patch }));

  return (
    <div className="space-y-5">
      {d.status !== "configured" && d.status !== "none" && (
        <div className="rounded-md border border-dashed p-3 text-sm">
          <Badge variant="outline">{CLIENT_SERVICE_STATUS_LABEL[d.status]}</Badge>
          <p className="mt-1 text-xs text-muted-foreground">
            Older service choices are kept as they were. We've pre-filled what maps cleanly; please check the rest. This never blocks the client, its funds or investors.
          </p>
          {review.length > 0 && <p className="mt-1 text-xs">Needs a decision: {review.map((k) => k === "investor_onboarding_billing" ? "Investor Onboarding billing method" : serviceLabel(k, names[k] ?? k)).join(", ")}</p>}
        </div>
      )}

      <section className="space-y-2">
        <h3 className="font-medium">SPV</h3>
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={!!c.spv} onChange={(e) => up({ spv: e.target.checked ? { structure: "standard" } : null })} />This client does SPVs</label>
        {c.spv && (
          <div className="space-y-2 rounded-md border p-3">
            {(["standard", "series"] as const).map((s) => (
              <div key={s}>
                <label className="flex items-center gap-2 text-sm"><input type="radio" checked={c.spv!.structure === s} onChange={() => up({ spv: { ...c.spv!, structure: s } })} />{PACKAGES[s === "series" ? "spv_series" : "spv_standard"]!.label} <span className="text-xs text-muted-foreground">— raise-based pricing</span></label>
                <div className="pl-6"><Included pkg={s === "series" ? "spv_series" : "spv_standard"} /></div>
              </div>
            ))}
            {c.spv.structure === "series" && (
              <div className="space-y-1"><Label className="text-xs">Harmonious-owned Master</Label>
                <select className="h-9 w-full rounded-md border bg-background px-2 text-sm" value={c.spv.masterId ?? ""} onChange={(e) => up({ spv: { ...c.spv!, masterId: e.target.value || null } })}>
                  <option value="">Choose later</option>
                  {d.masters.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
                </select></div>
            )}
            <div className="grid gap-2 sm:grid-cols-2">
              <div className="space-y-1"><Label className="text-xs">Expected raise (optional, sets the rate-card tier)</Label>
                <Input inputMode="numeric" value={raise} placeholder="e.g. 500000" onChange={(e) => { setRaise(e.target.value); const n = Number(e.target.value.replace(/[$,]/g, "")); up({ spv: { ...c.spv!, expectedRaiseCents: n > 0 ? Math.round(n * 100) : null } }); }} /></div>
              <div className="space-y-1"><Label className="text-xs">Formation state (optional)</Label>
                <Input value={c.spv.formationState ?? ""} placeholder="e.g. Delaware, Texas" onChange={(e) => up({ spv: { ...c.spv!, formationState: e.target.value || null } })} /></div>
            </div>
            <p className="text-xs text-muted-foreground">Investor Onboarding — Included with SPV.</p>
          </div>
        )}
      </section>

      <section className="space-y-2">
        <h3 className="font-medium">Fund</h3>
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={!!c.fund?.management} onChange={(e) => up({ fund: e.target.checked ? { management: true } : null })} />Fund Management — $2,500/year</label>
        {c.fund?.management && (
          <div className="space-y-2 pl-6">
            <Included pkg="fund_management" />
            <div className="max-w-xs space-y-1"><Label className="text-xs">State Formation — state (optional)</Label>
              <Input value={c.fund.formationState ?? ""} placeholder="e.g. Delaware, Wyoming" onChange={(e) => up({ fund: { ...c.fund!, formationState: e.target.value || null } })} /></div>
          </div>
        )}
      </section>

      <section className="space-y-2">
        <h3 className="font-medium">Cap Table Management</h3>
        <select className="h-9 w-full max-w-xs rounded-md border bg-background px-2 text-sm" value={c.capTable?.tier ?? ""} onChange={(e) => up({ capTable: e.target.value ? { tier: e.target.value as any } : null })}>
          <option value="">Not needed</option>
          {CAP_TIERS.map((t) => <option key={t} value={t}>{t[0]!.toUpperCase() + t.slice(1)}</option>)}
        </select>
        <p className="text-xs text-muted-foreground">One tier per client. Cap Table stays with the client, not a fund.</p>
      </section>

      <section className="space-y-2">
        <h3 className="font-medium">Additional services</h3>
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={!!c.investorOnboarding} onChange={(e) => up({ investorOnboarding: e.target.checked ? { billing: null } : null })} />Investor Onboarding</label>
        {c.investorOnboarding && (
          <div className="space-y-1 pl-6 text-sm">
            {c.spv ? <p className="text-xs text-muted-foreground">Included with SPV — no extra charge.</p> : (
              <div className="flex gap-4">
                <label className="flex items-center gap-1"><input type="radio" checked={c.investorOnboarding.billing === "annual"} onChange={() => up({ investorOnboarding: { billing: "annual" } })} />Annual — $2,500/year</label>
                <label className="flex items-center gap-1"><input type="radio" checked={c.investorOnboarding.billing === "per_investor"} onChange={() => up({ investorOnboarding: { billing: "per_investor" } })} />Per investor — $50</label>
              </div>
            )}
            <Included pkg="investor_onboarding" />
          </div>
        )}
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <label className="flex items-center gap-2"><input type="checkbox" checked={!!c.taxes} onChange={(e) => up({ taxes: e.target.checked ? { sets: 1 } : null })} />Taxes — $2,500 per set</label>
          {c.taxes && <><span className="text-xs">Number of sets</span><Input className="h-8 w-20" type="number" min={1} value={c.taxes.sets} onChange={(e) => up({ taxes: { sets: Math.max(1, Math.floor(Number(e.target.value) || 1)) } })} /></>}
        </div>
        {c.taxes && <div className="pl-6"><Included pkg="taxes" /></div>}
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <label className="flex items-center gap-2"><input type="checkbox" checked={!!c.financialReporting} onChange={(e) => up({ financialReporting: e.target.checked ? { reports: 1 } : null })} />Financial Reporting — $2,500 per report</label>
          {c.financialReporting && <><span className="text-xs">Number of reports</span><Input className="h-8 w-20" type="number" min={1} value={c.financialReporting.reports} onChange={(e) => up({ financialReporting: { reports: Math.max(1, Math.floor(Number(e.target.value) || 1)) } })} /></>}
        </div>
        {c.financialReporting && <div className="pl-6"><Included pkg="financial_reporting" /></div>}

        <div className="space-y-2 rounded-md border p-3">
          <p className="text-sm font-medium">À la carte</p>
          {(c.alaCarte ?? []).map((a, i) => (
            <div key={a.serviceKey} className="flex flex-wrap items-center gap-2 text-sm">
              <span className="min-w-0 flex-1">{serviceLabel(a.serviceKey, names[a.serviceKey] ?? a.serviceKey)}</span>
              {included.has(a.serviceKey) && !["additional_asset", "additional_close", "capital_account_statements"].includes(a.serviceKey) ? <Badge variant="secondary">Included</Badge> : (
                <><span className="text-xs">Qty</span><Input className="h-8 w-20" type="number" min={1} value={a.quantity} onChange={(e) => up({ alaCarte: c.alaCarte!.map((x, j) => j === i ? { ...x, quantity: Math.max(1, Math.floor(Number(e.target.value) || 1)) } : x) })} /></>
              )}
              <button type="button" className="text-xs text-muted-foreground underline" onClick={() => up({ alaCarte: c.alaCarte!.filter((_, j) => j !== i) })}>Remove</button>
            </div>
          ))}
          <div className="flex gap-2">
            <select className="h-9 flex-1 rounded-md border bg-background px-2 text-sm" value={addKey} onChange={(e) => setAddKey(e.target.value)}>
              <option value="">+ Add à la carte service</option>
              {d.catalog.filter((s) => !s.key.startsWith("cap_table_") && !(c.alaCarte ?? []).some((a) => a.serviceKey === s.key)).map((s) => (
                <option key={s.key} value={s.key}>{serviceLabel(s.key, s.name)}{included.has(s.key) ? " (included)" : ""}</option>
              ))}
            </select>
            <Button type="button" size="sm" variant="outline" disabled={!addKey} onClick={() => { up({ alaCarte: [...(c.alaCarte ?? []), { serviceKey: addKey, quantity: 1 }] }); setAddKey(""); }}>Add</Button>
          </div>
        </div>
      </section>

      <section className="rounded-md bg-muted/50 p-3 text-sm">
        <p className="font-medium">Expected Services summary</p>
        {lines.length === 0 ? <p className="text-xs text-muted-foreground">Nothing selected yet — that's fine, the client can still be created.</p> : (
          <ul className="mt-1 space-y-0.5">{summarize(lines).map((s) => <li key={s}>{s}</li>)}</ul>
        )}
        {lines.some((l) => l.status === "priced") && <p className="mt-1 text-xs text-muted-foreground">Priced items total {money(lines.reduce((t, l) => t + (l.totalCents ?? 0), 0))} before raise-based and per-investor charges.</p>}
        <p className="mt-1 text-xs text-muted-foreground">This is the client's expected services, not a Fund SOW. Each new fund records its own Services & Pricing.</p>
      </section>

      {errors.length > 0 && <p className="text-sm text-destructive">{errors[0]}</p>}
      <Button disabled={busy || errors.length > 0} onClick={async () => {
        setBusy(true);
        try {
          await save({ data: { clientId, config: c as any, mappingReview: review } });
          await qc.invalidateQueries({ queryKey: ["client-service-setup", clientId] });
          toast.success("Expected services saved");
          onSaved?.();
        } catch (e) { toast.error((e as Error).message); } finally { setBusy(false); }
      }}>Save expected services</Button>
      {d.history.length > 1 && (
        <div className="text-xs text-muted-foreground">
          <p className="font-medium">History</p>
          {d.history.map((h) => <p key={h.version}>v{h.version} · {new Date(h.createdAt).toLocaleDateString()} · {h.packages.map((p) => PACKAGES[p]?.label ?? p).join(", ") || "none"}{h.current ? " (current)" : ""}</p>)}
        </div>
      )}
    </div>
  );
}
