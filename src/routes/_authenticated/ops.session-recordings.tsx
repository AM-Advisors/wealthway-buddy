import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useMemo, useRef, useState } from "react";
import { AmPage } from "@/components/account-management-ui";
import { LoadError } from "@/components/load-error";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { downloadRecordingFn, listRecordingsFn, openRecordingFn, recordingDetailsFn } from "@/lib/session-recordings.functions";
import { clientInfoLines, duration, parseDevice, recordingBreakdown, type Breakdown } from "@/lib/recording-details";
import { downloadBlob, replayHtml } from "@/lib/recording-download";
import { recordingOverview } from "@/lib/recording-overview";
import { toast } from "sonner";
import { ChevronDown, ChevronUp, Download, Laptop, MapPin, Smartphone, Tablet } from "lucide-react";

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
    <AmPage title="Screen recordings" intro="Replays hide everything people type. Screen videos, including any camera and microphone, are ones people agreed to record and chose to send. Each opening and download is logged.">
      <div className="flex flex-wrap gap-2">
        {([[undefined, "All"], ["replay", "Page replays"], ["screen", "Sent screen videos"]] as const).map(([k, l]) => (
          <Button key={l} variant={kind === k ? "default" : "outline"} onClick={() => setKind(k)}>{l}</Button>
        ))}
        <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search name, email or page" aria-label="Search recordings" className="max-w-xs" />
      </div>
      {q.isLoading && <p className="text-sm text-muted-foreground">Loading…</p>}
      {q.isError && <LoadError error={q.error} what="Screen recordings" onRetry={() => q.refetch()} />}
      {q.data && q.data.recordings.length > 0 && <Overview rows={q.data.recordings as any[]} onSearch={setSearch} />}
      {selected && <Player id={selected} onClose={() => setSelected(null)} />}
      {q.data && (q.data.recordings.length === 0 ? <p className="text-sm text-muted-foreground">No recordings yet.</p> : (
        <div className="divide-y rounded-lg border">
          {q.data.recordings.map((r: any) => <RecordingRow key={r.id} r={r} fmt={fmt} onPlay={() => setSelected(r.id)} />)}
        </div>
      ))}
    </AmPage>
  );
}

function RecordingRow({ r, fmt, onPlay }: { r: any; fmt: (s: string) => string; onPlay: () => void }) {
  const [open, setOpen] = useState(false);
  const dev = parseDevice(r.user_agent);
  const DevIcon = dev.type === "Phone" ? Smartphone : dev.type === "Tablet" ? Tablet : Laptop;
  const mins = (Date.parse(r.last_activity_at) - Date.parse(r.started_at)) / 1000;
  return (
    <div className="space-y-2 p-3">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 space-y-1">
          <p className="font-medium">{r.name} {r.email && r.email !== r.name && <span className="text-sm text-muted-foreground">· {r.email}</span>}</p>
          <p className="text-sm text-muted-foreground">{fmt(r.started_at)} to {fmt(r.last_activity_at)} · {duration(mins)} · {r.first_path}{r.last_path && r.last_path !== r.first_path ? ` → ${r.last_path}` : ""}</p>
          <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
            <span className="inline-flex items-center gap-1"><DevIcon className="size-4 text-muted-foreground" />{dev.type} · {dev.os} · {dev.browser}</span>
            {r.ip ? (
              <span className="inline-flex items-center gap-1"><MapPin className="size-4 text-muted-foreground" />{r.ip}{r.place ? ` · ${r.place}` : ""}{r.ipSource === "sign-in" ? " (from sign-in)" : ""}</span>
            ) : <span className="text-muted-foreground">Network address not recorded</span>}
          </p>
          {(r.localStart || r.network || r.lastIp) && (
            <p className="text-xs text-muted-foreground">
              {[r.localStart && `Their time ${r.localStart}`, r.network && `Network ${r.network}`, r.lastIp && `Address changed to ${r.lastIp}${r.lastPlace ? ` · ${r.lastPlace}` : ""}`].filter(Boolean).join(" · ")}
            </p>
          )}
          {r.note && <p className="text-sm">“{r.note}”</p>}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="secondary">{r.kind === "screen" ? "Screen video" : "Page replay"}</Badge>
          {r.kind === "screen" && (r.client_info?.camera || r.client_info?.microphone) && <Badge variant="outline">{r.client_info?.camera ? "Camera & microphone" : "Microphone"}</Badge>}
          <Button size="sm" onClick={onPlay}>Play</Button>
          <Button size="sm" variant="outline" onClick={() => setOpen((v) => !v)} aria-expanded={open}>{open ? <ChevronUp className="mr-1 size-4" /> : <ChevronDown className="mr-1 size-4" />}Details</Button>
          <DownloadRecording id={r.id} />
        </div>
      </div>
      {open && <RecordingDetails r={r} />}
    </div>
  );
}

function RecordingDetails({ r }: { r: any }) {
  const load = useServerFn(recordingDetailsFn);
  const q = useQuery({ queryKey: ["session-recording-details", r.id], queryFn: () => load({ data: { id: r.id } }), retry: false, staleTime: Infinity });
  const info = clientInfoLines(r.client_info);
  return (
    <div className="space-y-3 rounded-md border bg-muted/30 p-3 text-sm">
      {info.length > 0 ? <p className="text-muted-foreground">{info.join(" · ")}</p> : <p className="text-muted-foreground">Screen and window sizes are recorded for new recordings only.</p>}
      {r.device_id && <p className="text-xs text-muted-foreground">Device marker {String(r.device_id).slice(0, 8)} (same marker means the same browser)</p>}
      {q.isLoading && <p className="text-muted-foreground">Reading recording…</p>}
      {q.isError && <LoadError error={q.error} what="Recording details" onRetry={() => q.refetch()} />}
      {q.data?.kind === "screen" && <p>Screen video the person chose to record and send to Harmonious{r.client_info?.camera ? ", with their camera and microphone" : r.client_info?.microphone ? ", with their microphone" : ""}. {r.bytes ? `${(Number(r.bytes) / 1_048_576).toFixed(1)} MB.` : ""}</p>}
      {r.client_info?.consentedAt && (r.client_info?.camera || r.client_info?.microphone) && <p className="text-xs text-muted-foreground">Camera and microphone consent given in the recorder before sending · {new Date(r.client_info.consentedAt).toLocaleString()}</p>}
      {q.data?.breakdown && <BreakdownView b={q.data.breakdown as Breakdown} />}
    </div>
  );
}

function BreakdownView({ b, onJump }: { b: Breakdown; onJump?: (offsetMs: number) => void }) {
  const stat = (label: string, value: string | number) => <div className="rounded border bg-background p-2"><p className="text-xs text-muted-foreground">{label}</p><p className="font-semibold">{value}</p></div>;
  const off = (ms: number) => duration(ms / 1000);
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-8">
        {stat("Length", duration(b.durationSeconds))}{stat("On the page", duration(b.activeSeconds))}{stat("Away", duration(b.awaySeconds))}{stat("Pages", b.pages.length)}
        {stat("Clicks", b.clicks)}{stat("Typing", b.typing)}{stat("Scrolls", b.scrolls)}{stat("Pauses over 1 min", b.idleGaps)}
      </div>
      {b.pages.length > 0 && (
        <div>
          <p className="mb-1 font-medium">Pages in order</p>
          <ol className="space-y-0.5">{b.pages.map((p, i) => (
            <li key={`${p.path}-${i}`} className="flex justify-between gap-2"><span className="truncate">{i + 1}. {p.path}</span><span className="shrink-0 text-muted-foreground">{duration(p.seconds)}</span></li>
          ))}</ol>
        </div>
      )}
      <div>
        <p className="mb-1 font-medium">Markers</p>
        {b.markers.length === 0 ? <p className="text-muted-foreground">No markers. Markers (leaving the tab, screenshot key, copying, errors) are saved on recordings made from now on.</p> : (
          <ul className="space-y-0.5">{b.markers.map((m, i) => (
            <li key={i} className="flex justify-between gap-2">
              {onJump ? <button type="button" className="text-left underline-offset-2 hover:underline" onClick={() => onJump(m.offsetMs)}>{m.label}{m.detail ? ` · ${m.detail}` : ""}</button> : <span>{m.label}{m.detail ? ` · ${m.detail}` : ""}</span>}
              <span className="shrink-0 text-muted-foreground">at {off(m.offsetMs)}</span>
            </li>
          ))}</ul>
        )}
      </div>
    </div>
  );
}

function Player({ id, onClose }: { id: string; onClose: () => void }) {
  const open = useServerFn(openRecordingFn);
  const q = useQuery({ queryKey: ["session-recording", id], queryFn: async () => (await open({ data: { id } })) as { kind: "replay"; events: unknown[] } | { kind: "screen"; url: string; cameraUrl?: string | null; cameraVideo?: boolean }, retry: false, staleTime: Infinity });
  const box = useRef<HTMLDivElement>(null);
  const playerRef = useRef<any>(null);
  const d0 = q.data as any;
  const breakdown = useMemo(() => (d0?.kind === "replay" ? recordingBreakdown(d0.events as unknown[]) : null), [d0]);
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
      playerRef.current = player;
    });
    return () => { try { player?.$destroy?.(); } catch { /* ignore */ } el.innerHTML = ""; };
  }, [q.data]);
  return (
    <div className="space-y-2 rounded-lg border p-3">
      <div className="flex justify-between"><p className="font-medium">Playing recording</p><div className="flex gap-2"><DownloadRecording id={id} /><Button size="sm" variant="outline" onClick={onClose}>Close</Button></div></div>
      {q.isLoading && <p className="text-sm text-muted-foreground">Opening…</p>}
      {q.isError && <LoadError error={q.error} what="This recording" onRetry={() => q.refetch()} />}
      {q.data?.kind === "screen" && <ScreenWithCamera url={q.data.url} cameraUrl={(q.data as any).cameraUrl ?? null} cameraVideo={Boolean((q.data as any).cameraVideo)} />}
      <div ref={box} />
      {breakdown && <details className="rounded-md border p-3 text-sm" open><summary className="cursor-pointer font-medium">Breakdown · click a marker to jump there</summary><div className="pt-3"><BreakdownView b={breakdown} onJump={(ms) => { try { playerRef.current?.goto?.(ms, false); } catch { /* ignore */ } }} /></div></details>}
    </div>
  );
}

/** Screen video with the person's camera (or microphone) kept in step: play, pause and seek follow the screen. */
function ScreenWithCamera({ url, cameraUrl, cameraVideo }: { url: string; cameraUrl: string | null; cameraVideo: boolean }) {
  const screen = useRef<HTMLVideoElement>(null);
  const cam = useRef<HTMLVideoElement & HTMLAudioElement>(null);
  useEffect(() => {
    const s = screen.current, c = cam.current;
    if (!s || !c) return;
    const sync = () => { if (Math.abs(c.currentTime - s.currentTime) > 0.3) c.currentTime = s.currentTime; };
    const play = () => { sync(); void c.play().catch(() => null); };
    const pause = () => c.pause();
    s.addEventListener("play", play); s.addEventListener("pause", pause); s.addEventListener("seeked", sync); s.addEventListener("ratechange", () => { c.playbackRate = s.playbackRate; });
    return () => { s.removeEventListener("play", play); s.removeEventListener("pause", pause); s.removeEventListener("seeked", sync); };
  }, [url, cameraUrl]);
  return (
    <div className="flex flex-col gap-3 lg:flex-row lg:items-start">
      <video ref={screen} src={url} controls className="w-full max-w-4xl rounded" />
      {cameraUrl && (cameraVideo
        ? <div className="lg:w-72"><p className="mb-1 text-xs text-muted-foreground">Camera and microphone (follows the screen video)</p><video ref={cam} src={cameraUrl} controls={false} className="w-full rounded" /></div>
        : <div className="lg:w-72"><p className="mb-1 text-xs text-muted-foreground">Microphone (follows the screen video)</p><audio ref={cam} src={cameraUrl} /></div>)}
    </div>
  );
}

function DownloadRecording({ id }: { id: string }) {
  const download = useServerFn(downloadRecordingFn);
  const [busy, setBusy] = useState(false);
  const run = async () => {
    setBusy(true);
    try {
      const d = await download({ data: { id } });
      if (d.kind === "screen") {
        const cam = (d as any).cameraUrl as string | null | undefined;
        if (cam) { const a = document.createElement("a"); a.href = cam; a.rel = "noopener"; document.body.appendChild(a); a.click(); a.remove(); }
        window.setTimeout(() => { window.location.href = d.url; }, cam ? 400 : 0);
        return;
      }
      if ((d.events as unknown[]).length < 2) { toast.info("This replay has too little activity to download."); return; }
      const [js, css] = await Promise.all([import("rrweb-player/dist/index.js?raw"), import("rrweb-player/dist/style.css?raw")]);
      downloadBlob(new Blob([replayHtml(d.events as unknown[], "Page replay", js.default, css.default)], { type: "text/html;charset=utf-8" }), d.fileName);
    } catch (e) { toast.error((e as Error).message); } finally { setBusy(false); }
  };
  return <Button size="sm" variant="outline" disabled={busy} onClick={() => void run()} aria-label="Download recording"><Download className="mr-1 size-4" />{busy ? "Preparing…" : "Download"}</Button>;
}

function Overview({ rows, onSearch }: { rows: any[]; onSearch: (s: string) => void }) {
  const o = recordingOverview(rows);
  const stat = (label: string, value: string | number) => (
    <div className="rounded-lg border p-3"><p className="text-xs text-muted-foreground">{label}</p><p className="text-2xl font-semibold">{value}</p></div>
  );
  const hrs = o.totalMinutes >= 60 ? `${Math.floor(o.totalMinutes / 60)}h ${o.totalMinutes % 60}m` : `${o.totalMinutes}m`;
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-6">
        {stat("Recordings", o.total)}{stat("Page replays", o.replays)}{stat("Screen videos", o.screens)}
        {stat("People", o.people)}{stat("Last 24 hours", o.last24h)}{stat("Time recorded", hrs)}
      </div>
      <div className="grid gap-3 md:grid-cols-2">
        <div className="rounded-lg border p-3">
          <p className="mb-2 text-sm font-medium">Most recorded people</p>
          {o.topPeople.map((p) => (
            <button key={p.name} type="button" onClick={() => onSearch(p.name)} className="flex w-full justify-between rounded px-1 py-1 text-left text-sm hover:bg-muted">
              <span>{p.name}</span><span className="text-muted-foreground">{p.count} · {p.minutes}m · last {new Date(p.last).toLocaleDateString()}</span>
            </button>
          ))}
        </div>
        <div className="rounded-lg border p-3">
          <p className="mb-2 text-sm font-medium">Most visited pages</p>
          {o.topPages.map((p) => (
            <button key={p.path} type="button" onClick={() => onSearch(p.path)} className="flex w-full justify-between gap-2 rounded px-1 py-1 text-left text-sm hover:bg-muted">
              <span className="truncate">{p.path}</span><span className="text-muted-foreground">{p.count}</span>
            </button>
          ))}
        </div>
      </div>
      <p className="text-xs text-muted-foreground">Based on the {o.total} most recent recordings shown below. Click a person or page to filter.</p>
    </div>
  );
}
