import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { getMarketingAssets, getMarketingShareLinks, loadMarketingPreviews, syncMarketingDriveNow, createMarketingShareLink, revokeMarketingShareLink } from "@/lib/marketing-drive.functions";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

export const Route = createFileRoute("/_authenticated/marketing_/drive")({
  head: () => ({ meta: [
    { title: "Marketing Drive & sheets - Harmonious" },
    { name: "description", content: "Marketing's Google Drive library and tracked marketing sheets." },
    { property: "og:title", content: "Marketing Drive & sheets - Harmonious" },
    { property: "og:description", content: "Pick images and themes from Drive and share marketing sheets with tracking." },
    { property: "og:type", content: "website" },
    { name: "twitter:card", content: "summary" },
    { name: "robots", content: "noindex" },
  ] }),
  component: Page,
});

const AUD = [["prospect", "Prospect"], ["client", "Client"], ["investor", "Investor"], ["partner", "Partner"], ["other", "Other"]] as const;

function Page() {
  const [tab, setTab] = useState<"library" | "sheets" | "links">("library");
  return (
    <main className="mx-auto w-full max-w-6xl space-y-5 p-6">
      <header className="space-y-1">
        <h1 className="text-3xl">Drive library &amp; marketing sheets</h1>
        <p className="text-sm text-muted-foreground">Synced from the shared Marketing Google Drive folder about every hour (read-only - nothing in Drive changes). Contact lists, signatures, fonts and working folders are skipped.</p>
      </header>
      <div className="flex gap-2">
        <Button size="sm" variant={tab === "library" ? "default" : "outline"} onClick={() => setTab("library")}>Images &amp; themes</Button>
        <Button size="sm" variant={tab === "sheets" ? "default" : "outline"} onClick={() => setTab("sheets")}>Marketing sheets</Button>
        <Button size="sm" variant={tab === "links" ? "default" : "outline"} onClick={() => setTab("links")}>Shared links</Button>
      </div>
      {tab === "library" && <Library kind="image" />}
      {tab === "sheets" && <Library kind="sheet" />}
      {tab === "links" && <Links />}
    </main>
  );
}

function Library({ kind }: { kind: "image" | "sheet" }) {
  const list = useServerFn(getMarketingAssets);
  const sync = useServerFn(syncMarketingDriveNow);
  const load = useServerFn(loadMarketingPreviews);
  const qc = useQueryClient();
  const [theme, setTheme] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [busy, setBusy] = useState(false);
  const [previews, setPreviews] = useState<Record<string, string>>({});
  const [sharing, setSharing] = useState<string | null>(null);
  const q = useQuery({ queryKey: ["mk-drive", kind, theme, search], queryFn: () => list({ data: { kind, theme, search: search || null } }), retry: false });
  const assets = q.data?.assets ?? [];
  const missing = assets.filter((a) => a.kind === "image" && !a.previewUrl && !previews[a.id]).slice(0, 24);
  return (
    <section className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search" aria-label="Search files" className="max-w-xs" />
        {missing.length > 0 && <Button size="sm" variant="secondary" onClick={async () => setPreviews({ ...previews, ...(await load({ data: { ids: missing.map((m) => m.id) } })) })}>Load previews</Button>}
        <span className="ml-auto text-xs text-muted-foreground">{q.data?.lastSyncedAt ? `Last synced ${new Date(q.data.lastSyncedAt).toLocaleString()}` : "Not synced yet"}</span>
        <Button size="sm" disabled={busy} onClick={async () => { setBusy(true); try { const r = await sync(); toast.success(`Synced ${r.files} files from ${r.folders} folders.`); void qc.invalidateQueries({ queryKey: ["mk-drive"] }); } catch (e) { toast.error((e as Error).message); } finally { setBusy(false); } }}>{busy ? "Syncing…" : "Sync now"}</Button>
      </div>
      <div className="flex flex-wrap gap-1">
        <Button size="sm" variant={theme === null ? "default" : "outline"} onClick={() => setTheme(null)}>All themes</Button>
        {(q.data?.themes ?? []).map((t) => <Button key={t.name} size="sm" variant={theme === t.name ? "default" : "outline"} onClick={() => setTheme(t.name)}>{t.name}</Button>)}
      </div>
      {q.error && <p className="text-sm text-destructive">{(q.error as Error).message}</p>}
      {!q.isLoading && !assets.length && <p className="text-sm text-muted-foreground">Nothing here yet. Click Sync now.</p>}
      <div className={kind === "image" ? "grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-6" : "space-y-2"}>
        {assets.map((a) => kind === "image" ? (
          <div key={a.id} className="overflow-hidden rounded-md border bg-card">
            <div className="flex aspect-square items-center justify-center bg-muted text-xs text-muted-foreground">{(a.previewUrl ?? previews[a.id]) ? <img src={(a.previewUrl ?? previews[a.id])!} alt={a.name} className="h-full w-full object-cover" /> : "Image"}</div>
            <div className="space-y-1 p-2">
              <div className="truncate text-xs font-medium text-foreground" title={a.name}>{a.name}</div>
              <div className="truncate text-[10px] text-muted-foreground">{a.path}</div>
              {a.driveUrl && <a className="text-[10px] text-primary underline" href={a.driveUrl} target="_blank" rel="noreferrer">Open in Drive</a>}
            </div>
          </div>
        ) : (
          <div key={a.id} className="rounded-md border bg-card p-3 text-sm">
            <div className="flex flex-wrap items-center gap-2">
              <div className="mr-auto min-w-0"><div className="truncate font-medium text-foreground">{a.name}</div><div className="text-xs text-muted-foreground">{a.path}</div></div>
              {a.driveUrl && <Button asChild size="sm" variant="ghost"><a href={a.driveUrl} target="_blank" rel="noreferrer">Open in Drive</a></Button>}
              <Button size="sm" onClick={() => setSharing(sharing === a.id ? null : a.id)}>Share</Button>
            </div>
            {sharing === a.id && <ShareForm assetId={a.id} onDone={() => setSharing(null)} />}
          </div>
        ))}
      </div>
    </section>
  );
}

function ShareForm({ assetId, onDone }: { assetId: string; onDone: () => void }) {
  const create = useServerFn(createMarketingShareLink);
  const qc = useQueryClient();
  const [aud, setAud] = useState<string>("prospect");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [url, setUrl] = useState<string | null>(null);
  return (
    <div className="mt-2 space-y-2 rounded-md bg-muted/40 p-2">
      <div className="grid gap-2 sm:grid-cols-4">
        <Select value={aud} onValueChange={setAud}><SelectTrigger aria-label="Audience"><SelectValue /></SelectTrigger><SelectContent>{AUD.map(([k, l]) => <SelectItem key={k} value={k}>{l}</SelectItem>)}</SelectContent></Select>
        <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Recipient name (optional)" aria-label="Recipient name" />
        <Input value={email} onChange={(e) => setEmail(e.target.value)} placeholder="Recipient email (optional)" aria-label="Recipient email" />
        <Button onClick={async () => { try { const r = await create({ data: { assetId, audience: aud as any, recipientName: name || null, recipientEmail: email || null } }); setUrl(r.url); void navigator.clipboard?.writeText(r.url).catch(() => null); toast.success("Tracked link copied."); void qc.invalidateQueries({ queryKey: ["mk-links"] }); } catch (e) { toast.error((e as Error).message); } }}>Create tracked link</Button>
      </div>
      {url && <div className="flex items-center gap-2 text-xs"><Input readOnly value={url} aria-label="Share link" /><Button size="sm" variant="ghost" onClick={onDone}>Done</Button></div>}
      <p className="text-xs text-muted-foreground">One link per recipient lets you see who opened it. To attach this sheet to a campaign email instead, add it under Attachments in the email editor.</p>
    </div>
  );
}

function Links() {
  const list = useServerFn(getMarketingShareLinks);
  const revoke = useServerFn(revokeMarketingShareLink);
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ["mk-links"], queryFn: () => list(), retry: false });
  return (
    <section className="overflow-x-auto">
      {q.error && <p className="text-sm text-destructive">{(q.error as Error).message}</p>}
      <table className="w-full text-sm">
        <thead><tr className="text-left text-xs text-muted-foreground"><th className="py-1">Sheet</th><th>Recipient</th><th>Audience</th><th>Opens</th><th>Last opened</th><th /></tr></thead>
        <tbody>
          {(q.data ?? []).map((l) => (
            <tr key={l.id} className="border-t">
              <td className="py-2 pr-2 font-medium text-foreground">{l.fileName}</td>
              <td className="pr-2">{l.recipient ?? "-"}</td>
              <td className="pr-2 capitalize">{l.audience}</td>
              <td className="pr-2">{l.views}</td>
              <td className="pr-2 text-xs text-muted-foreground">{l.lastViewedAt ? new Date(l.lastViewedAt).toLocaleString() : "Not yet"}</td>
              <td className="text-right">
                {l.revoked ? <Badge variant="outline">Revoked</Badge> : <>
                  <Button size="sm" variant="ghost" onClick={() => { void navigator.clipboard?.writeText(l.url); toast.success("Copied."); }}>Copy</Button>
                  <Button size="sm" variant="ghost" onClick={async () => { await revoke({ data: { id: l.id } }); void qc.invalidateQueries({ queryKey: ["mk-links"] }); }}>Revoke</Button>
                </>}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {q.data && !q.data.length && <p className="py-3 text-sm text-muted-foreground">No shared links yet.</p>}
    </section>
  );
}
