import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { toast } from "sonner";
import { createStaffFund, listStaffClients, listStaffFunds, saveStaffFundSummary } from "@/lib/staff-funds.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { REG_TYPES, type RegTypeValue } from "@/lib/reg-types";
import { DeleteFundDialog } from "@/components/delete-fund-dialog";

export const Route = createFileRoute("/_authenticated/ops/fund-setup/")({
  head: () => ({ meta: [
    { title: "Fund Setup - Harmonious" },
    { name: "description", content: "Harmonious Fund and SPV setup register." },
    { property: "og:title", content: "Fund Setup - Harmonious" },
    { property: "og:description", content: "Harmonious Fund and SPV setup register." },
    { property: "og:type", content: "website" },
    { name: "twitter:card", content: "summary" },
    { name: "robots", content: "noindex" },
  ] }),
  validateSearch: (s: Record<string, unknown>): { view?: "setup" | "stuck" } => (s["view"] === "setup" || s["view"] === "stuck" ? { view: s["view"] as "setup" | "stuck" } : {}),
  component: FundSetupRegister,
});

function FundSetupRegister() {
  const load = useServerFn(listStaffFunds);
  const save = useServerFn(saveStaffFundSummary);
  const create = useServerFn(createStaffFund);
  const listClients = useServerFn(listStaffClients);
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ["staff-funds"], queryFn: () => load(), retry: false });
  const clients = useQuery({ queryKey: ["staff-fund-clients"], queryFn: () => listClients(), enabled: !!q.data?.canPrepare, retry: false });
  const [search, setSearch] = useState("");
  const { view } = Route.useSearch();
  const navigate = Route.useNavigate();
  const [editing, setEditing] = useState<string | null>(null);
  const [summary, setSummary] = useState("");
  const [busy, setBusy] = useState(false);
  const [adding, setAdding] = useState(false);
  const [newName, setNewName] = useState("");
  const [newClient, setNewClient] = useState("");
  const [newType, setNewType] = useState<"SPV" | "Venture Capital" | "Private Equity">("SPV");
  const [regType, setRegType] = useState<RegTypeValue | "">("");
  const rows = q.data?.rows.filter((f) => !view || (f.inSetup && (view === "setup" || (!!f.setupCreatedAt && Date.now() - Date.parse(f.setupCreatedAt) > 21 * 864e5)))).filter((f) => `${f.name} ${f.clientName ?? ""} ${f.fundType ?? ""}`.toLowerCase().includes(search.toLowerCase())) ?? [];
  return <main className="mx-auto max-w-6xl space-y-6 px-4 py-8 sm:px-6">
    <header className="flex flex-wrap items-center justify-between gap-4">
      <div><h1 className="font-heading text-2xl font-semibold">Fund Setup</h1><p className="text-sm text-muted-foreground">Funds and SPVs by Client.</p></div>
      {q.data?.canPrepare && <Button onClick={() => setAdding((v) => !v)}>Add Fund or SPV</Button>}
    </header>
    {adding && <form className="grid max-w-xl gap-3 border-y py-4" onSubmit={async (e) => { e.preventDefault(); if (!regType) return; setBusy(true); try { await create({ data: { name: newName, clientId: newClient, fundType: newType, regType } }); toast.success("Fund added for setup"); setAdding(false); setNewName(""); await qc.invalidateQueries({ queryKey: ["staff-funds"] }); } catch (error) { toast.error((error as Error).message); } finally { setBusy(false); } }}>
      <Label htmlFor="new-fund-name">Fund or SPV name</Label><Input id="new-fund-name" required maxLength={160} value={newName} onChange={(e) => setNewName(e.target.value)} />
      <Label>Client</Label><Select required value={newClient} onValueChange={setNewClient}><SelectTrigger><SelectValue placeholder="Select a Client" /></SelectTrigger><SelectContent>{clients.data?.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}</SelectContent></Select>
      <Label>Type</Label><Select value={newType} onValueChange={(v) => setNewType(v as typeof newType)}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="SPV">SPV</SelectItem><SelectItem value="Venture Capital">Venture capital fund</SelectItem><SelectItem value="Private Equity">Private equity fund</SelectItem></SelectContent></Select>
      <Label>Preliminary offering route</Label><Select value={regType} onValueChange={(v) => setRegType(v as RegTypeValue)}><SelectTrigger><SelectValue placeholder="Select offering route" /></SelectTrigger><SelectContent>{REG_TYPES.map((r) => <SelectItem key={r.value} value={r.value}>{r.short}</SelectItem>)}</SelectContent></Select>
      <Button type="submit" disabled={busy || !newClient || !newName.trim() || !regType}>Create for setup</Button>
    </form>}
    <Input value={search} onChange={(e) => setSearch(e.target.value)} aria-label="Search funds and SPVs" placeholder="Search funds, SPVs and clients" className="max-w-md" />
    {view && <div className="flex items-center gap-2 text-sm text-muted-foreground">Showing {view === "stuck" ? "funds in setup for over 21 days" : "funds still in setup"} <button className="underline" onClick={() => navigate({ search: {} })}>Show all</button></div>}
    {q.isPending ? <p>Loading funds…</p> : q.isError ? <p role="alert">{(q.error as Error).message}</p> : rows.length === 0 ? <p>No funds or SPVs match.</p> :
      <div className="divide-y border-y">{rows.map((f) => <div key={f.id} className="flex flex-wrap items-center justify-between gap-3 py-4">
        <div className="min-w-0"><p className="font-medium">{f.name} {f.retired && <span className="text-muted-foreground">· Retired</span>}</p>
          <p className="text-sm text-muted-foreground">{f.clientName ?? "Client not assigned"} · {f.fundType ?? "Fund"} · {f.id.slice(0, 8)}{f.setupStage ? ` · Setup: ${f.setupStage.replaceAll("_", " ")} · Launch: ${(f.launchState ?? "not ready").replaceAll("_", " ")}` : ""}</p></div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" size="sm" asChild><Link to="/ops/fund/$fundId" params={{ fundId: f.id }}>Open Setup</Link></Button>
          {q.data.canPrepare && !f.retired && <Button variant="ghost" size="sm" onClick={() => { setEditing(f.id); setSummary(f.summary ?? ""); }}>Edit summary</Button>}
          {q.data.canDelete && <DeleteFundDialog fundId={f.id} fundName={f.name} onDeleted={() => qc.invalidateQueries({ queryKey: ["staff-funds"] })} />}
        </div>
        {editing === f.id && <form className="w-full space-y-2" onSubmit={async (e) => { e.preventDefault(); setBusy(true); try { await save({ data: { offeringId: f.id, summary } }); toast.success("Fund summary saved"); setEditing(null); await qc.invalidateQueries({ queryKey: ["staff-funds"] }); } catch (error) { toast.error((error as Error).message); } finally { setBusy(false); } }}>
          <Label htmlFor={`summary-${f.id}`}>Summary</Label><Input id={`summary-${f.id}`} value={summary} maxLength={1000} onChange={(e) => setSummary(e.target.value)} />
          <Button type="submit" size="sm" disabled={busy}>Save</Button> <Button type="button" size="sm" variant="ghost" onClick={() => setEditing(null)}>Cancel</Button>
        </form>}
      </div>)}</div>}
  </main>;
}