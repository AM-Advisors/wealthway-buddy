import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import {
  checkInvestorFolder,
  connectInvestorFolder,
  disconnectInvestorFolder,
  getInvestorDriveIntake,
  importInvestorDriveFiles,
  searchInvestorFolders,
} from "@/lib/investor-drive.functions";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";

const TYPES: Record<string, string> = {
  subscription_agreement: "Subscription agreement",
  executed_subscription_agreement: "Executed subscription agreement",
  accreditation_evidence: "Accreditation evidence",
  side_letter: "Side letter",
  investor_correspondence: "Investor correspondence",
  other_investor: "Other approved investor document",
};

/** Investor 360 → Google Drive (read-only intake). Super Administrators only; hidden otherwise. */
export function InvestorDriveIntakeCard({ investorUserId }: { investorUserId: string }) {
  const load = useServerFn(getInvestorDriveIntake);
  const q = useQuery({ queryKey: ["investor-drive-intake", investorUserId], queryFn: () => load({ data: { investorUserId } }), retry: false });
  if (q.isError || !q.data || !q.data.rows.length) return null;
  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base">Google Drive</CardTitle>
        <CardDescription>
          Connect an existing folder in Restricted Investor Records and pull eligible documents into Harmonious. Nothing is imported until you choose to, and Drive never decides identity, compliance, ownership or access.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {!q.data.repositoryReady ? <p className="text-sm text-destructive">{q.data.unavailableMessage}</p> : null}
        {q.data.rows.map((r: any) => <Row key={`${r.offeringId}:${r.profileId}`} investorUserId={investorUserId} row={r} ready={q.data!.repositoryReady} />)}
      </CardContent>
    </Card>
  );
}

function Row({ investorUserId, row, ready }: { investorUserId: string; row: any; ready: boolean }) {
  const qc = useQueryClient();
  const refresh = () => qc.invalidateQueries({ queryKey: ["investor-drive-intake", investorUserId] });
  const search = useServerFn(searchInvestorFolders);
  const connect = useServerFn(connectInvestorFolder);
  const disconnect = useServerFn(disconnectInvestorFolder);
  const check = useServerFn(checkInvestorFolder);
  const doImport = useServerFn(importInvestorDriveFiles);
  const [term, setTerm] = useState("");
  const [hits, setHits] = useState<any[] | null>(null);
  const [pick, setPick] = useState<any | null>(null);
  const [scan, setScan] = useState<any | null>(null);
  const [chosen, setChosen] = useState<Record<string, string>>({});
  const err = (e: any) => toast.error(e?.message ?? "Something went wrong.");

  const m = useMutation({ mutationFn: async (fn: () => Promise<any>) => fn(), onError: err });
  const c = row.connection;
  const last = (c?.lastCheck ?? {}) as any;

  return (
    <div className="rounded-lg border p-3 space-y-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="font-medium">{row.fundName} · {row.profileLabel}</p>
          <p className="text-xs text-muted-foreground">
            {c ? <>Connected folder: {c.folderPath}</> : "Not connected"} · Repository: Restricted Investor Records
            {c?.lastCheckedAt ? <> · Last checked {new Date(c.lastCheckedAt).toLocaleString()}</> : null}
          </p>
        </div>
        <Badge variant={c ? "secondary" : "outline"}>{c ? "Connected" : "Not Connected"}</Badge>
      </div>
      {c ? (
        <p className="text-xs text-muted-foreground">
          Eligible found {last.found ?? "—"} · Already imported {last.imported ?? row.importedCount} · Changed in Drive {last.updated ?? "—"} · Needs review {last.needsReview ?? "—"} · Blocked {last.blocked ?? "—"}
        </p>
      ) : null}
      <div className="flex flex-wrap gap-2">
        {!c ? (
          <>
            <Input className="h-8 w-64" placeholder="Search folders in the restricted drive" value={term} onChange={(e) => setTerm(e.target.value)} disabled={!ready} />
            <Button size="sm" variant="outline" disabled={!ready || term.trim().length < 2 || m.isPending} onClick={() => m.mutate(async () => setHits(await search({ data: { q: term } })))}>Browse Drive</Button>
          </>
        ) : (
          <>
            <Button size="sm" variant="outline" disabled={!ready || m.isPending} onClick={() => m.mutate(async () => { const r = await check({ data: { connectionId: c.id } }); setScan(r); refresh(); })}>Check for Updates</Button>
            <Button size="sm" variant="ghost" disabled={m.isPending} onClick={() => { if (confirm("Disconnect this folder? Imported documents stay in Harmonious.")) m.mutate(async () => { await disconnect({ data: { connectionId: c.id } }); setScan(null); refresh(); }); }}>Disconnect Folder</Button>
          </>
        )}
      </div>
      {hits && !c ? (
        <div className="space-y-1">
          {!hits.length ? <p className="text-xs text-muted-foreground">No folders found inside the approved repository.</p> : null}
          {hits.map((h) => (
            <div key={h.folderId} className="flex items-center justify-between gap-2 rounded border p-2 text-sm">
              <span className="truncate">{h.path}</span>
              <Button size="sm" variant="outline" onClick={() => setPick(h)}>Select</Button>
            </div>
          ))}
        </div>
      ) : null}
      {pick && !c ? (
        <div className="rounded border border-primary/40 p-2 text-sm space-y-2">
          <p>Connect <strong>{pick.path}</strong> to {row.fundName} · {row.profileLabel}?</p>
          <p className="text-xs text-muted-foreground">No folder is created, renamed or shared. Only this fund and investment profile will be linked.</p>
          <div className="flex gap-2">
            <Button size="sm" disabled={m.isPending} onClick={() => m.mutate(async () => { await connect({ data: { investorUserId, offeringId: row.offeringId, profileId: row.profileId, folderId: pick.folderId, confirmPath: pick.path } }); toast.success("Folder connected."); setPick(null); setHits(null); refresh(); })}>Connect Investor Folder</Button>
            <Button size="sm" variant="ghost" onClick={() => setPick(null)}>Cancel</Button>
          </div>
        </div>
      ) : null}
      {scan && c ? (
        <div className="space-y-1">
          {scan.missingCount ? <p className="text-xs text-muted-foreground">{scan.missingCount} imported document(s) are no longer in Drive — the Harmonious copies are kept.</p> : null}
          {scan.items.map((i: any) => {
            const importable = i.status === "new" || i.status === "updated";
            return (
              <div key={i.driveFileId} className="flex flex-wrap items-center justify-between gap-2 rounded border p-2 text-sm">
                <div className="min-w-0">
                  <p className="truncate">{i.name}</p>
                  <p className="text-xs text-muted-foreground">{i.location ? `${i.location} · ` : ""}{i.label}</p>
                </div>
                {importable ? (
                  <select className="h-8 rounded border bg-background px-2 text-xs" value={chosen[i.driveFileId] ?? ""} onChange={(e) => setChosen((s) => ({ ...s, [i.driveFileId]: e.target.value }))}>
                    <option value="">Don't import</option>
                    {Object.entries(TYPES).map(([k, v]) => <option key={k} value={k}>{v}{k === i.proposal.documentType ? " (suggested)" : ""}</option>)}
                  </select>
                ) : null}
              </div>
            );
          })}
          <Button
            size="sm"
            disabled={m.isPending || !Object.values(chosen).some(Boolean)}
            onClick={() => m.mutate(async () => {
              const files = scan.items.filter((i: any) => chosen[i.driveFileId]).map((i: any) => ({ driveFileId: i.driveFileId, documentType: chosen[i.driveFileId], importAsNewVersion: i.status === "updated" }));
              const r = await doImport({ data: { connectionId: c.id, files } });
              const ok = r.results.filter((x: any) => x.ok).length;
              toast.success(`${ok} imported. ${r.results.length - ok} not imported.`);
              r.results.filter((x: any) => !x.ok).forEach((x: any) => toast.message(x.message));
              setChosen({});
              setScan(await check({ data: { connectionId: c.id } }));
              refresh();
            })}
          >
            Import Documents
          </Button>
          <p className="text-xs text-muted-foreground">Imported copies go to private Harmonious storage and need review. Classification is not approval — accreditation evidence does not mark anyone accredited.</p>
        </div>
      ) : null}
    </div>
  );
}
