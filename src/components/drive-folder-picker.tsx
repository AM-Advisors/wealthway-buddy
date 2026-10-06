import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useNavigate } from "@tanstack/react-router";
import { toast } from "sonner";
import { getFolderSources, searchDriveFolders, startDriveMigration } from "@/lib/drive-migration.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";

/** Choose the fund's Google folder: link/copy an existing one (then review the files) or create a new standard folder. */
export function DriveFolderPicker({ offeringId, onDone, label = "Choose folder" }: { offeringId: string; onDone?: () => void; label?: string }) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [trail, setTrail] = useState<{ id: string; name: string }[]>([]);
  const [busy, setBusy] = useState(false);
  const sourcesFn = useServerFn(getFolderSources);
  const searchFn = useServerFn(searchDriveFolders);
  const start = useServerFn(startDriveMigration);
  const navigate = useNavigate();
  const sources = useQuery({ queryKey: ["drive-folder-sources"], queryFn: () => sourcesFn(), enabled: open, retry: false });
  const parent = trail[trail.length - 1]?.id ?? null;
  const results = useQuery({
    queryKey: ["drive-folders", query, parent],
    queryFn: () => searchFn({ data: { query: query || null, parentId: parent } }),
    enabled: open && (!!query.trim() || !!parent), retry: false,
  });

  const go = async (folderId: string | null) => {
    setBusy(true);
    try {
      const r = await start({ data: { offeringId, folderId } });
      if (r.migrationId) {
        toast.success("Folder connected. Review the files next.");
        setOpen(false);
        onDone?.();
        void navigate({ to: "/ops/fund-migrate/$fundId", params: { fundId: offeringId } });
      } else if (r.status === "active") { toast.success("New fund folder created."); setOpen(false); onDone?.(); }
      else toast.error(r.error ?? "Google Drive needs attention.");
    } catch (e) { toast.error((e as Error).message); } finally { setBusy(false); }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild><Button size="sm" variant="outline">{label}</Button></DialogTrigger>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Choose the fund's Google folder</DialogTitle>
          <DialogDescription>
            Pick the folder this fund already uses, or create a new one. If it's outside the Harmonious Funds drive, its files are copied into a new standard folder and the original stays as it is.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="flex gap-2">
            <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search folders by name" aria-label="Search folders" />
            <Button variant="secondary" disabled={busy} onClick={() => go(null)}>Create new folder</Button>
          </div>
          {!query && (
            <div className="flex flex-wrap items-center gap-1 text-sm">
              <span className="text-muted-foreground">Browse:</span>
              {trail.length === 0
                ? (sources.data?.sources ?? []).map((s) => <Button key={s.id} size="sm" variant="ghost" onClick={() => setTrail([s])}>{s.name}</Button>)
                : <>
                    <button className="text-primary underline" onClick={() => setTrail([])}>All drives</button>
                    {trail.map((t, i) => <span key={t.id}> / <button className="text-primary underline" onClick={() => setTrail(trail.slice(0, i + 1))}>{t.name}</button></span>)}
                  </>}
              {sources.isLoading && <span className="text-muted-foreground">Loading…</span>}
              {sources.error && <span className="text-destructive">{(sources.error as Error).message}</span>}
            </div>
          )}
          <div className="max-h-96 overflow-y-auto rounded-md border">
            {results.isLoading && <p className="p-3 text-sm text-muted-foreground">Looking…</p>}
            {results.error && <p className="p-3 text-sm text-destructive">{(results.error as Error).message}</p>}
            {results.data && !results.data.length && <p className="p-3 text-sm text-muted-foreground">No folders here.</p>}
            {!results.data && !results.isLoading && <p className="p-3 text-sm text-muted-foreground">Search or pick a drive to browse.</p>}
            {(results.data ?? []).map((f) => (
              <div key={f.id} className="flex items-center gap-2 border-b p-2 last:border-0">
                <button className="min-w-0 flex-1 truncate text-left text-sm text-foreground hover:underline" onClick={() => { setQuery(""); setTrail([...(trail.length ? trail : []), { id: f.id, name: f.name }]); }}>{f.name}</button>
                {f.inFundsDrive ? <Badge variant="secondary">Funds drive</Badge> : <Badge variant="outline">Will copy</Badge>}
                {f.modifiedTime && <span className="hidden text-xs text-muted-foreground sm:inline">{new Date(f.modifiedTime).toLocaleDateString()}</span>}
                {f.linkedTo ? <Badge variant="destructive">Linked to {f.linkedTo}</Badge> : <Button size="sm" disabled={busy} onClick={() => go(f.id)}>Use this folder</Button>}
              </div>
            ))}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
