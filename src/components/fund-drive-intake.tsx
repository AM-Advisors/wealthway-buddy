/**
 * Operations-only "Intake & match from Drive": scans the fund's Drive Investors folder and lets
 * Operations Approve, Review later or Reject each file on this screen. Approving saves through the
 * existing signed-outside and investor document engines; nothing is emailed.
 */
import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { FolderSync, ExternalLink } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { approveFundDriveFileFn, fundDriveFileLinkFn, scanFundDriveFn, setFundDriveDecisionFn } from "@/lib/fund-drive-intake.functions";
import { INTAKE_TARGETS, defaultSignedOn, rowStatus, type IntakeRow } from "@/lib/fund-drive-intake-model";

const STATUS: Record<ReturnType<typeof rowStatus>, { label: string; cls: string }> = {
  ready: { label: "Ready for Ops approval", cls: "border-primary/40 bg-primary/10 text-primary" },
  review: { label: "Needs review", cls: "border-accent bg-accent/20 text-foreground" },
  later: { label: "Review later", cls: "border-muted-foreground/30 text-muted-foreground" },
  added: { label: "Added", cls: "border-primary bg-primary text-primary-foreground" },
  rejected: { label: "Rejected", cls: "border-destructive/40 text-destructive" },
  unreadable: { label: "Can't be added", cls: "border-muted text-muted-foreground" },
};
type Filter = "open" | "later" | "added" | "rejected" | "all";
type Edit = { onboardingId: string | null; target: string | null; signedOn: string; title: string };

export function FundDriveIntakeButton({ fundId, onApplied }: { fundId: string; onApplied?: () => void }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button variant="outline" data-staff-only onClick={() => setOpen(true)}><FolderSync className="mr-1 h-4 w-4" />Intake &amp; match from Drive</Button>
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent side="right" className="w-full overflow-y-auto sm:max-w-[90vw]">
          <SheetHeader>
            <SheetTitle>Intake &amp; match from Drive</SheetTitle>
            <SheetDescription>Files from this fund's Google Drive Investors folder, matched to investors. Nothing is saved until you approve it. Investors are not emailed. Operations only.</SheetDescription>
          </SheetHeader>
          {open && <IntakeQueue fundId={fundId} onApplied={onApplied} />}
        </SheetContent>
      </Sheet>
    </>
  );
}

function IntakeQueue({ fundId, onApplied }: { fundId: string; onApplied?: (() => void) | undefined }) {
  const scan = useServerFn(scanFundDriveFn), approve = useServerFn(approveFundDriveFileFn), decide = useServerFn(setFundDriveDecisionFn), link = useServerFn(fundDriveFileLinkFn);
  const qc = useQueryClient();
  const [folderLink, setFolderLink] = useState<string | null>(null);
  const [linkDraft, setLinkDraft] = useState("");
  const key = ["fund-drive-intake", fundId, folderLink ?? ""];
  const q = useQuery({ queryKey: key, queryFn: () => scan({ data: { fundId, folderLink } }), staleTime: 60_000, retry: false });
  const [edits, setEdits] = useState<Record<string, Edit>>({});
  const [busy, setBusy] = useState<Record<string, boolean>>({});
  const [filter, setFilter] = useState<Filter>("open");
  const [search, setSearch] = useState("");
  const [bulk, setBulk] = useState(false);

  const rows = q.data?.rows ?? [];
  const edit = (r: IntakeRow): Edit => edits[r.fileId] ?? { onboardingId: r.onboardingId, target: r.target, signedOn: defaultSignedOn(r.modifiedTime), title: r.fileName.replace(/\.[a-z0-9]{2,5}$/i, "") };
  const statusOf = (r: IntakeRow) => rowStatus({ ...r, onboardingId: edit(r).onboardingId, target: edit(r).target as any });
  const patch = (id: string, r: IntakeRow, p: Partial<Edit>) => setEdits((e) => ({ ...e, [id]: { ...edit(r), ...p } }));
  const setRow = (fileId: string, p: Partial<IntakeRow>) => qc.setQueryData(key, (old: any) => old ? { ...old, rows: old.rows.map((x: IntakeRow) => x.fileId === fileId ? { ...x, ...p } : x) } : old);

  const counts = useMemo(() => {
    const c = { open: 0, later: 0, added: 0, rejected: 0, ready: 0, all: rows.length };
    for (const r of rows) { const s = statusOf(r); if (s === "ready" || s === "review") c.open++; if (s === "ready") c.ready++; if (s === "later") c.later++; if (s === "added") c.added++; if (s === "rejected") c.rejected++; }
    return c;
  }, [rows, edits]);
  const shown = rows.filter((r) => {
    const s = statusOf(r);
    const f = filter === "all" || (filter === "open" ? s === "ready" || s === "review" || s === "unreadable" : s === filter);
    const t = search.trim().toLowerCase();
    const label = q.data?.investors.find((i) => i.onboardingId === edit(r).onboardingId)?.label ?? "";
    return f && (!t || `${r.fileName} ${r.folderName} ${label}`.toLowerCase().includes(t));
  });

  async function doApprove(r: IntakeRow, quiet = false) {
    const e = edit(r);
    if (!e.onboardingId || !e.target) { if (!quiet) toast.error("Pick the investor and where it goes first."); return false; }
    setBusy((b) => ({ ...b, [r.fileId]: true }));
    try {
      await approve({ data: { fundId, fileId: r.fileId, onboardingId: e.onboardingId, target: e.target, signedOn: e.signedOn, title: e.title } });
      setRow(r.fileId, { decision: "approved", onboardingId: e.onboardingId, target: e.target as any });
      if (!quiet) toast.success(`Added ${r.fileName}`);
      return true;
    } catch (err: any) { toast.error(`${r.fileName}: ${err?.message ?? "Couldn't add"}`); return false; }
    finally { setBusy((b) => ({ ...b, [r.fileId]: false })); }
  }
  async function doDecide(r: IntakeRow, decision: "later" | "rejected") {
    const e = edit(r);
    setBusy((b) => ({ ...b, [r.fileId]: true }));
    try {
      await decide({ data: { fundId, fileId: r.fileId, fileName: r.fileName, decision, onboardingId: e.onboardingId, target: e.target } });
      setRow(r.fileId, { decision });
      toast.success(decision === "later" ? "Saved for later" : "Rejected. Nothing was added.");
    } catch (err: any) { toast.error(err?.message ?? "Couldn't save"); }
    finally { setBusy((b) => ({ ...b, [r.fileId]: false })); }
  }
  async function approveAll() {
    setBulk(true);
    const ready = rows.filter((r) => statusOf(r) === "ready");
    let ok = 0;
    for (const r of ready) if (await doApprove(r, true)) ok++;
    setBulk(false);
    toast.success(`Added ${ok} of ${ready.length} documents.`);
    onApplied?.();
  }
  async function preview(r: IntakeRow) {
    try { const { url } = await link({ data: { fileId: r.fileId } }); window.open(url, "_blank", "noopener"); } catch (err: any) { toast.error(err?.message ?? "Couldn't open"); }
  }

  const picker = (
    <form className="mt-4 flex flex-wrap items-center gap-2" onSubmit={(ev) => { ev.preventDefault(); setFolderLink(linkDraft.trim() || null); }}>
      <Input className="h-9 max-w-md" placeholder="Different folder? Paste the Drive Investors folder link" value={linkDraft} onChange={(e) => setLinkDraft(e.target.value)} />
      <Button size="sm" variant="outline" type="submit">Scan this folder</Button>
      {folderLink && <Button size="sm" variant="ghost" type="button" onClick={() => { setFolderLink(null); setLinkDraft(""); }}>Use the fund's folder</Button>}
    </form>
  );
  const body = (() => {
  if (q.isLoading) return <p className="mt-6 text-base text-muted-foreground">Reading the fund's Drive folder…</p>;
  if (q.error) return <div className="mt-6 space-y-2"><p className="text-base text-destructive">{(q.error as Error).message}</p><Button variant="outline" onClick={() => q.refetch()}>Try again</Button></div>;
  if (q.data?.note) return <p className="mt-6 text-base text-muted-foreground">{q.data.note}</p>;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        {(["open", "later", "added", "rejected", "all"] as Filter[]).map((f) => (
          <Button key={f} size="sm" variant={filter === f ? "default" : "outline"} onClick={() => setFilter(f)}>
            {{ open: "To review", later: "Review later", added: "Added", rejected: "Rejected", all: "All" }[f]} ({counts[f]})
          </Button>))}
        <Input className="h-9 w-56" placeholder="Search files or investors" value={search} onChange={(e) => setSearch(e.target.value)} />
        <div className="ml-auto flex gap-2">
          <Button variant="outline" size="sm" onClick={() => q.refetch()} disabled={q.isFetching}>Rescan Drive</Button>
          <Button size="sm" onClick={approveAll} disabled={bulk || counts.ready === 0}>{bulk ? "Adding…" : `Approve & populate all ready (${counts.ready})`}</Button>
        </div>
      </div>
      <p className="text-sm text-muted-foreground">Folder: {q.data?.folderName} · {rows.length} files. Subscription and operating agreements go to Signed before joining Harmonious; ID and entity papers go to Documents.</p>
      <div className="overflow-x-auto rounded-lg border">
        <table className="w-full text-sm">
          <thead className="bg-muted/50 text-left text-xs uppercase text-muted-foreground">
            <tr><th className="p-2">Investor</th><th className="p-2">File</th><th className="p-2">Goes to</th><th className="p-2">Signed on</th><th className="p-2">Status</th><th className="p-2 text-right">Action</th></tr>
          </thead>
          <tbody>
            {shown.length === 0 && <tr><td colSpan={6} className="p-6 text-center text-muted-foreground">Nothing here.</td></tr>}
            {shown.map((r) => {
              const e = edit(r), s = statusOf(r), locked = s === "added" || s === "unreadable", b = busy[r.fileId] || bulk;
              return (
                <tr key={r.fileId} className="border-t align-top">
                  <td className="p-2">
                    <select aria-label="Investor" className="w-56 rounded-md border bg-background p-1.5" disabled={locked} value={e.onboardingId ?? ""} onChange={(ev) => patch(r.fileId, r, { onboardingId: ev.target.value || null })}>
                      <option value="">Pick investor…</option>
                      {q.data?.investors.map((i) => <option key={i.onboardingId} value={i.onboardingId}>{i.label}</option>)}
                    </select>
                    <p className="mt-1 text-xs text-muted-foreground">Drive folder: {r.folderName}</p>
                  </td>
                  <td className="p-2">
                    <button type="button" className="inline-flex items-center gap-1 text-left font-medium hover:underline" onClick={() => preview(r)}>{r.fileName}<ExternalLink className="h-3 w-3 shrink-0" /></button>
                    {!locked && <Input className="mt-1 h-8" aria-label="Title" value={e.title} onChange={(ev) => patch(r.fileId, r, { title: ev.target.value })} />}
                  </td>
                  <td className="p-2">
                    <select aria-label="Goes to" className="w-60 rounded-md border bg-background p-1.5" disabled={locked} value={e.target ?? ""} onChange={(ev) => patch(r.fileId, r, { target: ev.target.value || null })}>
                      <option value="">Choose…</option>
                      {INTAKE_TARGETS.map((t) => <option key={t.key} value={t.key}>{t.label}</option>)}
                    </select>
                  </td>
                  <td className="p-2"><Input type="date" className="h-8 w-36" disabled={locked} value={e.signedOn} max={new Date().toISOString().slice(0, 10)} onChange={(ev) => patch(r.fileId, r, { signedOn: ev.target.value })} /></td>
                  <td className="p-2"><Badge variant="outline" className={STATUS[s].cls}>{STATUS[s].label}</Badge></td>
                  <td className="p-2">
                    {!locked && (
                      <div className="flex justify-end gap-1">
                        <Button size="sm" disabled={b || !e.onboardingId || !e.target} onClick={async () => { if (await doApprove(r)) onApplied?.(); }}>Approve</Button>
                        {s !== "later" && <Button size="sm" variant="outline" disabled={b} onClick={() => doDecide(r, "later")}>Review later</Button>}
                        {s !== "rejected" && <Button size="sm" variant="ghost" className="text-destructive" disabled={b} onClick={() => doDecide(r, "rejected")}>Reject</Button>}
                      </div>)}
                  </td>
                </tr>);
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
  })();
  return <>{picker}<div className="mt-4">{body}</div></>;
}
