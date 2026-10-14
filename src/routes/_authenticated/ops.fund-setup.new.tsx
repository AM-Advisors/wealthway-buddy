import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { toast } from "sonner";
import { ChevronDown, ChevronLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { createStaffFund, listStaffClients, listStaffFunds } from "@/lib/staff-funds.functions";
import { staffSaveSetupFn } from "@/lib/fund-setup-guided.functions";
import { FORM_SECTIONS, changedBySection, type FieldDef } from "@/lib/fund-setup-form-model";
import { REG_TYPES } from "@/lib/reg-types";

export const Route = createFileRoute("/_authenticated/ops/fund-setup/new")({
  head: () => ({ meta: [
    { title: "Set up new fund - Harmonious" },
    { name: "description", content: "Enter every detail for a new Harmonious fund or SPV in one place." },
    { property: "og:title", content: "Set up new fund - Harmonious" },
    { property: "og:description", content: "Enter every detail for a new Harmonious fund or SPV in one place." },
    { property: "og:type", content: "website" },
    { name: "twitter:card", content: "summary" },
    { name: "robots", content: "noindex" },
  ] }),
  component: NewFundSetup,
});

const CREATE_TYPES = ["SPV", "Venture Capital", "Private Equity", "Hedge Fund"] as const;
const SKIP = new Set(["fundType", "regType"]);

function NewFundSetup() {
  const navigate = useNavigate();
  const loadFunds = useServerFn(listStaffFunds);
  const listClients = useServerFn(listStaffClients);
  const create = useServerFn(createStaffFund);
  const staffSave = useServerFn(staffSaveSetupFn);
  const perm = useQuery({ queryKey: ["staff-funds"], queryFn: () => loadFunds(), retry: false });
  const clients = useQuery({ queryKey: ["staff-fund-clients"], queryFn: () => listClients(), enabled: !!perm.data?.canPrepare, retry: false });
  const [vals, setVals] = useState<Record<string, string>>({ fundType: "SPV" });
  const [clientId, setClientId] = useState("");
  const [busy, setBusy] = useState(false);
  const v = (k: string) => vals[k] ?? "";
  const set = (k: string, x: string) => setVals((s) => ({ ...s, [k]: x }));

  if (perm.isPending) return <main className="mx-auto max-w-3xl p-6 text-sm text-muted-foreground">Loading…</main>;
  if (perm.isError || !perm.data?.canPrepare) return <main className="mx-auto max-w-3xl p-6 text-sm">Only Operations staff and Account Managers can set up funds.</main>;

  const name = v("displayName").trim();
  const missing = [!clientId && "Client", !name && "Fund name", !v("regType") && "Form D Type", !v("minInvestment").trim() && "Minimum commitment"].filter(Boolean) as string[];

  const submit = async () => {
    if (missing.length) { toast.error(`Still needed: ${missing.join(", ")}`); return; }
    setBusy(true);
    let id: string | null = null;
    try {
      const r = await create({ data: { name, clientId, fundType: v("fundType") as (typeof CREATE_TYPES)[number], regType: v("regType") as any } });
      id = r.id;
      const rest = Object.fromEntries(Object.entries(vals).filter(([k]) => !SKIP.has(k) && k !== "displayName"));
      for (const [section, payload] of Object.entries(changedBySection(rest, {}))) {
        try { await staffSave({ data: { offeringId: id, section: section as any, payload } }); }
        catch (e: any) { toast.error(`Fund created, but ${section === "fees_team" ? "Fees & Terms" : "Fund details"} didn't save: ${e?.message ?? "error"}`); }
      }
      toast.success("Fund created");
      navigate({ to: "/ops/fund/$fundId", params: { fundId: id }, search: { tab: "setup" } as any });
    } catch (e: any) { toast.error(e?.message ?? "Could not create the fund"); }
    finally { setBusy(false); }
  };

  const cls = "h-14 w-full rounded-xl border border-input bg-background px-4 pt-5 text-sm text-foreground outline-none focus:border-primary focus:ring-2 focus:ring-ring/30";
  const lab = (t: string, req?: boolean) => <span className="pointer-events-none absolute left-4 top-2 text-[11px] font-medium text-muted-foreground">{t}{req && " *"}</span>;
  const select = (key: string, label: string, opts: readonly (readonly [string, string])[], req?: boolean, value?: string, onChange?: (x: string) => void) => (
    <label key={key} className="relative block">
      <select className={`${cls} appearance-none pr-10`} value={value ?? v(key)} onChange={(e) => (onChange ?? ((x: string) => set(key, x)))(e.target.value)}>
        <option value="">Select…</option>{opts.map(([a, b]) => <option key={a} value={a}>{b}</option>)}
      </select>{lab(label, req)}<ChevronDown className="pointer-events-none absolute right-4 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
    </label>
  );
  const field = (f: FieldDef) => {
    if (f.key === "fundType") return select(f.key, f.label, CREATE_TYPES.map((t) => [t, t] as const), true);
    if (f.key === "regType") return select(f.key, f.label, REG_TYPES.map((r) => [r.value, r.short] as const), true);
    if (f.options) return select(f.key, f.label, f.options, f.required);
    return <label key={f.key} className="relative block"><input className={`${cls} disabled:opacity-60`} type={f.type ?? "text"} disabled={f.disabled} value={f.disabled ? f.fixed ?? "" : v(f.key)} onChange={(e) => set(f.key, e.target.value)} />{lab(f.label, f.required)}</label>;
  };

  return (
    <main className="mx-auto max-w-3xl space-y-4 bg-background px-4 py-6">
      <div className="sticky top-0 z-10 flex items-center gap-3 rounded-2xl border bg-card px-3 py-3 shadow-sm">
        <Button variant="outline" size="icon" aria-label="Back" asChild><Link to="/ops/fund-setup"><ChevronLeft className="h-4 w-4" /></Link></Button>
        <div className="min-w-0 flex-1">
          <h1 className="truncate font-heading text-lg font-semibold">Set up new fund</h1>
          <p className="text-xs text-muted-foreground">{missing.length ? `Still needed: ${missing.join(", ")}` : "Ready to create"}</p>
        </div>
        <Button variant="outline" asChild><Link to="/ops/fund-setup">Cancel</Link></Button>
        <Button className="bg-accent text-accent-foreground hover:bg-accent/90" disabled={busy} onClick={submit}>{busy ? "Creating…" : "Create fund"}</Button>
      </div>
      {FORM_SECTIONS.map((s) => (
        <section key={s.id} className="space-y-3 rounded-2xl border bg-card p-5">
          <h2 className="font-heading text-base font-semibold">{s.title}</h2>
          {s.id === "basic" && select("client", "Client", (clients.data ?? []).map((c) => [c.id, c.name] as const), true, clientId, setClientId)}
          {s.fields.map(field)}
        </section>
      ))}
      <p className="rounded-2xl border bg-card p-5 text-sm text-muted-foreground">Team & Signatory, Banking and Documents open on the fund's Setup page right after you create it. The fund starts as a closed draft — nothing is published or filed.</p>
    </main>
  );
}
