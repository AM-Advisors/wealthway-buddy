import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { FolderOpen } from "lucide-react";
import { getMarketingAssets, loadMarketingPreviews } from "@/lib/marketing-drive.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";

export type DriveAsset = { id: string; name: string; kind: string; theme: string | null; path: string; driveUrl: string | null; previewUrl: string | null };

/** Pick a file from the Marketing Google Drive folder, filtered by theme (top-level folder). */
export function MarketingDrivePicker({ kind, label = "From Google Drive", onPick, disabled }: { kind?: "image" | "sheet"; label?: string; onPick: (a: DriveAsset) => void | Promise<void>; disabled?: boolean }) {
  const [open, setOpen] = useState(false);
  const [theme, setTheme] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [previews, setPreviews] = useState<Record<string, string>>({});
  const list = useServerFn(getMarketingAssets);
  const load = useServerFn(loadMarketingPreviews);
  const q = useQuery({ queryKey: ["mk-drive", kind, theme, search], queryFn: () => list({ data: { kind: kind ?? null, theme, search: search || null } }), enabled: open, retry: false });
  const assets = q.data?.assets ?? [];
  const missing = assets.filter((a) => a.kind === "image" && !a.previewUrl && !previews[a.id]).slice(0, 24);
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild><Button type="button" size="sm" variant="outline" disabled={disabled}><FolderOpen className="mr-1 h-4 w-4" />{label}</Button></DialogTrigger>
      <DialogContent className="max-w-4xl">
        <DialogHeader>
          <DialogTitle>Marketing Google Drive</DialogTitle>
          <DialogDescription>Files from the shared Marketing folder. Themes are its top-level folders.{q.data?.lastSyncedAt ? ` Last synced ${new Date(q.data.lastSyncedAt).toLocaleString()}.` : " Not synced yet - use Sync on the Drive library page."}</DialogDescription>
        </DialogHeader>
        <div className="flex flex-wrap gap-1">
          <Button size="sm" variant={theme === null ? "default" : "outline"} onClick={() => setTheme(null)}>All</Button>
          {(q.data?.themes ?? []).map((t) => <Button key={t.name} size="sm" variant={theme === t.name ? "default" : "outline"} onClick={() => setTheme(t.name)}>{t.name} ({t.count})</Button>)}
        </div>
        <div className="flex gap-2">
          <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search file names" aria-label="Search Drive files" />
          {missing.length > 0 && <Button size="sm" variant="secondary" onClick={async () => { try { setPreviews({ ...previews, ...(await load({ data: { ids: missing.map((m) => m.id) } })) }); } catch (e) { console.error(e); } }}>Load previews</Button>}
        </div>
        <div className="grid max-h-[28rem] grid-cols-2 gap-2 overflow-y-auto sm:grid-cols-4">
          {q.isLoading && <p className="col-span-full text-sm text-muted-foreground">Loading…</p>}
          {q.error && <p className="col-span-full text-sm text-destructive">{(q.error as Error).message}</p>}
          {!q.isLoading && !assets.length && <p className="col-span-full text-sm text-muted-foreground">No files found.</p>}
          {assets.map((a) => {
            const src = a.previewUrl ?? previews[a.id];
            return (
              <button key={a.id} type="button" disabled={!!busy} className="flex flex-col overflow-hidden rounded-md border bg-card text-left hover:border-primary" onClick={async () => { setBusy(a.id); try { await onPick({ ...a, previewUrl: src ?? null }); setOpen(false); } finally { setBusy(null); } }}>
                <div className="flex aspect-square items-center justify-center bg-muted text-xs text-muted-foreground">
                  {src ? <img src={src} alt={a.name} className="h-full w-full object-cover" /> : a.kind === "image" ? "Image" : a.kind === "sheet" ? "Document" : a.kind}
                </div>
                <div className="space-y-1 p-2">
                  <div className="truncate text-xs font-medium text-foreground" title={a.name}>{busy === a.id ? "Adding…" : a.name}</div>
                  {a.theme && <Badge variant="outline" className="text-[10px]">{a.theme}</Badge>}
                </div>
              </button>
            );
          })}
        </div>
      </DialogContent>
    </Dialog>
  );
}
