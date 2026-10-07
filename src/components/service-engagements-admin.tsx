import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { getServiceEngagementDetail, listServiceEngagements, saveServiceEngagement, setEngagementEntitlement } from "@/lib/service-engagements.functions";
import { levelsFor } from "@/lib/service-ladders";
import { serviceLevelLabel, titleCase, usd, fmtDate } from "@/lib/service-engagement-labels";

const PRODUCTS = ["SPV_ADMINISTRATION", "FUND_ADMINISTRATION", "CAP_TABLE", "TAX", "REGULATORY", "ENTITY_MANAGEMENT", "PAYMASTER", "REGISTERED_AGENT", "DEAL_ROOM", "BANKING", "OTHER"];
const STATUSES = ["PROPOSED", "PENDING_AGREEMENT", "ACTIVE", "PAUSED", "CANCELLATION_PENDING", "CANCELLED", "EXPIRED"];
const BILLING = ["ANNUAL", "QUARTERLY", "MONTHLY", "ONE_TIME", "CUSTOM"];
const PRICING = ["CURRENT", "GRANDFATHERED", "NEGOTIATED", "PROMOTIONAL", "CUSTOM"];
const RENEWAL = ["AUTO_RENEW", "MANUAL_RENEWAL", "FIXED_TERM", "MONTH_TO_MONTH", "NONE"];
const FREQ = ["MONTHLY", "QUARTERLY", "ANNUAL", "CUSTOM"];
const TEAM: [string, string][] = [["primary_administrator_user_id", "Primary administrator"], ["secondary_administrator_user_id", "Secondary administrator"], ["relationship_lead_user_id", "Relationship lead"], ["accounting_lead_user_id", "Accounting lead"], ["tax_coordinator_user_id", "Tax coordinator"], ["compliance_coordinator_user_id", "Compliance coordinator"]];

export function ServiceEngagementsAdmin() {
  const list = useServerFn(listServiceEngagements);
  const q = useQuery({ queryKey: ["service-engagements"], queryFn: () => list() });
  const [editing, setEditing] = useState<any | null>(null);
  if (q.isLoading) return <div className="p-6 text-sm text-muted-foreground">Loading…</div>;
  if (q.error) return <div className="p-6 text-sm text-destructive">{(q.error as Error).message}</div>;
  const d = q.data!;
  return (
    <div className="mx-auto max-w-6xl space-y-5 px-4 py-6">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl">Service engagements</h1>
          <p className="text-sm text-muted-foreground">One record per fund service: level, contracted price, billing, team and entitlements. Changing list prices never changes a signed engagement.</p>
        </div>
        <Button onClick={() => setEditing({ service_product: "FUND_ADMINISTRATION", service_level: "FUND_ADMINISTRATION", service_status: "PROPOSED", billing_frequency: "ANNUAL", pricing_type: "CURRENT", grandfathered: false })}>New engagement</Button>
      </div>
      {editing ? <EngagementForm key={editing.id ?? "new"} initial={editing} data={d} onClose={() => setEditing(null)} /> : null}
      <div className="overflow-x-auto rounded-xl border">
        <table className="w-full text-sm">
          <thead className="bg-muted/50 text-left text-xs text-muted-foreground">
            <tr><th className="p-2">Fund</th><th className="p-2">Service</th><th className="p-2">Status</th><th className="p-2">Contract</th><th className="p-2">Billing</th><th className="p-2">Renewal</th><th className="p-2" /></tr>
          </thead>
          <tbody>
            {d.rows.map((r: any) => (
              <tr key={r.id} className="border-t">
                <td className="p-2">{r.offerings?.name ?? "—"}<div className="text-xs text-muted-foreground">{r.clients?.name ?? ""}</div></td>
                <td className="p-2">{serviceLevelLabel(r.service_level, r.service_product).name}<div className="text-xs text-muted-foreground">{titleCase(r.service_product)}</div></td>
                <td className="p-2"><Badge variant="outline">{titleCase(r.service_status)}</Badge></td>
                <td className="p-2">{r.included_at_no_charge ? "Included" : usd(r.contracted_annual_value)}{r.pricing_type !== "CURRENT" ? <div className="text-xs text-muted-foreground">{titleCase(r.pricing_type)}</div> : null}</td>
                <td className="p-2">{titleCase(r.billing_frequency)}</td>
                <td className="p-2">{fmtDate(r.renewal_date)}</td>
                <td className="p-2 text-right"><Button size="sm" variant="outline" onClick={() => setEditing(r)}>Open</Button></td>
              </tr>
            ))}
            {!d.rows.length ? <tr><td colSpan={7} className="p-4 text-center text-muted-foreground">No engagements yet.</td></tr> : null}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function Sel({ label, value, options, onChange, labels }: { label: string; value: any; options: string[]; onChange: (v: string | null) => void; labels?: Record<string, string> }) {
  return (
    <label className="text-xs text-muted-foreground">{label}
      <select className="mt-1 block w-full rounded-md border bg-background px-2 py-2 text-sm text-foreground" value={value ?? ""} onChange={(e) => onChange(e.target.value || null)}>
        <option value="">—</option>
        {options.map((o) => <option key={o} value={o}>{labels?.[o] ?? titleCase(o)}</option>)}
      </select>
    </label>
  );
}
function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <label className="text-xs text-muted-foreground">{label}<div className="mt-1">{children}</div></label>;
}

function EngagementForm({ initial, data, onClose }: { initial: any; data: any; onClose: () => void }) {
  const qc = useQueryClient();
  const save = useServerFn(saveServiceEngagement);
  const [f, setF] = useState<any>(initial);
  const [busy, setBusy] = useState(false);
  const set = (k: string, v: any) => setF((p: any) => ({ ...p, [k]: v }));
  const num = (v: string) => (v === "" ? null : Number(v));
  const price = data.pricing.find((p: any) => p.service_product === f.service_product && p.service_level === f.service_level);
  const staffLabels = Object.fromEntries((data.staff as any[]).map((s) => [s.user_id, s.legal_name || s.email]));
  const fundLabels = Object.fromEntries((data.funds as any[]).map((x) => [x.id, x.name]));

  async function submit() {
    setBusy(true);
    try {
      const keys = ["id", "fund_id", "service_product", "service_level", "service_status", "billing_frequency", "contracted_annual_value", "recurring_invoice_amount", "pricing_type", "pricing_override_reason", "grandfathered", "effective_date", "contract_start_date", "contract_end_date", "renewal_date", "renewal_type", "reporting_frequency", "nav_frequency", "response_sla", "investor_limit", "investment_limit", "entity_limit", "notes_internal", ...TEAM.map((t) => t[0])];
      const payload: any = {};
      for (const k of keys) if (f[k] !== undefined) payload[k] = f[k] === "" ? null : f[k];
      await save({ data: payload });
      toast.success("Engagement saved");
      await qc.invalidateQueries({ queryKey: ["service-engagements"] });
      onClose();
    } catch (e) { toast.error((e as Error).message); } finally { setBusy(false); }
  }

  return (
    <section className="space-y-4 rounded-xl border bg-card p-5">
      <div className="flex items-center justify-between"><h2 className="text-lg">{f.id ? "Edit engagement" : "New engagement"}</h2><Button variant="ghost" size="sm" onClick={onClose}>Close</Button></div>
      <div className="grid gap-3 sm:grid-cols-3">
        <Sel label="Fund" value={f.fund_id} options={data.funds.map((x: any) => x.id)} labels={fundLabels} onChange={(v) => set("fund_id", v)} />
        <Sel label="Service product" value={f.service_product} options={PRODUCTS} onChange={(v) => setF((p: any) => ({ ...p, service_product: v, service_level: levelsFor(v).includes(p.service_level) ? p.service_level : levelsFor(v)[0] }))} />
        <Sel label="Service level" value={f.service_level} options={levelsFor(f.service_product)} labels={Object.fromEntries(levelsFor(f.service_product).map((l) => [l, serviceLevelLabel(l, f.service_product).name]))} onChange={(v) => set("service_level", v)} />
        <Sel label="Status" value={f.service_status} options={STATUSES} onChange={(v) => set("service_status", v)} />
        <Sel label="Billing frequency" value={f.billing_frequency} options={BILLING} onChange={(v) => set("billing_frequency", v)} />
        <Sel label="Pricing type" value={f.pricing_type} options={PRICING} onChange={(v) => set("pricing_type", v)} />
        <Field label={`Contracted annual value${price ? ` (list ${usd(price.annual_price ?? price.starting_price)})` : ""}`}><Input type="number" value={f.contracted_annual_value ?? ""} onChange={(e) => set("contracted_annual_value", num(e.target.value))} placeholder="Defaults to list price" /></Field>
        <Field label="Recurring invoice amount"><Input type="number" value={f.recurring_invoice_amount ?? ""} onChange={(e) => set("recurring_invoice_amount", num(e.target.value))} placeholder="Defaults from billing" /></Field>
        <label className="flex items-end gap-2 text-sm"><input type="checkbox" checked={!!f.grandfathered} onChange={(e) => set("grandfathered", e.target.checked)} /> Grandfathered pricing</label>
        <Field label="Effective date"><Input type="date" value={f.effective_date ?? ""} onChange={(e) => set("effective_date", e.target.value)} /></Field>
        <Field label="Contract start"><Input type="date" value={f.contract_start_date ?? ""} onChange={(e) => set("contract_start_date", e.target.value)} /></Field>
        <Field label="Contract end"><Input type="date" value={f.contract_end_date ?? ""} onChange={(e) => set("contract_end_date", e.target.value)} /></Field>
        <Field label="Renewal date"><Input type="date" value={f.renewal_date ?? ""} onChange={(e) => set("renewal_date", e.target.value)} /></Field>
        <Sel label="Renewal type" value={f.renewal_type} options={RENEWAL} onChange={(v) => set("renewal_type", v)} />
        <Sel label="Reporting frequency" value={f.reporting_frequency} options={FREQ} onChange={(v) => set("reporting_frequency", v)} />
        <Sel label="NAV frequency" value={f.nav_frequency} options={FREQ} onChange={(v) => set("nav_frequency", v)} />
        <Field label="Response SLA"><Input value={f.response_sla ?? ""} onChange={(e) => set("response_sla", e.target.value)} placeholder="e.g. 1 business day" /></Field>
        <Field label="Investor limit"><Input type="number" value={f.investor_limit ?? ""} onChange={(e) => set("investor_limit", num(e.target.value))} /></Field>
        <Field label="Investment limit"><Input type="number" value={f.investment_limit ?? ""} onChange={(e) => set("investment_limit", num(e.target.value))} /></Field>
        <Field label="Entity limit"><Input type="number" value={f.entity_limit ?? ""} onChange={(e) => set("entity_limit", num(e.target.value))} /></Field>
        {TEAM.map(([k, l]) => <Sel key={k} label={l} value={f[k]} options={data.staff.map((s: any) => s.user_id)} labels={staffLabels} onChange={(v) => set(k, v)} />)}
      </div>
      <Field label="Pricing override reason (Admin only; required for non-list pricing)"><Textarea value={f.pricing_override_reason ?? ""} onChange={(e) => set("pricing_override_reason", e.target.value)} /></Field>
      <Field label="Internal notes (never shown to clients)"><Textarea value={f.notes_internal ?? ""} onChange={(e) => set("notes_internal", e.target.value)} /></Field>
      <div className="flex gap-2">
        <Button onClick={submit} disabled={busy}>{busy ? "Saving…" : "Save"}</Button>
        {f.id && f.service_status !== "ACTIVE" ? <Button variant="outline" onClick={() => set("service_status", "ACTIVE")}>Mark active</Button> : null}
        {f.id && f.service_status === "ACTIVE" ? <Button variant="outline" onClick={() => set("service_status", "PAUSED")}>Pause</Button> : null}
        {f.id ? <Button variant="outline" onClick={() => set("service_status", "CANCELLATION_PENDING")}>Start cancellation</Button> : null}
      </div>
      {f.id ? <EngagementDetail id={f.id} features={data.features} /> : null}
    </section>
  );
}

function EngagementDetail({ id, features }: { id: string; features: any[] }) {
  const get = useServerFn(getServiceEngagementDetail);
  const setEnt = useServerFn(setEngagementEntitlement);
  const q = useQuery({ queryKey: ["service-engagement", id], queryFn: () => get({ data: { id } }) });
  const [search, setSearch] = useState("");
  const [cat, setCat] = useState("ALL");
  const [show, setShow] = useState<"all" | "on" | "changed">("all");
  if (!q.data) return null;
  const { defaults, overrides, events } = q.data;
  const ov = new Map((overrides as any[]).map((o) => [o.feature_key, o.mode]));
  async function change(key: string, mode: "ADD" | "REMOVE" | "DEFAULT") {
    try { await setEnt({ data: { engagement_id: id, feature_key: key, mode } }); await q.refetch(); } catch (e) { toast.error((e as Error).message); }
  }
  const cats = [...new Set(features.map((f) => f.category || "Other"))].sort();
  const term = search.toLowerCase();
  const visible = features.filter((ft) => {
    const mode = ov.get(ft.feature_key); const on = mode === "ADD" || (defaults.includes(ft.feature_key) && mode !== "REMOVE");
    if (cat !== "ALL" && (ft.category || "Other") !== cat) return false;
    if (show === "on" && !on) return false;
    if (show === "changed" && !mode) return false;
    return !term || `${ft.name} ${ft.category ?? ""}`.toLowerCase().includes(term);
  });
  return (
    <div className="grid gap-5 lg:grid-cols-2">
      <div>
        <h3 className="text-sm font-medium">Entitlements</h3>
        <div className="mt-2 flex flex-wrap gap-2">
          <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search services" aria-label="Search services" className="h-8 w-44" />
          <select value={cat} onChange={(e) => setCat(e.target.value)} aria-label="Category" className="h-8 rounded-md border bg-background px-2 text-sm">
            <option value="ALL">All categories</option>{cats.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
          <select value={show} onChange={(e) => setShow(e.target.value as any)} aria-label="Show" className="h-8 rounded-md border bg-background px-2 text-sm">
            <option value="all">All services</option><option value="on">Included only</option><option value="changed">Changed for this fund</option>
          </select>
        </div>
        <div className="mt-2 max-h-[28rem] space-y-3 overflow-y-auto text-sm">
          {cats.filter((c) => visible.some((ft) => (ft.category || "Other") === c)).map((c) => (
            <div key={c}>
              <div className="sticky top-0 bg-card py-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">{c}</div>
              <ul className="space-y-1">
                {visible.filter((ft) => (ft.category || "Other") === c).map((ft) => {
                  const isDefault = defaults.includes(ft.feature_key);
                  const mode = ov.get(ft.feature_key);
                  const on = mode === "ADD" || (isDefault && mode !== "REMOVE");
                  return (
                    <li key={ft.feature_key} className="flex items-center justify-between gap-2">
                      <span className={on ? "" : "text-muted-foreground"}>
                        {ft.name}
                        {mode === "ADD" ? <Badge variant="outline" className="ml-2">Added for this fund</Badge>
                          : mode === "REMOVE" ? <Badge variant="outline" className="ml-2">Removed from default</Badge>
                          : isDefault ? <Badge variant="secondary" className="ml-2">Included</Badge> : null}
                      </span>
                      <span className="flex gap-1">
                        {mode ? <Button size="sm" variant="ghost" onClick={() => change(ft.feature_key, "DEFAULT")}>Reset</Button>
                          : on ? <Button size="sm" variant="ghost" onClick={() => change(ft.feature_key, "REMOVE")}>Remove</Button>
                          : <Button size="sm" variant="ghost" onClick={() => change(ft.feature_key, "ADD")}>Add</Button>}
                      </span>
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
          {!visible.length && <p className="text-xs text-muted-foreground">No services match.</p>}
        </div>
      </div>
      <div>
        <h3 className="text-sm font-medium">Change history</h3>
        <ul className="mt-2 max-h-96 space-y-1 overflow-y-auto text-xs">
          {(events as any[]).map((e) => (
            <li key={e.id} className="border-b pb-1"><span className="text-muted-foreground">{new Date(e.changed_at).toLocaleString()}</span> · {titleCase(e.field.replace("entitlement:", "entitlement "))}: {e.old_value ?? "—"} → {e.new_value ?? "—"}</li>
          ))}
        </ul>
      </div>
    </div>
  );
}
