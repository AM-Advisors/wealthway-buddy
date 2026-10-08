import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { STUDIO_STATUSES, STUDIO_STATUS_LABEL, isLocked, type StudioStatus } from "@/lib/marketing-studio-model";
import { commentStudioItem, duplicateStudioItem, getStudio, getStudioItem, moveStudioItem, saveStudioItem } from "@/lib/marketing-studio.functions";

export type Series = { key: string; name: string; weekday: number; intention: string; purpose: string; voice: string; outputs: string[]; sources: string[]; color: string; guardrail: string | null };
export type Item = any;

export function useStudio(from: Date, to: Date) {
  const load = useServerFn(getStudio);
  return useQuery({ queryKey: ["studio", from.toISOString(), to.toISOString()], queryFn: () => load({ data: { from: from.toISOString(), to: to.toISOString() } }) });
}

export function SeriesChip({ s, short }: { s?: Series; short?: boolean }) {
  if (!s) return null;
  return (
    <span className="inline-flex items-center gap-1.5 rounded-sm border border-border bg-card px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider">
      <span className="h-2 w-2 rounded-full" style={{ background: s.color }} />
      {short ? s.intention : `${s.name} · ${s.intention}`}
    </span>
  );
}

export function StatusPill({ status }: { status: string }) {
  const i = STUDIO_STATUSES.indexOf(status as StudioStatus);
  const tone = i >= 9 ? "bg-primary text-primary-foreground" : i >= 7 ? "bg-accent text-accent-foreground" : i >= 5 ? "bg-secondary text-secondary-foreground" : "bg-muted text-muted-foreground";
  return <span className={`rounded-sm px-1.5 py-0.5 text-[10px] font-medium ${tone}`}>{STUDIO_STATUS_LABEL[status as StudioStatus] ?? status}</span>;
}

export function SampleTag() {
  return <span className="rounded-sm border border-dashed border-muted-foreground/50 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Sample</span>;
}

const list = (s: string) => s.split(",").map((x) => x.trim()).filter(Boolean);
const toLocal = (iso: string | null) => (iso ? new Date(new Date(iso).getTime() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 16) : "");

/** Item editor: all planning fields, workflow buttons, comments and history. Server enforces every rule. */
export function ItemDrawer({ id, series, people, open, onClose, draft }: {
  id: string | null; series: Series[]; people: Record<string, string>; open: boolean; onClose: () => void; draft?: Partial<Item>;
}) {
  const qc = useQueryClient();
  const loadItem = useServerFn(getStudioItem), save = useServerFn(saveStudioItem), move = useServerFn(moveStudioItem);
  const dup = useServerFn(duplicateStudioItem), addComment = useServerFn(commentStudioItem);
  const q = useQuery({ queryKey: ["studio-item", id], queryFn: () => loadItem({ data: { id: id! } }), enabled: !!id && open });
  const [f, setF] = useState<Item>({});
  const [note, setNote] = useState("");
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => { if (q.data?.item) setF(q.data.item); else if (!id) setF({ series_key: series[0]?.key, platforms: ["linkedin"], keywords: [], source_urls: [], ...draft }); }, [q.data, id, open]);
  const item = q.data?.item;
  const locked = item ? isLocked(item.status) : false;
  const s = series.find((x) => x.key === f.series_key);
  const refresh = () => { qc.invalidateQueries({ queryKey: ["studio"] }); qc.invalidateQueries({ queryKey: ["studio-item", id] }); };
  const run = async (fn: () => Promise<any>, ok: string) => {
    setBusy(true);
    try { await fn(); toast.success(ok); refresh(); } catch (e: any) { toast.error(e.message ?? "Something went wrong"); } finally { setBusy(false); }
  };
  const doSave = () => run(async () => {
    const { id: _i, status: _s, version: _v, created_at: _c, updated_at: _u, created_by: _cb, approved_by: _a, approved_at: _aa, ceo_approved_by: _cab, ceo_approved_at: _caa, week_start: _w, is_sample: _is, proposed_slot: _ps, ...rest } = f;
    const r = await save({ data: { ...rest, id: id ?? null, publish_at: f.publish_at ? new Date(f.publish_at).toISOString() : null } as any });
    if (!id) onClose();
    return r;
  }, "Saved");
  const idx = item ? STUDIO_STATUSES.indexOf(item.status) : -1;
  const next = idx >= 0 && idx < STUDIO_STATUSES.length - 1 ? STUDIO_STATUSES[idx + 1] : null;
  const inp = "w-full rounded-md border border-input bg-background px-2 py-1.5 text-sm disabled:opacity-60";
  const field = (label: string, el: React.ReactNode) => <label className="block space-y-1"><span className="text-xs font-medium text-muted-foreground">{label}</span>{el}</label>;
  const txt = (k: string, label: string, area = false) => field(label, area
    ? <textarea className={inp} rows={2} disabled={locked} value={f[k] ?? ""} onChange={(e) => setF({ ...f, [k]: e.target.value })} />
    : <input className={inp} disabled={locked} value={f[k] ?? ""} onChange={(e) => setF({ ...f, [k]: e.target.value })} />);
  const arr = (k: string, label: string) => field(label, <input className={inp} disabled={locked} value={(f[k] ?? []).join(", ")} onChange={(e) => setF({ ...f, [k]: list(e.target.value) })} placeholder="Comma separated" />);
  const person = (k: string, label: string) => field(label, (
    <select className={inp} disabled={locked} value={f[k] ?? ""} onChange={(e) => setF({ ...f, [k]: e.target.value || null })}>
      <option value="">Unassigned</option>
      {Object.entries(people).map(([pid, n]) => <option key={pid} value={pid}>{n}</option>)}
    </select>
  ));

  return (
    <Sheet open={open} onOpenChange={(o) => !o && onClose()}>
      <SheetContent className="w-full overflow-y-auto sm:max-w-xl">
        <SheetHeader>
          <SheetTitle className="font-heading">{id ? (item?.article_title || item?.topic || "Content item") : "New content item"}</SheetTitle>
          <div className="flex flex-wrap items-center gap-2">{s && <SeriesChip s={s} />}{item && <StatusPill status={item.status} />}{item?.is_sample && <SampleTag />}{item && <span className="text-[10px] text-muted-foreground">v{item.version}</span>}</div>
        </SheetHeader>
        <div className="mt-4 space-y-3">
          {s?.guardrail && <p className="rounded-md border border-destructive/40 bg-destructive/5 p-2 text-xs">{s.guardrail}</p>}
          {locked && <p className="rounded-md bg-muted p-2 text-xs">Approved content is locked. You can still change the date, or send it back to edit.</p>}
          <div className="grid gap-3 sm:grid-cols-2">
            {field("Series", <select className={inp} disabled={locked} value={f.series_key ?? ""} onChange={(e) => setF({ ...f, series_key: e.target.value })}>{series.map((x) => <option key={x.key} value={x.key}>{x.name}</option>)}</select>)}
            {field("Publish date and time", <input type="datetime-local" className={inp} disabled={item?.status === "published"} value={toLocal(f.publish_at)} onChange={(e) => setF({ ...f, publish_at: e.target.value ? new Date(e.target.value).toISOString() : null })} />)}
          </div>
          {txt("article_title", "Article title")}
          {txt("social_headline", "Social headline")}
          {txt("topic", "Topic", true)}
          <div className="grid gap-3 sm:grid-cols-2">{txt("audience", "Target audience")}{txt("cta", "Call to action")}</div>
          {arr("keywords", "Primary keywords")}
          {arr("source_urls", "Source links")}
          <div className="grid gap-3 sm:grid-cols-2">{person("author_id", "Author")}{person("reviewer_id", "Reviewer")}</div>
          {arr("platforms", "Platforms (linkedin, facebook, instagram, website, email)")}
          {txt("graphic_requirements", "Graphic requirements", true)}
          {txt("article_url", "Article link")}
          <div className="flex flex-wrap gap-2">
            <Button size="sm" disabled={busy} onClick={doSave}>Save</Button>
            {id && <Button size="sm" variant="outline" disabled={busy} onClick={() => run(() => dup({ data: { id } }), "Duplicated")}>Duplicate</Button>}
          </div>

          {item && (
            <section className="space-y-2 rounded-md border border-border p-3">
              <h3 className="text-sm font-semibold">Workflow</h3>
              <ol className="flex flex-wrap gap-1">{STUDIO_STATUSES.map((st, i) => <li key={st} className={`rounded-sm px-1.5 py-0.5 text-[10px] ${i <= idx ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"}`}>{STUDIO_STATUS_LABEL[st]}</li>)}</ol>
              <textarea className={inp} rows={2} placeholder="Note (required to send back or for Super Admin self-approval)" value={note} onChange={(e) => setNote(e.target.value)} />
              <div className="flex flex-wrap gap-2">
                {next && <Button size="sm" disabled={busy} onClick={() => run(() => move({ data: { id: item.id, to: next, note } }).then(() => setNote("")), `Moved to ${STUDIO_STATUS_LABEL[next]}`)}>Move to {STUDIO_STATUS_LABEL[next]}</Button>}
                {idx > 0 && idx < 9 && (
                  <select className="rounded-md border border-input bg-background px-2 text-xs" value="" disabled={busy} onChange={(e) => e.target.value && run(() => move({ data: { id: item.id, to: e.target.value as StudioStatus, note } }), "Sent back")}>
                    <option value="">Send back to…</option>
                    {STUDIO_STATUSES.slice(0, idx).map((st) => <option key={st} value={st}>{STUDIO_STATUS_LABEL[st]}</option>)}
                  </select>
                )}
              </div>
              <p className="text-[11px] text-muted-foreground">Approval here plans the content; the linked post or article still needs its own publishing approval. Nothing goes public automatically.</p>
            </section>
          )}

          {item && (
            <section className="space-y-2">
              <h3 className="text-sm font-semibold">Comments</h3>
              {q.data!.comments.map((c: any) => <div key={c.id} className="rounded-md bg-muted p-2 text-xs"><b>{q.data!.people[c.author_id] ?? "Team member"}</b> · {new Date(c.created_at).toLocaleString()}<p className="mt-1 whitespace-pre-wrap">{c.body}</p></div>)}
              <div className="flex gap-2"><input className={inp} value={msg} onChange={(e) => setMsg(e.target.value)} placeholder="Add a comment" /><Button size="sm" variant="outline" disabled={!msg.trim() || busy} onClick={() => run(() => addComment({ data: { id: item.id, body: msg } }).then(() => setMsg("")), "Comment added")}>Post</Button></div>
              <h3 className="pt-2 text-sm font-semibold">History</h3>
              <ul className="space-y-1 text-xs text-muted-foreground">
                {q.data!.events.map((e: any) => <li key={e.id}>{new Date(e.created_at).toLocaleString()} · {q.data!.people[e.actor_id] ?? "Team member"} · {e.action}{e.to_status ? ` → ${STUDIO_STATUS_LABEL[e.to_status as StudioStatus] ?? e.to_status}` : ""}{e.note ? ` — “${e.note}”` : ""}</li>)}
              </ul>
            </section>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
