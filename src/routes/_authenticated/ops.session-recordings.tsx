import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useRef, useState } from "react";
import { AmPage } from "@/components/account-management-ui";
import { LoadError } from "@/components/load-error";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { listRecordingsFn, openRecordingFn } from "@/lib/session-recordings.functions";

export const Route = createFileRoute("/_authenticated/ops/session-recordings")({
  head: () => ({ meta: [
    { title: "Screen recordings | Harmonious Operations" },
    { name: "description", content: "Private replays and screen videos that help Harmonious see what people experienced." },
    { property: "og:title", content: "Screen recordings | Harmonious Operations" },
    { property: "og:description", content: "Private replays and screen videos that help Harmonious see what people experienced." },
    { property: "og:type", content: "website" },
    { name: "twitter:card", content: "summary" },
    { name: "robots", content: "noindex" },
  ] }),
  component: RecordingsPage,
});

type Kind = "replay" | "screen" | undefined;

function RecordingsPage() {
  const list = useServerFn(listRecordingsFn);
  const [kind, setKind] = useState<Kind>(undefined);
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<string | null>(null);
  const q = useQuery({ queryKey: ["session-recordings", kind, search], queryFn: () => list({ data: { kind, search: search || undefined } }), retry: false });
  const fmt = (s: string) => new Date(s).toLocaleString();
  return (
    <AmPage title="Screen recordings" intro="Replays hide everything people type. Screen videos are ones people chose to send. Each opening is logged.">
      <div className="flex flex-wrap gap-2">
        {([[undefined, "All"], ["replay", "Page replays"], ["screen", "Sent screen videos"]] as const).map(([k, l]) => (
          <Button key={l} variant={kind === k ? "default" : "outline"} onClick={() => setKind(k)}>{l}</Button>
        ))}
        <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search name, email or page" aria-label="Search recordings" className="max-w-xs" />
      </div>
      {q.isLoading && <p className="text-sm text-muted-foreground">Loading…</p>}
      {q.isError && <LoadError error={q.error} what="Screen recordings" onRetry={() => q.refetch()} />}
      {selected && <Player id={selected} onClose={() => setSelected(null)} />}
      {q.data && (q.data.recordings.length === 0 ? <p className="text-sm text-muted-foreground">No recordings yet.</p> : (
        <div className="divide-y rounded-lg border">
          {q.data.recordings.map((r: any) => (
            <div key={r.id} className="flex flex-wrap items-center justify-between gap-3 p-3">
              <div className="min-w-0">
                <p className="font-medium">{r.name} {r.email && r.email !== r.name && <span className="text-sm text-muted-foreground">· {r.email}</span>}</p>
                <p className="text-sm text-muted-foreground">{fmt(r.started_at)} to {fmt(r.last_activity_at)} · {r.first_path}{r.last_path && r.last_path !== r.first_path ? ` → ${r.last_path}` : ""}</p>
                {r.note && <p className="mt-1 text-sm">“{r.note}”</p>}
              </div>
              <div className="flex items-center gap-2">
                <Badge variant="secondary">{r.kind === "screen" ? "Screen video" : "Page replay"}</Badge>
                <Button size="sm" onClick={() => setSelected(r.id)}>Play</Button>
              </div>
            </div>
          ))}
        </div>
      ))}
    </AmPage>
  );
}

function Player({ id, onClose }: { id: string; onClose: () => void }) {
  const open = useServerFn(openRecordingFn);
  const q = useQuery({ queryKey: ["session-recording", id], queryFn: async () => (await open({ data: { id } })) as { kind: "replay"; events: unknown[] } | { kind: "screen"; url: string }, retry: false, staleTime: Infinity });
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const d = q.data as any;
    if (!d || d.kind !== "replay" || !box.current) return;
    const el = box.current;
    el.innerHTML = "";
    if ((d.events as unknown[]).length < 2) { el.textContent = "This replay has too little activity to play."; return; }
    let player: any;
    void Promise.all([import("rrweb-player"), import("rrweb-player/dist/style.css")]).then(([m]) => {
      const P = (m as any).default;
      player = new P({ target: el, props: { events: d.events, width: Math.min(el.clientWidth || 960, 1100), height: 600, autoPlay: false, showController: true } });
    });
    return () => { try { player?.$destroy?.(); } catch { /* ignore */ } el.innerHTML = ""; };
  }, [q.data]);
  return (
    <div className="space-y-2 rounded-lg border p-3">
      <div className="flex justify-between"><p className="font-medium">Playing recording</p><Button size="sm" variant="outline" onClick={onClose}>Close</Button></div>
      {q.isLoading && <p className="text-sm text-muted-foreground">Opening…</p>}
      {q.isError && <LoadError error={q.error} what="This recording" onRetry={() => q.refetch()} />}
      {q.data?.kind === "screen" && <video src={q.data.url} controls className="w-full max-w-4xl rounded" />}
      <div ref={box} />
    </div>
  );
}
