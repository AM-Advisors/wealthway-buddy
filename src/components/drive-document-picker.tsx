import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { ChevronRight, FileText, Folder, HardDrive, Loader2 } from "lucide-react";
import { toast } from "sonner";

import { browseDriveFn, downloadDriveFileFn } from "@/lib/investor-record.functions";
import { MAX_PICK_FILES, type DriveCrumb, type DriveEntry } from "@/lib/drive-picker-model";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";

type View = { crumbs: DriveCrumb[]; entries: DriveEntry[]; suggestions: DriveEntry[]; searched: string | null; note: string | null };

function toFile(name: string, mimeType: string, base64: string) {
  const bin = atob(base64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new File([bytes], name, { type: mimeType });
}

/** Harmonious-only: browse the team's shared Google Drives, pick an investor's files and hand them to the AI reader. */
export function DriveDocumentPicker({ onboardingId, disabled, onPicked }: { onboardingId: string; disabled?: boolean; onPicked: (files: File[]) => Promise<void> | void }) {
  const browse = useServerFn(browseDriveFn);
  const download = useServerFn(downloadDriveFileFn);
  const [open, setOpen] = useState(false);
  const [view, setView] = useState<View | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [picked, setPicked] = useState<Map<string, DriveEntry>>(new Map());
  const [fetching, setFetching] = useState<string | null>(null);

  async function go(input: { folderId?: string | null; search?: string; start?: boolean }) {
    setLoading(true); setError(null);
    try {
      const v = await browse({ data: { onboardingId, folderId: input.folderId ?? null, search: input.search ?? null, start: input.start } });
      setView((prev) => ({ ...v, suggestions: input.start ? v.suggestions : prev?.suggestions ?? [] }));
    } catch (e) { setError((e as Error).message); } finally { setLoading(false); }
  }

  useEffect(() => { if (open && !view) void go({ start: true }); }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  function toggle(e: DriveEntry) {
    setPicked((m) => {
      const n = new Map(m);
      if (n.has(e.id)) n.delete(e.id);
      else if (n.size >= MAX_PICK_FILES) { toast.error(`Pick up to ${MAX_PICK_FILES} files at a time.`); return m; }
      else n.set(e.id, e);
      return n;
    });
  }

  async function readPicked() {
    const files: File[] = [];
    for (const e of picked.values()) {
      setFetching(e.name);
      try {
        const f = await download({ data: { onboardingId, fileId: e.id } });
        files.push(toFile(f.fileName, f.mimeType, f.base64));
      } catch (err) { toast.error((err as Error).message); }
    }
    setFetching(null);
    if (!files.length) return;
    setOpen(false); setPicked(new Map());
    await onPicked(files);
  }

  const crumbs = view?.crumbs ?? [];
  return (
    <>
      <Button variant="outline" disabled={disabled} onClick={() => setOpen(true)}><HardDrive className="mr-1 h-4 w-4" />From Google Drive</Button>
      <Dialog open={open} onOpenChange={(o) => { if (!fetching) setOpen(o); }}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Pick documents from Google Drive</DialogTitle>
            <DialogDescription>Open the investor's folder in the Harmonious team drive, tick the files, then read them with AI. Nothing in Drive is changed.</DialogDescription>
          </DialogHeader>

          <form className="flex gap-2" onSubmit={(e) => { e.preventDefault(); if (search.trim()) void go({ search }); }}>
            <Input aria-label="Search Drive or paste a folder link" placeholder="Search by investor or file name, or paste a Drive folder link" value={search} maxLength={300} onChange={(e) => setSearch(e.target.value)} />
            <Button type="submit" variant="secondary" disabled={loading || !search.trim()}>Search</Button>
          </form>

          {(view?.suggestions.length ?? 0) > 0 && (
            <div className="flex flex-wrap items-center gap-2 text-sm">
              <span className="text-muted-foreground">Folders matching this investor:</span>
              {view!.suggestions.map((s) => <Button key={s.id} size="sm" variant="outline" className="h-7" onClick={() => void go({ folderId: s.id })}><Folder className="mr-1 h-3.5 w-3.5" />{s.name}</Button>)}
            </div>
          )}

          <nav aria-label="Drive folders" className="flex flex-wrap items-center gap-1 text-sm">
            <Button size="sm" variant="link" className="h-auto p-0" onClick={() => { setSearch(""); void go({ folderId: null }); }}>All shared drives</Button>
            {view?.searched && <><ChevronRight className="h-3.5 w-3.5 text-muted-foreground" /><span>Search: “{view.searched}”</span></>}
            {crumbs.map((c, i) => (
              <span key={c.id} className="flex items-center gap-1">
                <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />
                {i === crumbs.length - 1 ? <span className="font-medium">{c.name}</span> : <Button size="sm" variant="link" className="h-auto p-0" onClick={() => void go({ folderId: c.id })}>{c.name}</Button>}
              </span>
            ))}
          </nav>
          {view?.note && <p className="text-xs text-muted-foreground">{view.note}</p>}

          <div className="h-80 overflow-y-auto rounded-md border">
            {loading ? <p className="flex items-center gap-2 p-4 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" />Opening…</p>
              : error ? <p className="p-4 text-sm text-destructive">{error}</p>
              : !view?.entries.length ? <p className="p-4 text-sm text-muted-foreground">{view?.searched ? "Nothing found." : "This folder is empty."}</p>
              : <ul className="divide-y">{view.entries.map((e) => e.kind === "folder" ? (
                <li key={e.id}>
                  <button type="button" className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-muted" onClick={() => void go({ folderId: e.id })}>
                    <Folder className="h-4 w-4 text-primary" /><span className="flex-1">{e.name}</span><ChevronRight className="h-4 w-4 text-muted-foreground" />
                  </button>
                </li>
              ) : (
                <li key={e.id}>
                  <label className={`flex items-center gap-2 px-3 py-2 text-sm ${e.readable ? "cursor-pointer hover:bg-muted" : "opacity-60"}`}>
                    <input type="checkbox" disabled={!e.readable} checked={picked.has(e.id)} onChange={() => toggle(e)} aria-label={`Pick ${e.name}`} />
                    <FileText className="h-4 w-4 text-muted-foreground" />
                    <span className="flex-1">{e.name}</span>
                    {e.why ? <span className="text-xs text-muted-foreground">{e.why}</span> : e.size ? <span className="text-xs text-muted-foreground">{Math.max(1, Math.round(e.size / 1024))} KB</span> : null}
                  </label>
                </li>
              ))}</ul>}
          </div>

          <DialogFooter className="items-center gap-2 sm:justify-between">
            <span className="text-sm text-muted-foreground">{picked.size ? <Badge variant="secondary">{picked.size} picked</Badge> : "Tick the files to read."}</span>
            <div className="flex gap-2">
              <Button variant="ghost" disabled={!!fetching} onClick={() => setOpen(false)}>Cancel</Button>
              <Button disabled={!picked.size || !!fetching} onClick={() => void readPicked()}>{fetching ? `Getting ${fetching}…` : `Read ${picked.size || ""} with AI`.replace("  ", " ")}</Button>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
