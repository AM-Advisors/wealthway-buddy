import { MigrationsTabs } from "@/components/migrations-tabs";
import { QueueMigrationButton } from "@/components/queue-migration-button";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Fragment, useMemo, useState } from "react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { assignWixInvestments, getWixFundStaging, linkWixFund } from "@/lib/wix-funds.functions";

export const Route = createFileRoute("/_authenticated/ops/fund-migration_/wix")({
  head: () => ({
    meta: [
      { title: "Wix Funds Review | Harmonious Operations" },
      { name: "description", content: "Funds and investors copied from Wix, with tools to connect each to the correct Harmonious fund." },
      { property: "og:title", content: "Wix Funds Review | Harmonious Operations" },
      { property: "og:description", content: "Connect Wix funds and investors to the correct fund before migration." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: WixFundsPage,
});

const usd = (c: number) => (c / 100).toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });
const show = (v: unknown) => (typeof v === "object" ? JSON.stringify(v) : String(v));
type Inv = { id: string; name: string; person: string; email: string | null; committed: number; received: number; details: any; importedFundId: string | null };
type Match = { id: string; name: string; source: "confirmed" | "suggested" } | null;
type Row = { wixId: string; name: string; details: Record<string, unknown>; match: Match; confirmedNone: boolean; investments: Inv[]; committed: number; received: number };
type Data = { rows: Row[]; totalInvestments: number; unlinked: number; unassigned: Inv[]; harmoniousFunds: { id: string; name: string; legal: string | null }[] };
const NONE = "__none__";

function WixFundsPage() {
  const get = useServerFn(getWixFundStaging);
  const q = useQuery({ queryKey: ["wix-fund-staging"], queryFn: () => get() as Promise<Data> });
  const [tab, setTab] = useState<"funds" | "investors">("funds");
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<"all" | "suggested" | "confirmed" | "new">("all");
  const [openId, setOpenId] = useState<string | null>(null);
  const open = q.data?.rows.find((r) => r.wixId === openId) ?? null;
  const rows = useMemo(() => (q.data?.rows ?? []).filter((r) =>
    (filter === "all" || (filter === "new" ? !r.match : r.match?.source === filter)) &&
    (!search || `${r.name} ${r.investments.map((i) => `${i.name} ${i.person} ${i.email ?? ""}`).join(" ")}`.toLowerCase().includes(search.toLowerCase()))), [q.data, search, filter]);
  const count = (s: "confirmed" | "suggested") => (q.data?.rows ?? []).filter((r) => r.match?.source === s).length;

  return (
    <div className="mx-auto max-w-6xl space-y-4 p-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <MigrationsTabs />
        <h1 className="font-heading text-2xl font-semibold">Wix funds and investors</h1>
        <Button asChild size="sm" variant="outline"><Link to="/ops/fund-migration">Back to Fund Migration</Link></Button>
      </div>
      <p className="text-sm text-muted-foreground">Everything copied from Wix. Connect each Wix fund to its Harmonious fund and move investors into the right fund. Connections are saved with your name and can be changed later. Nothing here creates or changes a Harmonious fund or investor; that only happens when a migration is approved.</p>
      {q.isLoading ? <p>Loading…</p> : q.error ? <p className="text-destructive">{String(q.error)}</p> : (
        <>
          <div className="grid gap-3 sm:grid-cols-5">
            {[["Wix funds", q.data!.rows.length], ["Confirmed", count("confirmed")], ["Suggested, needs a check", count("suggested")], ["Investors", q.data!.totalInvestments], ["Investors without a fund", q.data!.unlinked]].map(([l, v]) => (
              <Card key={l as string}><CardContent className="p-4"><div className="text-xs text-muted-foreground">{l}</div><div className="text-2xl font-semibold">{v}</div></CardContent></Card>
            ))}
          </div>
          <div className="flex flex-wrap gap-2">
            <Button size="sm" variant={tab === "funds" ? "default" : "outline"} onClick={() => setTab("funds")}>Funds</Button>
            <Button size="sm" variant={tab === "investors" ? "default" : "outline"} onClick={() => setTab("investors")}>Investors without a fund ({q.data!.unlinked})</Button>
          </div>
          {tab === "funds" ? (
            <>
              <div className="flex flex-wrap gap-2">
                <Input className="max-w-xs" placeholder="Search fund, investor or email" value={search} onChange={(e) => setSearch(e.target.value)} />
                {(["all", "suggested", "confirmed", "new"] as const).map((f) => <Button key={f} size="sm" variant={filter === f ? "secondary" : "ghost"} onClick={() => setFilter(f)}>{{ all: "All", suggested: "Needs a check", confirmed: "Confirmed", new: "Not in Harmonious" }[f]}</Button>)}
              </div>
              <Table>
                <TableHeader><TableRow><TableHead>Wix fund</TableHead><TableHead>Harmonious fund</TableHead><TableHead className="text-right">Investors</TableHead><TableHead className="text-right">Committed</TableHead><TableHead className="text-right">Received</TableHead></TableRow></TableHeader>
                <TableBody>
                  {rows.map((r) => (
                    <TableRow key={r.wixId} className="cursor-pointer" onClick={() => setOpenId(r.wixId)}>
                      <TableCell className="font-medium">{r.name}</TableCell>
                      <TableCell><MatchBadge r={r} /></TableCell>
                      <TableCell className="text-right">{r.investments.length}</TableCell>
                      <TableCell className="text-right">{usd(r.committed)}</TableCell>
                      <TableCell className="text-right">{usd(r.received)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </>
          ) : <UnassignedInvestors data={q.data!} />}
        </>
      )}
      <Dialog open={!!open} onOpenChange={(o) => !o && setOpenId(null)}>
        <DialogContent className="max-h-[85vh] max-w-4xl overflow-y-auto">
          <DialogHeader><DialogTitle>{open?.name}</DialogTitle></DialogHeader>
          {open && q.data && <FundDetail row={open} data={q.data} />}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function MatchBadge({ r }: { r: Row }) {
  if (r.match?.source === "confirmed") return <Badge>{r.match.name}</Badge>;
  if (r.match) return <Badge variant="outline">Suggested: {r.match.name}</Badge>;
  return <Badge variant="outline">{r.confirmedNone ? "Confirmed not in Harmonious" : "Not in Harmonious"}</Badge>;
}

function useRefresh() {
  const qc = useQueryClient();
  return () => qc.invalidateQueries({ queryKey: ["wix-fund-staging"] });
}

function FundLink({ row, data }: { row: Row; data: Data }) {
  const link = useServerFn(linkWixFund);
  const refresh = useRefresh();
  const [choice, setChoice] = useState(row.match?.id ?? "");
  const [busy, setBusy] = useState(false);
  const options = [{ value: NONE, label: "Not in Harmonious yet" }, ...data.harmoniousFunds.map((f) => ({ value: f.id, label: f.name, detail: f.legal && f.legal !== f.name ? f.legal : null }))];
  const save = async (offeringId: string | null) => {
    setBusy(true);
    try { await link({ data: { wixFundId: row.wixId, offeringId } }); toast.success("Fund connection saved"); await refresh(); }
    catch (e) { toast.error((e as Error).message); } finally { setBusy(false); }
  };
  return (
    <Card><CardContent className="space-y-2 p-4">
      <div className="text-sm font-medium">Which Harmonious fund is this?</div>
      {row.match?.source === "suggested" && <p className="text-xs text-muted-foreground">Suggested from the fund name. Please confirm or pick the correct one.</p>}
      <div className="flex flex-wrap items-center gap-2">
        <SearchableSelect className="w-80" options={options} value={choice} onValueChange={setChoice} placeholder="Pick a fund…" aria-label="Harmonious fund" />
        <Button size="sm" disabled={busy || !choice} onClick={() => save(choice === NONE ? null : choice)}>{row.match?.source === "suggested" && choice === row.match.id ? "Confirm" : "Save"}</Button>
        {row.match && <Button asChild size="sm" variant="link"><Link to="/admin/fund/$fundId" params={{ fundId: row.match.id }}>Open {row.match.name}</Link></Button>}
      </div>
      {!row.match && <QueueMigrationButton source="wix" sourceRef={row.wixId} fundName={row.name} />}
    </CardContent></Card>
  );
}

function FundDetail({ row, data }: { row: Row; data: Data }) {
  const [showDetails, setShowDetails] = useState(false);
  return (
    <div className="space-y-4 text-sm">
      <FundLink key={row.wixId + (row.match?.id ?? "")} row={row} data={data} />
      <h3 className="font-semibold">Investors ({row.investments.length})</h3>
      <InvestorTable invs={row.investments} data={data} currentFundId={row.wixId} />
      <Button size="sm" variant="ghost" onClick={() => setShowDetails((s) => !s)}>{showDetails ? "Hide" : "Show"} all Wix fund details</Button>
      {showDetails && (
        <dl className="grid grid-cols-[180px_1fr] gap-x-3 gap-y-1">
          {Object.entries(row.details).filter(([k]) => !k.startsWith("link-") && !k.startsWith("_")).map(([k, v]) => <Fragment key={k}><dt className="text-muted-foreground">{k}</dt><dd className="break-all">{show(v)}</dd></Fragment>)}
        </dl>
      )}
    </div>
  );
}

function UnassignedInvestors({ data }: { data: Data }) {
  const [search, setSearch] = useState("");
  const list = data.unassigned.filter((i) => !search || `${i.name} ${i.person} ${i.email ?? ""}`.toLowerCase().includes(search.toLowerCase()));
  return (
    <div className="space-y-3">
      <p className="text-sm text-muted-foreground">These investors came from Wix without a fund. Pick the investors, choose their fund and save.</p>
      <Input className="max-w-xs" placeholder="Search investor or email" value={search} onChange={(e) => setSearch(e.target.value)} />
      <InvestorTable invs={list} data={data} currentFundId={null} />
    </div>
  );
}

function InvestorTable({ invs, data, currentFundId }: { invs: Inv[]; data: Data; currentFundId: string | null }) {
  const assign = useServerFn(assignWixInvestments);
  const refresh = useRefresh();
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [target, setTarget] = useState("");
  const [busy, setBusy] = useState(false);
  const [openInv, setOpenInv] = useState<Inv | null>(null);
  const options = [...(currentFundId ? [{ value: NONE, label: "No fund (remove from this fund)" }] : []),
    ...data.rows.filter((r) => r.wixId !== currentFundId).map((r) => ({ value: r.wixId, label: r.name, detail: r.match ? `Harmonious: ${r.match.name}` : "Not in Harmonious yet" }))];
  const toggle = (id: string) => setPicked((s) => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });
  const save = async () => {
    setBusy(true);
    try { const r = await assign({ data: { investmentIds: [...picked], wixFundId: target === NONE ? null : target } }); toast.success(`${r.count} investor${r.count === 1 ? "" : "s"} moved`); setPicked(new Set()); setTarget(""); await refresh(); }
    catch (e) { toast.error((e as Error).message); } finally { setBusy(false); }
  };
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs text-muted-foreground">{picked.size} selected</span>
        <SearchableSelect className="w-80" options={options} value={target} onValueChange={setTarget} placeholder={currentFundId ? "Move selected to…" : "Assign selected to fund…"} aria-label="Fund for selected investors" disabled={!picked.size} />
        <Button size="sm" disabled={busy || !picked.size || !target} onClick={save}>Save</Button>
      </div>
      <Table>
        <TableHeader><TableRow>
          <TableHead className="w-8"><Checkbox aria-label="Select all" checked={invs.length > 0 && picked.size === invs.length} onCheckedChange={(c) => setPicked(c ? new Set(invs.map((i) => i.id)) : new Set())} /></TableHead>
          <TableHead>Investor</TableHead><TableHead>Email</TableHead><TableHead className="text-right">Committed</TableHead><TableHead className="text-right">Received</TableHead><TableHead>Wix fund name on record</TableHead>
        </TableRow></TableHeader>
        <TableBody>{invs.map((i) => (
          <TableRow key={i.id}>
            <TableCell><Checkbox aria-label={`Select ${i.name}`} checked={picked.has(i.id)} onCheckedChange={() => toggle(i.id)} /></TableCell>
            <TableCell><button type="button" className="text-left text-primary underline-offset-2 hover:underline" onClick={() => setOpenInv(i)}>{i.name || "(unnamed)"}</button>{i.name !== i.person && i.person ? <div className="text-xs text-muted-foreground">{i.person}</div> : null}</TableCell>
            <TableCell className="text-xs">{i.email || <Badge variant="outline">No email</Badge>}</TableCell>
            <TableCell className="text-right">{usd(i.committed)}</TableCell>
            <TableCell className="text-right">{usd(i.received)}</TableCell>
            <TableCell className="text-xs text-muted-foreground">{String(i.details?.fundName ?? i.details?.projectName ?? i.details?.fund ?? "")}</TableCell>
          </TableRow>
        ))}</TableBody>
      </Table>
      <Dialog open={!!openInv} onOpenChange={(o) => !o && setOpenInv(null)}>
        <DialogContent className="max-h-[85vh] max-w-2xl overflow-y-auto">
          <DialogHeader><DialogTitle>{openInv?.name}</DialogTitle></DialogHeader>
          {openInv && <dl className="grid grid-cols-[180px_1fr] gap-x-3 gap-y-1 text-sm">
            {Object.entries(openInv.details ?? {}).filter(([k]) => !k.startsWith("link-") && !k.startsWith("_")).map(([k, v]) => <Fragment key={k}><dt className="text-muted-foreground">{k}</dt><dd className="break-all">{show(v)}</dd></Fragment>)}
          </dl>}
        </DialogContent>
      </Dialog>
    </div>
  );
}
