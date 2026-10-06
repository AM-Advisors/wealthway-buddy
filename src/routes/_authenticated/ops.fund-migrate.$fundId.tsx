import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import {
  getDriveMigration, updateDriveMigrationItems, applyDriveMigration, extractDriveMigration,
  decideDriveSuggestion, aiSortDriveMigration, rescanDriveMigration,
} from "@/lib/drive-migration.functions";
import { DOCUMENT_TYPES } from "@/lib/drive-intake";
import { FundLaunchInvestors } from "@/components/fund-launch-investors";
import { DriveImportsCard } from "@/components/drive-import";
import { DriveFolderPicker } from "@/components/drive-folder-picker";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

export const Route = createFileRoute("/_authenticated/ops/fund-migrate/$fundId")({
  head: () => ({ meta: [
    { title: "Fund migration - Harmonious" },
    { name: "description", content: "Bring an existing fund in from its Google Drive folder." },
    { property: "og:title", content: "Fund migration - Harmonious" },
    { property: "og:description", content: "Sort a fund's Drive files and fill in Fund Setup from its documents." },
    { property: "og:type", content: "website" },
    { name: "twitter:card", content: "summary" },
    { name: "robots", content: "noindex" },
  ] }),
  component: MigratePage,
});

const TYPE_OPTIONS = [
  ...Object.entries(DOCUMENT_TYPES.fund).map(([k, v]) => ({ value: `fund:${k}`, label: `Fund · ${v}` })),
  ...Object.entries(DOCUMENT_TYPES.investor).map(([k, v]) => ({ value: `investor:${k}`, label: `Investor · ${v}` })),
];
const FIELD: Record<string, string> = {
  legal_name: "Legal name", entity_type: "Entity type", jurisdiction: "State / jurisdiction", formation_date: "Formation date",
  fiscal_year_end: "Fiscal year end", ein: "EIN", management_fee_percent: "Management fee (%)", carried_interest_percent: "Carried interest (%)", investor: "Investor",
};
const NONE = "__none";
type Tab = "review" | "accepted" | "done" | "attention" | "skipped";

function MigratePage() {
  const { fundId } = Route.useParams();
  const load = useServerFn(getDriveMigration);
  const qc = useQueryClient();
  const key = ["drive-migration", fundId];
  const q = useQuery({ queryKey: key, queryFn: () => load({ data: { offeringId: fundId } }), retry: false });
  const refresh = () => qc.invalidateQueries({ queryKey: key });
  const d = q.data;
  return (
    <main className="mx-auto w-full max-w-6xl space-y-5 p-6">
      <header className="space-y-1">
        <Link to="/ops/fund-setup/$fundId" params={{ fundId }} className="text-sm text-primary underline">← Back to Fund Setup</Link>
        <h1 className="text-3xl">Migrate {d?.fund?.name ?? "fund"} from Google Drive</h1>
        <p className="text-sm text-muted-foreground">Sort the fund's existing files into place and use what's in them to fill in Fund Setup. Nothing moves or changes until you accept it.</p>
      </header>
      {q.isLoading && <p className="text-sm text-muted-foreground">Loading…</p>}
      {q.error && <p className="text-sm text-destructive">{(q.error as Error).message}</p>}
      {d && !d.migration && (
        <section className="space-y-3 rounded-lg border bg-card p-5">
          <h2 className="text-lg font-semibold text-foreground">Step 1 · Choose the fund's folder</h2>
          <p className="text-sm text-muted-foreground">Pick the Google folder this fund already uses. Every file in it, including subfolders, will be listed for you to review.</p>
          {d.canManage ? <DriveFolderPicker offeringId={fundId} onDone={refresh} /> : <p className="text-sm text-muted-foreground">Only Super Admins and Operations leads can start a migration.</p>}
        </section>
      )}
      {d?.migration && <Migration d={d} refresh={refresh} />}
    </main>
  );
}

function Checklist({ s, mig }: { s: any; mig: any }) {
  const steps = [
    { label: "Folder linked", done: true, hint: `${mig.source_folder_name} · ${mig.mode === "link" ? "organized in place" : "copied into the Funds drive"}` },
    { label: "Files sorted", done: s.toSort > 0 && s.sorted >= s.toSort, hint: `${s.sorted}/${s.toSort}${s.held ? ` · ${s.held} held` : ""}${s.blocked ? ` · ${s.blocked} blocked` : ""}` },
    { label: "Fund details reviewed", done: s.details > 0 && s.detailsReviewed >= s.details, hint: `${s.detailsReviewed}/${s.details}` },
    { label: "Investors added", done: s.investors > 0 ? s.investorsAdded >= s.investors : false, hint: `${s.investorsAdded}/${s.investors}` },
  ];
  const ready = steps.slice(1).every((x) => x.done || x.hint.endsWith("/0"));
  return (
    <section className="grid gap-2 sm:grid-cols-5">
      {steps.map((x) => (
        <div key={x.label} className={`rounded-lg border p-3 ${x.done ? "border-primary bg-primary/5" : "bg-card"}`}>
          <div className="text-sm font-medium text-foreground">{x.done ? "✓ " : ""}{x.label}</div>
          <div className="text-xs text-muted-foreground">{x.hint}</div>
        </div>
      ))}
      <div className={`rounded-lg border p-3 ${ready ? "border-primary bg-primary/5" : "bg-card"}`}>
        <div className="text-sm font-medium text-foreground">{ready ? "✓ " : ""}Ready for Setup review</div>
        <div className="text-xs text-muted-foreground">Launch still needs the normal approval.</div>
      </div>
    </section>
  );
}

function Migration({ d, refresh }: { d: any; refresh: () => void }) {
  const mig = d.migration;
  const update = useServerFn(updateDriveMigrationItems);
  const apply = useServerFn(applyDriveMigration);
  const aiSort = useServerFn(aiSortDriveMigration);
  const rescan = useServerFn(rescanDriveMigration);
  const [tab, setTab] = useState<Tab>("review");
  const [sel, setSel] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const items: any[] = d.items;
  const inTab = (i: any) =>
    tab === "review" ? i.action === "pending"
    : tab === "accepted" ? i.action === "accept" && i.result !== "done"
    : tab === "done" ? i.result === "done"
    : tab === "attention" ? i.action === "blocked" || i.result === "failed" || i.result === "held"
    : i.action === "skip" || i.action === "duplicate";
  const shown = useMemo(() => items.filter((i) => inTab(i) && (!search || `${i.path} ${i.file_name}`.toLowerCase().includes(search.toLowerCase()))), [items, tab, search]);
  const count = (t: Tab) => { const prev = tab; let n = 0; for (const i of items) { const ok = (t === "review" ? i.action === "pending" : t === "accepted" ? i.action === "accept" && i.result !== "done" : t === "done" ? i.result === "done" : t === "attention" ? i.action === "blocked" || i.result === "failed" || i.result === "held" : i.action === "skip" || i.action === "duplicate"); if (ok) n++; } void prev; return n; };

  const run = async (label: string, f: () => Promise<unknown>) => {
    setBusy(label);
    try { await f(); refresh(); } catch (e) { toast.error((e as Error).message); } finally { setBusy(null); }
  };
  const bulk = (patch: Record<string, unknown>, ids = [...sel]) => run("bulk", async () => {
    if (!ids.length) return;
    await update({ data: { ids, ...patch } as any });
    setSel(new Set());
  });
  const applyAll = () => run("apply", async () => {
    let total = 0;
    for (let i = 0; i < 80; i++) {
      const r = await apply({ data: { migrationId: mig.id } });
      total += r.processed;
      refresh();
      if (!r.remaining || !r.processed) break;
    }
    toast.success(`Processed ${total} file${total === 1 ? "" : "s"}.`);
  });

  return (<>
    <Checklist s={d.summary} mig={mig} />
    {mig.last_error && <p className="text-sm text-destructive">{mig.last_error}</p>}

    <section className="space-y-3 rounded-lg border bg-card p-4">
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="mr-auto text-lg font-semibold text-foreground">Step 2 · Sort the files</h2>
        {d.canManage && <>
          <Button size="sm" variant="outline" disabled={!!busy} onClick={() => run("ai", async () => { const r = await aiSort({ data: { migrationId: mig.id } }); toast.success(`AI sorted ${r.sorted} unclear file${r.sorted === 1 ? "" : "s"}.`); })}>{busy === "ai" ? "Sorting…" : "AI: sort unclear files"}</Button>
          <Button size="sm" variant="outline" disabled={!!busy} onClick={() => run("scan", async () => { await rescan({ data: { migrationId: mig.id } }); toast.success("Rescanned the folder for new files."); })}>Rescan folder</Button>
          <Button size="sm" disabled={!!busy || !count("accepted")} onClick={applyAll}>{busy === "apply" ? "Applying…" : `Apply accepted (${count("accepted")})`}</Button>
        </>}
      </div>
      <p className="text-xs text-muted-foreground">
        Accept a file to {mig.mode === "link" ? "move it into its standard subfolder" : "copy it into its standard subfolder (the original stays where it is)"} and record it on the fund. Investor files go to that investor's restricted folder. Files with SSNs or identity evidence are blocked and never imported.
      </p>
      <div className="flex flex-wrap items-center gap-2">
        {([["review", "To review"], ["accepted", "Accepted"], ["done", "Done"], ["attention", "Needs attention"], ["skipped", "Skipped"]] as const).map(([k, l]) => (
          <Button key={k} size="sm" variant={tab === k ? "default" : "outline"} onClick={() => { setTab(k); setSel(new Set()); }}>{l} ({count(k)})</Button>
        ))}
        <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search files" aria-label="Search files" className="ml-auto h-8 max-w-xs" />
      </div>
      {d.canManage && sel.size > 0 && (
        <div className="flex flex-wrap items-center gap-2 rounded-md bg-muted/50 p-2 text-sm">
          <span>{sel.size} selected</span>
          <Button size="sm" onClick={() => bulk({ action: "accept" })}>Accept</Button>
          <Button size="sm" variant="outline" onClick={() => bulk({ action: "skip" })}>Skip</Button>
          <Button size="sm" variant="outline" onClick={() => bulk({ action: "duplicate" })}>Duplicate</Button>
          <Button size="sm" variant="ghost" onClick={() => bulk({ action: "pending" })}>Back to review</Button>
        </div>
      )}
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead><tr className="text-left text-xs text-muted-foreground">
            <th className="w-8 py-1">{d.canManage && <input type="checkbox" aria-label="Select all" checked={shown.length > 0 && shown.every((i) => sel.has(i.id))} onChange={(e) => setSel(e.target.checked ? new Set(shown.filter((i) => i.action !== "blocked" && i.result !== "done").map((i) => i.id)) : new Set())} />}</th>
            <th className="py-1 pr-2 font-medium">File</th><th className="py-1 pr-2 font-medium">Type</th><th className="py-1 pr-2 font-medium">Destination</th><th className="py-1 pr-2 font-medium">Linked to</th><th className="py-1 font-medium">Status</th>
          </tr></thead>
          <tbody>
            {shown.slice(0, 400).map((i) => (
              <ItemRow key={i.id} i={i} d={d} selected={sel.has(i.id)} onSelect={(v) => { const n = new Set(sel); if (v) n.add(i.id); else n.delete(i.id); setSel(n); }} onChange={(patch) => bulk(patch, [i.id])} />
            ))}
          </tbody>
        </table>
        {!shown.length && <p className="py-3 text-sm text-muted-foreground">Nothing here.</p>}
        {shown.length > 400 && <p className="py-2 text-xs text-muted-foreground">Showing the first 400. Use search to narrow down.</p>}
      </div>
    </section>

    <Suggestions d={d} refresh={refresh} />
    <>
    <DriveImportsCard offeringId={d.fund?.id ?? d.migration.offering_id} />
    <FundLaunchInvestors fundId={d.fund?.id ?? d.migration.offering_id} items={d.items ?? []} />
    </>
  </>);
}

function ItemRow({ i, d, selected, onSelect, onChange }: { i: any; d: any; selected: boolean; onSelect: (v: boolean) => void; onChange: (p: Record<string, unknown>) => void }) {
  const locked = !d.canManage || i.action === "blocked" || i.result === "done";
  const status = i.result === "done" ? <Badge>Done</Badge>
    : i.result === "failed" ? <Badge variant="destructive" title={i.result_message ?? ""}>Failed</Badge>
    : i.result === "held" ? <Badge variant="secondary" title={i.result_message ?? ""}>Held</Badge>
    : i.action === "blocked" ? <Badge variant="destructive">Blocked</Badge>
    : i.action === "accept" ? <Badge variant="secondary">Accepted</Badge>
    : i.action === "skip" ? <Badge variant="outline">Skipped</Badge>
    : i.action === "duplicate" ? <Badge variant="outline">Duplicate</Badge>
    : <Badge variant="outline">To review</Badge>;
  return (
    <tr className="border-t align-top">
      <td className="py-2">{!locked && <input type="checkbox" aria-label={`Select ${i.file_name}`} checked={selected} onChange={(e) => onSelect(e.target.checked)} />}</td>
      <td className="max-w-xs py-2 pr-2">
        <div className="truncate font-medium text-foreground" title={i.file_name}>{i.file_name}</div>
        <div className="truncate text-xs text-muted-foreground" title={i.path}>{i.path}</div>
        <div className="text-xs text-muted-foreground">{i.result_message ?? i.suggested_reason}</div>
      </td>
      <td className="py-2 pr-2">
        {locked ? <span className="text-xs">{TYPE_OPTIONS.find((t) => t.value === `${i.category}:${i.document_type}`)?.label ?? "—"}</span> : (
          <Select value={`${i.category}:${i.document_type}`} onValueChange={(v) => { const [category, documentType] = v.split(":"); onChange({ category, documentType }); }}>
            <SelectTrigger className="h-8 w-56" aria-label="Document type"><SelectValue /></SelectTrigger>
            <SelectContent>{TYPE_OPTIONS.map((t) => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}</SelectContent>
          </Select>
        )}
      </td>
      <td className="py-2 pr-2 text-xs text-muted-foreground">{i.destination}</td>
      <td className="py-2 pr-2">
        {i.category === "investor" ? (locked ? <span className="text-xs">{d.investors.find((x: any) => x.onboardingId === i.onboarding_id)?.name ?? i.investor_name ?? "—"}</span> : (
          <div className="space-y-1">
            <Select value={i.onboarding_id ?? NONE} onValueChange={(v) => onChange({ onboardingId: v === NONE ? null : v })}>
              <SelectTrigger className="h-8 w-48" aria-label="Investor"><SelectValue /></SelectTrigger>
              <SelectContent><SelectItem value={NONE}>Choose investor</SelectItem>{d.investors.map((x: any) => <SelectItem key={x.onboardingId} value={x.onboardingId}>{x.name}</SelectItem>)}</SelectContent>
            </Select>
            {!i.onboarding_id && i.investor_name && <div className="text-xs text-muted-foreground">New investor? "{i.investor_name}"</div>}
          </div>
        )) : <span className="text-xs text-muted-foreground">Fund</span>}
      </td>
      <td className="py-2">
        <div className="flex flex-wrap items-center gap-1">
          {status}
          {!locked && i.action !== "accept" && <Button size="sm" variant="ghost" className="h-7" onClick={() => onChange({ action: "accept" })}>Accept</Button>}
          {!locked && i.action === "pending" && <Button size="sm" variant="ghost" className="h-7" onClick={() => onChange({ action: "skip" })}>Skip</Button>}
          {d.canManage && (i.result === "failed" || i.result === "held") && <Button size="sm" variant="ghost" className="h-7" onClick={() => onChange({ action: "accept" })}>Retry next apply</Button>}
        </div>
      </td>
    </tr>
  );
}

function Suggestions({ d, refresh }: { d: any; refresh: () => void }) {
  const extract = useServerFn(extractDriveMigration);
  const decide = useServerFn(decideDriveSuggestion);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<string | null>(null);
  const [emails, setEmails] = useState<Record<string, string>>({});
  const readAll = async () => {
    setBusy(true);
    try {
      let added = 0;
      for (let i = 0; i < 30; i++) {
        const r: any = await extract({ data: { migrationId: d.migration.id } });
        if (!r.read) break;
        added += r.added; setProgress(`Read ${r.read} · ${r.remaining} left`); refresh();
        if (!r.remaining) break;
      }
      toast.success(added ? `Found ${added} suggestion${added === 1 ? "" : "s"}.` : "No new details found.");
    } catch (e) { toast.error((e as Error).message); } finally { setBusy(false); setProgress(null); }
  };
  const act = async (s: any, accept: boolean) => {
    try {
      await decide({ data: { id: s.id, accept, ...(s.field === "investor" && emails[s.id] ? { email: emails[s.id] } : {}) } });
      toast.success(accept ? "Saved to the fund." : "Rejected."); refresh();
    } catch (e) { toast.error((e as Error).message); }
  };
  const open = d.suggestions.filter((s: any) => s.status === "open");
  const decided = d.suggestions.filter((s: any) => s.status !== "open");
  const show = (s: any) => s.field === "investor" ? `${s.proposed.name}${s.proposed.commitment_usd ? ` · $${Number(s.proposed.commitment_usd).toLocaleString()}` : ""}` : s.field === "ein" ? `••-•••${String(s.proposed).replace(/\D/g, "").slice(-4)}` : String(s.proposed);
  return (
    <section className="space-y-3 rounded-lg border bg-card p-4">
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="mr-auto text-lg font-semibold text-foreground">Step 3 · Fund details from the documents</h2>
        {d.canManage && <Button size="sm" disabled={busy} onClick={readAll}>{busy ? progress ?? "Reading…" : "Read key documents"}</Button>}
      </div>
      <p className="text-xs text-muted-foreground">The AI reads the operating agreement, formation papers and subscription documents and suggests values. Nothing is saved until you accept it, and a value that's already filled in shows next to the suggestion.</p>
      {!d.suggestions.length && <p className="text-sm text-muted-foreground">No suggestions yet. Sort the files first, then click Read key documents.</p>}
      <ul className="divide-y">
        {open.map((s: any) => (
          <li key={s.id} className="flex flex-wrap items-center gap-2 py-2 text-sm">
            <div className="min-w-0 flex-1">
              <div className="text-foreground"><span className="font-medium">{FIELD[s.field] ?? s.field}:</span> {show(s)}</div>
              <div className="text-xs text-muted-foreground">
                From {s.source_file_name}{s.source_page ? `, page ${s.source_page}` : ""}{s.current_value !== null && s.current_value !== undefined && s.field !== "investor" ? ` · currently: ${String(s.current_value)}` : ""}
              </div>
            </div>
            {d.canManage && s.field === "investor" && <Input value={emails[s.id] ?? s.proposed.email ?? ""} onChange={(e) => setEmails({ ...emails, [s.id]: e.target.value })} placeholder="Investor email" aria-label="Investor email" className="h-8 w-56" />}
            {d.canManage && <><Button size="sm" onClick={() => act(s, true)}>Accept</Button><Button size="sm" variant="outline" onClick={() => act(s, false)}>Reject</Button></>}
          </li>
        ))}
      </ul>
      {decided.length > 0 && (
        <details className="text-sm">
          <summary className="cursor-pointer text-muted-foreground">Decided ({decided.length})</summary>
          <ul className="mt-2 space-y-1">{decided.map((s: any) => <li key={s.id} className="text-xs text-muted-foreground">{FIELD[s.field] ?? s.field}: {show(s)} · {s.status}</li>)}</ul>
        </details>
      )}
    </section>
  );
}
