import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  listFormationReferenceFn, saveFormationProviderFn, addFormationPriceFn, saveFormationBundleFn,
} from "@/lib/fund-formation.functions";

export const Route = createFileRoute("/_authenticated/ops/formation-reference")({
  head: () => ({ meta: [
    { title: "Formation reference data — Harmonious Operations" },
    { name: "description", content: "Formation providers, state fees and formation packages used in Fund Setup." },
    { property: "og:title", content: "Formation reference data — Harmonious Operations" },
    { property: "og:description", content: "Formation providers, state fees and formation packages used in Fund Setup." },
    { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary" }, { name: "robots", content: "noindex" },
  ] }),
  component: Page,
});

const sel = "h-9 w-full rounded-md border border-input bg-background px-2 text-sm";
const usd = (n: number) => Number(n).toLocaleString(undefined, { style: "currency", currency: "USD" });

function Page() {
  const load = useServerFn(listFormationReferenceFn);
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ["formation-reference"], queryFn: () => load(), retry: false });
  const refresh = () => qc.invalidateQueries({ queryKey: ["formation-reference"] });
  if (q.isPending) return <main className="p-6">Loading…</main>;
  if (q.isError) return <main className="p-6" role="alert">{(q.error as Error).message}</main>;
  const d = q.data as any;
  return (
    <main className="mx-auto max-w-5xl space-y-6 px-4 py-8 sm:px-6">
      <header>
        <h1 className="font-heading text-2xl font-semibold">Formation reference data</h1>
        <p className="text-muted-foreground">Providers, state fees and packages Harmonious uses when forming a Fund's entity. Record only: nothing here orders from a provider or charges a client.</p>
      </header>
      <Providers d={d} onChanged={refresh} />
      <Prices d={d} onChanged={refresh} />
      <Bundles d={d} onChanged={refresh} />
    </main>
  );
}

function useRun<T>(fn: (a: { data: T }) => Promise<unknown>, done: () => void) {
  const [busy, setBusy] = useState(false);
  return { busy, run: async (data: T) => { setBusy(true); try { await fn({ data }); toast.success("Saved"); done(); return true; } catch (e: any) { toast.error(e.message); return false; } finally { setBusy(false); } } };
}

function Providers({ d, onChanged }: { d: any; onChanged: () => void }) {
  const { busy, run } = useRun(useServerFn(saveFormationProviderFn), onChanged);
  const [name, setName] = useState("");
  const [type, setType] = useState<"formation_and_registered_agent" | "formation" | "registered_agent">("formation_and_registered_agent");
  return (
    <Card><CardHeader><CardTitle className="text-base">Providers</CardTitle><CardDescription>Formation and registered-agent companies Harmonious works with.</CardDescription></CardHeader>
      <CardContent className="space-y-3">
        <ul className="divide-y text-sm">{d.providers.map((p: any) => (
          <li key={p.id} className="flex items-center justify-between py-2"><span>{p.name} <span className="text-xs text-muted-foreground">{p.provider_type.replaceAll("_", " ")}</span></span>
            <Button size="sm" variant="ghost" disabled={busy} onClick={() => run({ id: p.id, name: p.name, providerType: p.provider_type, active: !p.active, notes: p.notes })}>{p.active ? "Deactivate" : "Reactivate"}</Button></li>
        ))}{d.providers.length === 0 && <li className="py-2 text-muted-foreground">None yet.</li>}</ul>
        <div className="grid gap-2 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
          <div><Label className="text-xs">Name</Label><Input value={name} onChange={(e) => setName(e.target.value)} /></div>
          <div><Label className="text-xs">Type</Label><select className={sel} value={type} onChange={(e) => setType(e.target.value as any)}><option value="formation_and_registered_agent">Formation and registered agent</option><option value="formation">Formation only</option><option value="registered_agent">Registered agent only</option></select></div>
          <Button size="sm" disabled={busy || !name.trim()} onClick={async () => { if (await run({ name, providerType: type, active: true })) setName(""); }}>Add provider</Button>
        </div>
      </CardContent></Card>
  );
}

function Prices({ d, onChanged }: { d: any; onChanged: () => void }) {
  const { busy, run } = useRun(useServerFn(addFormationPriceFn), onChanged);
  const [f, setF] = useState({ providerId: "", jurisdiction: "", entityType: "", stateFee: "", expediteFee: "", providerFee: "", verified: false });
  const pname = (id: string) => d.providers.find((p: any) => p.id === id)?.name ?? "—";
  return (
    <Card><CardHeader><CardTitle className="text-base">State and provider fees</CardTitle><CardDescription>Each entry is kept; add a new one when a fee changes. Harmonious's own fee comes from the rate card.</CardDescription></CardHeader>
      <CardContent className="space-y-3">
        <div className="overflow-x-auto"><table className="w-full text-sm"><thead className="text-left text-xs text-muted-foreground"><tr><th className="py-1">State</th><th>Type</th><th>Provider</th><th>State fee</th><th>Expedite</th><th>Provider fee</th><th>Since</th><th></th></tr></thead>
          <tbody>{d.prices.map((p: any) => <tr key={p.id} className="border-t"><td className="py-1.5">{p.jurisdiction}</td><td>{p.entity_type ?? "Any"}</td><td>{p.provider_id ? pname(p.provider_id) : "—"}</td><td>{usd(p.state_fee)}</td><td>{usd(p.expedite_fee)}</td><td>{usd(p.provider_fee)}</td><td>{p.effective_from}</td><td>{p.verified ? <Badge variant="secondary">Verified</Badge> : <Badge variant="outline">Unverified</Badge>}</td></tr>)}
            {d.prices.length === 0 && <tr><td colSpan={8} className="py-2 text-muted-foreground">None yet.</td></tr>}</tbody></table></div>
        <div className="grid gap-2 sm:grid-cols-4 sm:items-end">
          <div><Label className="text-xs">State (e.g. DE)</Label><Input value={f.jurisdiction} onChange={(e) => setF({ ...f, jurisdiction: e.target.value })} /></div>
          <div><Label className="text-xs">Entity type</Label><Input placeholder="LLC, LP…" value={f.entityType} onChange={(e) => setF({ ...f, entityType: e.target.value })} /></div>
          <div className="sm:col-span-2"><Label className="text-xs">Provider</Label><select className={sel} value={f.providerId} onChange={(e) => setF({ ...f, providerId: e.target.value })}><option value="">None</option>{d.providers.filter((p: any) => p.active).map((p: any) => <option key={p.id} value={p.id}>{p.name}</option>)}</select></div>
          <div><Label className="text-xs">State fee</Label><Input inputMode="decimal" value={f.stateFee} onChange={(e) => setF({ ...f, stateFee: e.target.value })} /></div>
          <div><Label className="text-xs">Expedite fee</Label><Input inputMode="decimal" value={f.expediteFee} onChange={(e) => setF({ ...f, expediteFee: e.target.value })} /></div>
          <div><Label className="text-xs">Provider fee</Label><Input inputMode="decimal" value={f.providerFee} onChange={(e) => setF({ ...f, providerFee: e.target.value })} /></div>
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={f.verified} onChange={(e) => setF({ ...f, verified: e.target.checked })} /> I checked this against the official source</label>
        </div>
        <Button size="sm" disabled={busy || f.jurisdiction.trim().length < 2} onClick={async () => { if (await run({ providerId: f.providerId || null, jurisdiction: f.jurisdiction, entityType: f.entityType || null, stateFee: Number(f.stateFee || 0), expediteFee: Number(f.expediteFee || 0), providerFee: Number(f.providerFee || 0), verified: f.verified })) setF({ providerId: "", jurisdiction: "", entityType: "", stateFee: "", expediteFee: "", providerFee: "", verified: false }); }}>Add fee entry</Button>
      </CardContent></Card>
  );
}

function Bundles({ d, onChanged }: { d: any; onChanged: () => void }) {
  const { busy, run } = useRun(useServerFn(saveFormationBundleFn), onChanged);
  const [f, setF] = useState({ name: "", description: "", ra: true, ein: false, oa: false, expedite: false });
  const inc = (b: any) => [b.includes_registered_agent && "registered agent", b.includes_ein && "EIN", b.includes_operating_agreement && "operating agreement", b.includes_expedite && "expedited"].filter(Boolean).join(", ") || "formation only";
  return (
    <Card><CardHeader><CardTitle className="text-base">Formation packages</CardTitle><CardDescription>What a formation includes. Prices still come from the rate card and Client Expected Services.</CardDescription></CardHeader>
      <CardContent className="space-y-3">
        <ul className="divide-y text-sm">{d.bundles.map((b: any) => (
          <li key={b.id} className="flex items-center justify-between py-2"><span>{b.name} <span className="text-xs text-muted-foreground">— {inc(b)}</span></span>
            <Button size="sm" variant="ghost" disabled={busy} onClick={() => run({ id: b.id, name: b.name, description: b.description, servicePackageKey: b.service_package_key, ra: b.includes_registered_agent, ein: b.includes_ein, oa: b.includes_operating_agreement, expedite: b.includes_expedite, active: !b.active })}>{b.active ? "Deactivate" : "Reactivate"}</Button></li>
        ))}{d.bundles.length === 0 && <li className="py-2 text-muted-foreground">None yet.</li>}</ul>
        <div className="grid gap-2 sm:grid-cols-2"><div><Label className="text-xs">Name</Label><Input value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} /></div><div><Label className="text-xs">Description</Label><Input value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} /></div></div>
        <div className="flex flex-wrap gap-4 text-sm">{([["ra", "Registered agent"], ["ein", "EIN"], ["oa", "Operating agreement"], ["expedite", "Expedited"]] as const).map(([k, l]) => <label key={k} className="flex items-center gap-2"><input type="checkbox" checked={f[k]} onChange={(e) => setF({ ...f, [k]: e.target.checked })} />{l}</label>)}</div>
        <Button size="sm" disabled={busy || !f.name.trim()} onClick={async () => { if (await run({ ...f, description: f.description || null, active: true })) setF({ name: "", description: "", ra: true, ein: false, oa: false, expedite: false }); }}>Add package</Button>
      </CardContent></Card>
  );
}
