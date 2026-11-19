import { fillSummary } from "@/lib/investor-profile-fill-model";
import { useEffect, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { FolderOpen, Loader2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { FundFieldReview } from "@/components/fund-setup-ai-reader";
import {
  applyFundIntakeInvestorFn, fundIntakeReviewFn, listFundIntakeRunsFn, readFundIntakeBatchFn, saveFundIntakeDocumentFn, setFundIntakeSortFn, startFundIntakeFn,
} from "@/lib/fund-intake.functions";
import { INVESTOR_FILE_LABEL, parseFolderLink, type InvestorFileKind } from "@/lib/fund-intake-model";
import { DOC_KIND_LABEL } from "@/lib/fund-doc-extract-model";
import { invalidateFund } from "@/lib/fund-query-keys";
import { fmtDate } from "@/components/fund-tabs/shared";

const SORT_LABEL = { fund: "Fund document", investor: "Investor form", skip: "Don't use" } as const;
const STATUS_LABEL: Record<string, string> = { listed: "Waiting", reading: "Reading", read: "Read", failed: "Couldn't read", skipped: "Not used" };

/** Staff: paste shared folder links, read every file with AI, approve what saves. */
export function FundFolderIntake({ offeringId }: { offeringId: string }) {
  const start = useServerFn(startFundIntakeFn);
  const listRuns = useServerFn(listFundIntakeRunsFn);
  const runsQ = useQuery({ queryKey: ["fund-intake-runs", offeringId], queryFn: () => listRuns({ data: { offeringId } }), retry: false });
  const [links, setLinks] = useState("");
  const [busy, setBusy] = useState(false);
  const [runId, setRunId] = useState<string | null>(null);
  useEffect(() => { if (!runId && runsQ.data?.[0]) setRunId(runsQ.data[0].id); }, [runsQ.data, runId]);
  if (runsQ.isError) return null; // not staff
  const list = links.split(/[\s,]+/).filter(Boolean);
  const invalid = list.filter((l) => !parseFolderLink(l));
  const go = async () => {
    setBusy(true);
    try {
      const r = await start({ data: { offeringId, links: list } });
      toast.success(`Found ${r.files} files${r.capped ? " (the first 150)" : ""}. Reading them now.`);
      setRunId(r.runId); setLinks(""); void runsQ.refetch();
    } catch (e) { toast.error((e as Error).message); } finally { setBusy(false); }
  };
  return (
    <Card data-staff-only>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-lg"><FolderOpen className="h-5 w-5 text-accent" /> Pull from a folder</CardTitle>
        <CardDescription className="text-base">
          Paste a shared folder link, or several (one for fund documents, one for investors). We read every PDF and photo, suggest the fund's details, documents and investors, and save only what you approve. No emails go out.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-wrap gap-2">
          <Input className="min-w-[280px] flex-1 text-base" placeholder="Paste a shared folder link" value={links} onChange={(e) => setLinks(e.target.value)} aria-label="Shared folder links" />
          <Button disabled={busy || !list.length || invalid.length > 0} onClick={go}>{busy ? "Finding files…" : "Pull files"}</Button>
        </div>
        {invalid.length > 0 && <p className="text-sm text-destructive">That isn't a shared folder link we can read. Use a Google Drive folder link or a shared folder link.</p>}
        {(runsQ.data?.length ?? 0) > 1 && (
          <Select value={runId ?? ""} onValueChange={setRunId}>
            <SelectTrigger className="max-w-xs"><SelectValue placeholder="Earlier pulls" /></SelectTrigger>
            <SelectContent>{runsQ.data!.map((r) => <SelectItem key={r.id} value={r.id}>Pulled {fmtDate(r.created_at)}</SelectItem>)}</SelectContent>
          </Select>
        )}
        {runId && <IntakeRun offeringId={offeringId} runId={runId} />}
      </CardContent>
    </Card>
  );
}

function IntakeRun({ offeringId, runId }: { offeringId: string; runId: string }) {
  const review = useServerFn(fundIntakeReviewFn);
  const readBatch = useServerFn(readFundIntakeBatchFn);
  const setSort = useServerFn(setFundIntakeSortFn);
  const saveDoc = useServerFn(saveFundIntakeDocumentFn);
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ["fund-intake", runId], queryFn: () => review({ data: { runId } }) });
  const d: any = q.data;
  const reading = useRef(false);
  const [busy, setBusy] = useState<string | null>(null);
  const waiting = d?.counts?.waiting ?? 0;
  useEffect(() => {
    if (!waiting || reading.current) return;
    reading.current = true;
    let live = true;
    (async () => {
      try {
        for (let i = 0; i < 80 && live; i++) {
          const r = await readBatch({ data: { runId } });
          await q.refetch();
          if (!r.remaining) break;
        }
      } catch (e) { toast.error((e as Error).message); } finally { reading.current = false; }
    })();
    return () => { live = false; };
  }, [waiting, runId]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!d) return <p className="text-sm text-muted-foreground"><Loader2 className="mr-1 inline h-4 w-4 animate-spin" />Loading files…</p>;
  const c = d.counts;
  const act = async (id: string, fn: () => Promise<unknown>, ok?: string) => {
    setBusy(id);
    try { await fn(); if (ok) toast.success(ok); await q.refetch(); invalidateFund(qc, offeringId); } catch (e) { toast.error((e as Error).message.replace(/^Forbidden:\s*/, "")); } finally { setBusy(null); }
  };
  const fundFiles = d.files.filter((f: any) => f.sort === "fund" && f.status === "read");
  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-2 text-sm">
        {waiting > 0 && <Badge><Loader2 className="mr-1 h-3 w-3 animate-spin" />Reading {c.read} of {c.total - c.skipped}</Badge>}
        <Badge variant="secondary">{c.read} read</Badge>
        {c.failed > 0 && <Badge variant="destructive">{c.failed} couldn't be read</Badge>}
        {c.skipped > 0 && <Badge variant="outline">{c.skipped} not used</Badge>}
        {d.run.origin && <Badge variant="outline">{d.run.origin === "migration" ? "Migration fund: signed copies are kept as earlier signed records" : "New fund"}</Badge>}
      </div>

      <details className="rounded-md border p-3">
        <summary className="cursor-pointer text-base font-semibold">Files found ({c.total})</summary>
        <ul className="mt-2 divide-y">
          {d.files.map((f: any) => (
            <li key={f.id} className="flex flex-wrap items-center gap-2 py-2 text-sm">
              <span className="min-w-0 flex-1 break-all"><span className="text-muted-foreground">{f.folder ? `${f.folder}/` : ""}</span>{f.name}</span>
              <Badge variant={f.status === "failed" ? "destructive" : "outline"}>{STATUS_LABEL[f.status]}</Badge>
              {f.error && <span className="text-xs text-muted-foreground">{f.error}</span>}
              <Select value={f.sort} onValueChange={(v) => act(f.id, () => setSort({ data: { fileId: f.id, sort: v as any } }))}>
                <SelectTrigger className="h-8 w-40" aria-label={`How to use ${f.name}`}><SelectValue /></SelectTrigger>
                <SelectContent>{(Object.keys(SORT_LABEL) as (keyof typeof SORT_LABEL)[]).map((k) => <SelectItem key={k} value={k}>{SORT_LABEL[k]}</SelectItem>)}</SelectContent>
              </Select>
            </li>
          ))}
        </ul>
      </details>

      {d.fieldRows.length > 0 && (
        <section className="space-y-2">
          <h3 className="text-lg font-semibold">Fund details</h3>
          <FundFieldReview offeringId={offeringId} rows={d.fieldRows} multiClass={d.hasMultipleClasses} resetKey={runId} />
        </section>
      )}

      {fundFiles.length > 0 && (
        <section className="space-y-2">
          <h3 className="text-lg font-semibold">Fund documents</h3>
          <p className="text-sm text-muted-foreground">Saving adds a new version on Documents. It still needs approval there before investors see it.</p>
          <ul className="divide-y rounded-md border">
            {fundFiles.map((f: any) => (
              <li key={f.id} className="flex flex-wrap items-center gap-2 p-3 text-sm">
                <span className="flex-1 font-medium">{f.name}</span>
                {f.documentKind && <Badge variant="secondary">{(DOC_KIND_LABEL as any)[f.documentKind] ?? f.documentKind}</Badge>}
                {f.savedDocument ? <Badge variant="outline">Saved to Documents</Badge>
                  : <Button size="sm" disabled={busy === f.id} onClick={() => act(f.id, () => saveDoc({ data: { fileId: f.id } }), "Saved to Documents for approval.")}>Save to Documents</Button>}
              </li>
            ))}
          </ul>
        </section>
      )}

      {d.investors.length > 0 && (
        <section className="space-y-2">
          <h3 className="text-lg font-semibold">Investors ({d.investors.length})</h3>
          <p className="text-sm text-muted-foreground">Every page of each document is read. Adding saves the investor with every detail found and no invitation; matching fills in what their record is missing and sends anything different to review. Their files go to their record for review; signed subscriptions are kept as earlier signed copies. Identity documents still go through Verification.</p>
          <div className="space-y-2">{d.investors.map((g: any) => <InvestorRow key={g.key} g={g} runId={runId} existing={d.existing} onDone={() => void q.refetch()} />)}</div>
        </section>
      )}
    </div>
  );
}

function InvestorRow({ g, runId, existing, onDone }: { g: any; runId: string; existing: { onboardingId: string; name: string }[]; onDone: () => void }) {
  const apply = useServerFn(applyFundIntakeInvestorFn);
  const inv = g.investor;
  const [type, setType] = useState<"individual" | "trust" | "entity">(inv.entityName ? (inv.profileType === "trust" ? "trust" : "entity") : "individual");
  const [legalName, setLegalName] = useState(inv.entityName ?? "");
  const [matchId, setMatchId] = useState<string>(g.match?.onboardingId ?? "");
  const [busy, setBusy] = useState(false);
  const [needsConfirm, setNeedsConfirm] = useState(false);
  const name = [inv.firstName, inv.lastName].filter(Boolean).join(" ") || inv.entityName || inv.email || "Unnamed";
  const run = async (action: "add" | "match" | "skip", confirmedNew = false) => {
    setBusy(true);
    try {
      const r: any = await apply({ data: { runId, key: g.key, action, onboardingId: action === "match" ? matchId : null, profileType: type, legalName: type === "individual" ? null : legalName, confirmedNew } });
      if (action !== "skip") toast.success(`${action === "add" ? "Added" : "Matched"} ${name}. ${r.filed} file${r.filed === 1 ? "" : "s"} filed.${r.profile ? ` ${fillSummary(r.profile)}` : ""}`, { duration: 10_000 });
      if (r.problems?.length) toast.error(r.problems.join(" · "));
      onDone();
    } catch (e) {
      const m = (e as Error).message.replace(/^Forbidden:\s*/, "");
      if (/possible match|already|same person|confirm/i.test(m) && action === "add") setNeedsConfirm(true);
      toast.error(m);
    } finally { setBusy(false); }
  };
  const done = g.decided && g.decided.action !== "skipped";
  return (
    <div className="space-y-2 rounded-md border p-3">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-base font-medium">{name}</span>
        {inv.entityName && inv.firstName && <span className="text-sm text-muted-foreground">({inv.firstName} {inv.lastName})</span>}
        {g.match && !done && <Badge variant="secondary">Looks like {g.match.name}, already on the fund</Badge>}
        {done && <Badge variant="outline">{g.decided.action === "added" ? "Added" : "Matched"}</Badge>}
        {g.decided?.action === "skipped" && <Badge variant="outline">Skipped</Badge>}
      </div>
      <p className="text-sm text-muted-foreground">
        {[inv.email ?? "No email", inv.phone, [inv.addressLine1, inv.city, inv.region, inv.postalCode].filter(Boolean).join(", "), inv.citizenship ? `Citizenship ${inv.citizenship}` : null,
          inv.amount ? `Amount $${Number(inv.amount).toLocaleString()}` : null, inv.commitment ? `Commitment $${Number(inv.commitment).toLocaleString()}` : null, inv.investmentDate ? `Dated ${inv.investmentDate}` : null].filter(Boolean).join(" · ")}
      </p>
      {(inv.related ?? []).length > 0 && (
        <p className="text-sm text-muted-foreground">Owners and signers: {(inv.related as any[]).map((p) => `${p.firstName} ${p.lastName}${p.ownershipPercent ? ` (${p.ownershipPercent}%)` : ""}${p.isSigner ? ", signs" : ""}`).join(" · ")}</p>
      )}
      <div className="flex flex-wrap gap-1">{g.files.map((f: any) => <Badge key={f.fileId} variant="outline" title={f.fileName}>{INVESTOR_FILE_LABEL[f.kind as InvestorFileKind]}: {f.fileName}</Badge>)}</div>
      {!done && (
        <div className="flex flex-wrap items-center gap-2">
          <Select value={type} onValueChange={(v) => setType(v as any)}>
            <SelectTrigger className="h-9 w-44"><SelectValue /></SelectTrigger>
            <SelectContent><SelectItem value="individual">As an individual</SelectItem><SelectItem value="trust">Through a trust</SelectItem><SelectItem value="entity">Through a company</SelectItem></SelectContent>
          </Select>
          {type !== "individual" && <Input className="h-9 w-56" placeholder="Legal name" value={legalName} onChange={(e) => setLegalName(e.target.value)} />}
          <Button size="sm" disabled={busy} onClick={() => run("add")}>Add to fund</Button>
          {needsConfirm && <Button size="sm" variant="outline" disabled={busy} onClick={() => run("add", true)}>This is a new person, add anyway</Button>}
          {existing.length > 0 && (
            <>
              <Select value={matchId} onValueChange={setMatchId}>
                <SelectTrigger className="h-9 w-56"><SelectValue placeholder="Or match to…" /></SelectTrigger>
                <SelectContent>{existing.map((e) => <SelectItem key={e.onboardingId} value={e.onboardingId}>{e.name}</SelectItem>)}</SelectContent>
              </Select>
              <Button size="sm" variant="outline" disabled={busy || !matchId} onClick={() => run("match")}>Match and file</Button>
            </>
          )}
          <Button size="sm" variant="ghost" disabled={busy} onClick={() => run("skip")}>Skip</Button>
        </div>
      )}
    </div>
  );
}
