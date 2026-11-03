import { useEffect, useRef, useState } from "react";
import { useRouterState } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { Circle, Square, Video, X } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { appendReplayChunkFn, finishScreenRecordingFn, startRecordingFn } from "@/lib/session-recordings.functions";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";

const FLUSH_MS = 10_000;

/** Signed-in only. Replay masks every typed value; screen video starts only when the person presses Record. */
export function SessionRecorder() {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const pathRef = useRef(pathname);
  pathRef.current = pathname;
  const start = useServerFn(startRecordingFn);
  const append = useServerFn(appendReplayChunkFn);
  const finish = useServerFn(finishScreenRecordingFn);
  const [signedIn, setSignedIn] = useState(false);

  useEffect(() => {
    const { data } = supabase.auth.onAuthStateChange((_e, s) => setSignedIn(!!s));
    void supabase.auth.getSession().then(({ data: d }) => setSignedIn(!!d.session));
    return () => data.subscription.unsubscribe();
  }, []);

  // Session replay
  useEffect(() => {
    if (!signedIn) return;
    let stop: (() => void) | undefined;
    let cancelled = false;
    let buffer: unknown[] = [];
    let seq = 0;
    let id: string | null = null;
    let sending = false;
    const flush = async () => {
      if (!id || sending || !buffer.length) return;
      sending = true;
      const events = buffer; buffer = [];
      try { await append({ data: { id, seq, path: pathRef.current, events: JSON.stringify(events) } }); seq++; }
      catch { buffer = [...events, ...buffer].slice(-5000); }
      finally { sending = false; }
    };
    void (async () => {
      try {
        const rec = await start({ data: { kind: "replay", path: pathRef.current, userAgent: navigator.userAgent } });
        if (cancelled) return;
        id = rec.id;
        const { record } = await import("rrweb");
        if (cancelled) return;
        stop = record({
          emit: (e) => { buffer.push(e); },
          maskAllInputs: true,
          maskTextSelector: "[data-private]",
          blockSelector: "[data-no-record]",
          sampling: { mousemove: 100, scroll: 150, input: "last" },
        }) ?? undefined;
      } catch { /* recording is best-effort and never blocks the page */ }
    })();
    const timer = window.setInterval(() => { void flush(); }, FLUSH_MS);
    const onHide = () => { if (document.visibilityState === "hidden") void flush(); };
    document.addEventListener("visibilitychange", onHide);
    return () => {
      cancelled = true;
      stop?.();
      void flush();
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", onHide);
    };
  }, [signedIn, start, append]);

  // Record-my-screen button
  const [recording, setRecording] = useState(false);
  const [pending, setPending] = useState<Blob | null>(null);
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);
  const recorderRef = useRef<MediaRecorder | null>(null);

  const begin = async () => {
    try {
      const stream = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: true });
      const chunks: Blob[] = [];
      const mr = new MediaRecorder(stream, { mimeType: MediaRecorder.isTypeSupported("video/webm;codecs=vp9") ? "video/webm;codecs=vp9" : "video/webm" });
      mr.ondataavailable = (e) => { if (e.data.size) chunks.push(e.data); };
      mr.onstop = () => { stream.getTracks().forEach((t) => t.stop()); setRecording(false); setPending(new Blob(chunks, { type: "video/webm" })); };
      stream.getVideoTracks()[0]?.addEventListener("ended", () => { if (mr.state !== "inactive") mr.stop(); });
      mr.start(1000);
      recorderRef.current = mr;
      setRecording(true);
    } catch { toast.error("Screen recording was not started."); }
  };

  const send = async () => {
    if (!pending) return;
    setSaving(true);
    try {
      const rec = await start({ data: { kind: "screen", path: pathRef.current, userAgent: navigator.userAgent } });
      if (!("token" in rec) || !rec.token) throw new Error("upload");
      const up = await supabase.storage.from("session-recordings").uploadToSignedUrl(rec.path, rec.token, pending, { contentType: "video/webm" });
      if (up.error) throw up.error;
      await finish({ data: { id: rec.id, note: note.trim() || undefined, bytes: pending.size, path: pathRef.current } });
      toast.success("Recording sent to Harmonious.");
      setPending(null); setNote("");
    } catch { toast.error("The recording couldn't be sent. Please try again."); }
    finally { setSaving(false); }
  };

  if (!signedIn) return null;
  return (
    <div data-no-record className="fixed bottom-4 left-4 z-50 flex flex-col items-start gap-2">
      {pending && (
        <div className="w-80 rounded-lg border bg-card p-3 text-card-foreground shadow-lg">
          <div className="mb-2 flex items-center justify-between">
            <p className="text-sm font-medium">Send this recording to Harmonious?</p>
            <button aria-label="Discard recording" onClick={() => { setPending(null); setNote(""); }}><X className="h-4 w-4" /></button>
          </div>
          <video src={URL.createObjectURL(pending)} controls className="mb-2 w-full rounded" />
          <Textarea value={note} onChange={(e) => setNote(e.target.value)} placeholder="What were you trying to do? (optional)" className="mb-2" />
          <div className="flex gap-2">
            <Button size="sm" onClick={send} disabled={saving}>{saving ? "Sending…" : "Send"}</Button>
            <Button size="sm" variant="outline" onClick={() => { setPending(null); setNote(""); }}>Discard</Button>
          </div>
        </div>
      )}
      {recording ? (
        <Button size="sm" variant="destructive" onClick={() => recorderRef.current?.stop()}>
          <Square className="mr-1 h-3 w-3" /> Stop recording
        </Button>
      ) : !pending && (
        <Button size="sm" variant="outline" className="shadow" onClick={begin} title="Record your screen to show Harmonious a problem. This site also keeps a private replay of pages you use, with typed values hidden, to help support.">
          <Video className="mr-1 h-4 w-4" /> Record screen
        </Button>
      )}
      {recording && <span className="flex items-center gap-1 text-xs text-destructive"><Circle className="h-2 w-2 fill-current" /> Recording</span>}
    </div>
  );
}
