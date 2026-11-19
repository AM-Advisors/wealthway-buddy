import { useEffect, useMemo, useRef, useState } from "react";
import { useRouterState } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { Camera, Mic, MonitorUp, Square, X } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { appendReplayChunkFn, finishScreenRecordingFn, startRecordingFn } from "@/lib/session-recordings.functions";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";

import { CAMERA_CONSENT, canStartRecording, consentFacts, type CamKind } from "@/lib/recording-consent";

const FLUSH_MS = 10_000;
export const RECORD_SCREEN_EVENT = "hm:record-screen";
const deviceId = () => { try { return localStorage.getItem("hm-device-id") ?? undefined; } catch { return undefined; } };
/** Non-identifying device facts for the recording list. */
const clientInfo = () => {
  try {
    const sc = window.screen as Screen & { isExtended?: boolean };
    const conn = (navigator as Navigator & { connection?: { effectiveType?: string } }).connection;
    return {
      screen: `${sc.width}×${sc.height}`, window: `${window.innerWidth}×${window.innerHeight}`, pixelRatio: Math.round(window.devicePixelRatio * 100) / 100,
      timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone, language: navigator.language, touch: navigator.maxTouchPoints > 0,
      extendedDisplay: typeof sc.isExtended === "boolean" ? sc.isExtended : null, connection: conn?.effectiveType ?? null,
    };
  } catch { return undefined; }
};
/** Content-free markers inside the replay (never typed values, copied text or page content). */
export const REPLAY_MARK_EVENT = "hm:replay-mark";
export const markReplay = (kind: string, detail?: string) => window.dispatchEvent(new CustomEvent(REPLAY_MARK_EVENT, { detail: { kind, detail } }));

/** Signed-in only. Masked replay runs in the background with no on-screen control; screen video starts only from the account menu, with browser permission. */
export function SessionRecorder() {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const pathRef = useRef(pathname);
  pathRef.current = pathname;
  useEffect(() => { markReplay("page", pathname); }, [pathname]);
  const start = useServerFn(startRecordingFn);
  const append = useServerFn(appendReplayChunkFn);
  const finish = useServerFn(finishScreenRecordingFn);
  const [signedIn, setSignedIn] = useState(false);

  useEffect(() => {
    const { data } = supabase.auth.onAuthStateChange((e, s) => { if (e === "SIGNED_OUT") window.dispatchEvent(new Event("hm:flush-replay")); setSignedIn(!!s); });
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
        const rec = await start({ data: { kind: "replay", path: pathRef.current, userAgent: navigator.userAgent, deviceId: deviceId(), clientInfo: clientInfo() } });
        if (cancelled) return;
        id = rec.id;
        const { record } = await import("rrweb");
        if (cancelled) return;
        stop = record({
          emit: (e) => { buffer.push(e); },
          maskAllInputs: true,
          maskTextSelector: "[data-private]",
          // rrweb 2.0.0-alpha.4 calls node.matches(blockSelector) on text nodes and throws on
          // every page change; blocking by class avoids that path.
          blockClass: "rr-block",
          sampling: { mousemove: 100, scroll: 150, input: "last" },
        }) ?? undefined;
        const add = (kind: string, detail?: string) => { try { (record as any).addCustomEvent("hm", detail ? { kind, detail } : { kind }); } catch { /* ignore */ } };
        const onMark = (e: Event) => { const d = (e as CustomEvent).detail ?? {}; if (d.kind) add(String(d.kind), d.detail ? String(d.detail).slice(0, 80) : undefined); };
        const onVis = () => add(document.visibilityState === "hidden" ? "tab_hidden" : "tab_visible");
        const onBlur = () => add("focus_lost");
        const onFocus = () => add("focus_back");
        const onKey = (e: KeyboardEvent) => { if (e.key === "PrintScreen") add("screenshot_key"); };
        const onPrint = () => add("print");
        const onCopy = () => add("copy");
        const onOffline = () => add("offline");
        const onOnline = () => add("online");
        const onError = () => add("page_error");
        let resizeT = 0;
        const onResize = () => { window.clearTimeout(resizeT); resizeT = window.setTimeout(() => add("resize", `${window.innerWidth}×${window.innerHeight}`), 500); };
        const listeners: [EventTarget, string, EventListener][] = [
          [window, REPLAY_MARK_EVENT, onMark], [document, "visibilitychange", onVis], [window, "blur", onBlur], [window, "focus", onFocus],
          [window, "keyup", onKey as EventListener], [window, "beforeprint", onPrint], [document, "copy", onCopy],
          [window, "offline", onOffline], [window, "online", onOnline], [window, "error", onError], [window, "unhandledrejection", onError], [window, "resize", onResize],
        ];
        for (const [t, n, f] of listeners) t.addEventListener(n, f);
        const stopRecord = stop;
        stop = () => { for (const [t, n, f] of listeners) t.removeEventListener(n, f); stopRecord?.(); };
      } catch { /* recording is best-effort and never blocks the page */ }
    })();
    const timer = window.setInterval(() => { void flush(); }, FLUSH_MS);
    const onHide = () => { if (document.visibilityState === "hidden") void flush(); };
    document.addEventListener("visibilitychange", onHide);
    const onFlush = () => { void flush(); };
    window.addEventListener("hm:flush-replay", onFlush);
    return () => {
      window.removeEventListener("hm:flush-replay", onFlush);
      cancelled = true;
      stop?.();
      void flush();
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", onHide);
    };
  }, [signedIn, start, append]);

  // Record-my-screen (optionally with camera and microphone, only after the person agrees)
  const [recording, setRecording] = useState(false);
  const [pending, setPending] = useState<{ screen: Blob; camera: Blob | null; camKind: CamKind; consentedAt: string | null } | null>(null);
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);
  const [asking, setAsking] = useState(false);
  const [choice, setChoice] = useState<"screen" | "camera">("screen");
  const [agreed, setAgreed] = useState(false);
  const stopAllRef = useRef<(() => void) | null>(null);

  const begin = async (withCamera: boolean) => {
    setAsking(false);
    // Consent time is when the person pressed Start with the box ticked, not when they later press Send.
    const consentedAt = withCamera ? new Date().toISOString() : null;
    let screen: MediaStream;
    // The screen picker must open straight from the click, so it is asked for first.
    try { screen = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: true }); }
    catch { toast.error("Screen recording was not started."); return; }
    let cam: MediaStream | null = null;
    let camKind: CamKind = "none";
    if (withCamera) {
      try { cam = await navigator.mediaDevices.getUserMedia({ video: { width: { ideal: 640 }, height: { ideal: 480 } }, audio: true }); camKind = "camera_microphone"; }
      catch {
        try { cam = await navigator.mediaDevices.getUserMedia({ audio: true }); camKind = "microphone"; toast.info("Camera wasn't allowed. Recording your screen and microphone."); }
        catch { toast.info("Camera and microphone weren't allowed. Recording your screen only."); }
      }
    }
    const webm = (video: boolean) => video && MediaRecorder.isTypeSupported("video/webm;codecs=vp9") ? "video/webm;codecs=vp9" : video ? "video/webm" : "audio/webm";
    const screenChunks: Blob[] = [], camChunks: Blob[] = [];
    const mr = new MediaRecorder(screen, { mimeType: webm(true) });
    const cr = cam ? new MediaRecorder(cam, { mimeType: webm(camKind === "camera_microphone") }) : null;
    let done = 0;
    const total = cr ? 2 : 1;
    const finishOne = () => {
      done++;
      if (done < total) return;
      screen.getTracks().forEach((t) => t.stop());
      cam?.getTracks().forEach((t) => t.stop());
      setRecording(false);
      setPending({ screen: new Blob(screenChunks, { type: "video/webm" }), camera: cr ? new Blob(camChunks, { type: camKind === "camera_microphone" ? "video/webm" : "audio/webm" }) : null, camKind, consentedAt });
      markReplay("screen_video_stopped");
    };
    mr.ondataavailable = (e) => { if (e.data.size) screenChunks.push(e.data); };
    mr.onstop = finishOne;
    if (cr) { cr.ondataavailable = (e) => { if (e.data.size) camChunks.push(e.data); }; cr.onstop = finishOne; }
    const stopAll = () => { if (mr.state !== "inactive") mr.stop(); if (cr && cr.state !== "inactive") cr.stop(); };
    screen.getVideoTracks()[0]?.addEventListener("ended", stopAll);
    mr.start(1000); cr?.start(1000);
    markReplay("screen_video_started", camKind === "none" ? undefined : camKind === "camera_microphone" ? "with camera and microphone" : "with microphone");
    stopAllRef.current = stopAll;
    setRecording(true);
  };

  const send = async () => {
    if (!pending) return;
    setSaving(true);
    try {
      const { withCam, ...consent } = consentFacts(pending.camKind, !!pending.camera?.size, pending.consentedAt);
      const info = { ...(clientInfo() ?? {}), ...consent };
      const rec = await start({ data: { kind: "screen", path: pathRef.current, userAgent: navigator.userAgent, deviceId: deviceId(), clientInfo: info, withCamera: withCam } });
      if (!("token" in rec) || !rec.token) throw new Error("upload");
      const up = await supabase.storage.from("session-recordings").uploadToSignedUrl(rec.path, rec.token, pending.screen, { contentType: "video/webm" });
      if (up.error) throw up.error;
      if (withCam && pending.camera && "cameraToken" in rec && rec.cameraToken && rec.cameraPath) {
        const cu = await supabase.storage.from("session-recordings").uploadToSignedUrl(rec.cameraPath, rec.cameraToken, pending.camera, { contentType: pending.camera.type });
        if (cu.error) throw cu.error;
      }
      await finish({ data: { id: rec.id, note: note.trim() || undefined, bytes: pending.screen.size + (withCam ? pending.camera?.size ?? 0 : 0), path: pathRef.current } });
      toast.success("Recording sent to Harmonious.");
      setPending(null); setNote("");
    } catch { toast.error("The recording couldn't be sent. Please try again."); }
    finally { setSaving(false); }
  };

  useEffect(() => {
    const onStart = () => { if (!recording) { setChoice("screen"); setAgreed(false); setAsking(true); } };
    window.addEventListener(RECORD_SCREEN_EVENT, onStart);
    return () => window.removeEventListener(RECORD_SCREEN_EVENT, onStart);
  });

  const screenUrl = useMemo(() => (pending ? URL.createObjectURL(pending.screen) : null), [pending]);
  const camUrl = useMemo(() => (pending?.camera ? URL.createObjectURL(pending.camera) : null), [pending]);
  useEffect(() => () => { if (screenUrl) URL.revokeObjectURL(screenUrl); if (camUrl) URL.revokeObjectURL(camUrl); }, [screenUrl, camUrl]);
  const discard = () => { setPending(null); setNote(""); };
  if (!signedIn) return null;
  return (
    <div data-no-record className="rr-block fixed bottom-4 left-4 z-50 flex flex-col items-start gap-2">
      <Dialog open={asking} onOpenChange={setAsking}>
        <DialogContent className="rr-block max-h-[90vh] max-w-md overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Record a video for Harmonious</DialogTitle>
            <DialogDescription>Show us what you see so we can help. Nothing is sent until you watch it and press Send.</DialogDescription>
          </DialogHeader>
          <RadioGroup value={choice} onValueChange={(v) => { setChoice(v as "screen" | "camera"); setAgreed(false); }} className="gap-3">
            <Label className="flex cursor-pointer items-start gap-3 rounded-md border p-3 font-normal">
              <RadioGroupItem value="screen" className="mt-0.5" />
              <span><span className="flex items-center gap-1 font-medium"><MonitorUp className="size-4" />Screen only</span><span className="text-sm text-muted-foreground">Your screen and, if you choose, its sound.</span></span>
            </Label>
            <Label className="flex cursor-pointer items-start gap-3 rounded-md border p-3 font-normal">
              <RadioGroupItem value="camera" className="mt-0.5" />
              <span><span className="flex items-center gap-1 font-medium"><Camera className="size-4" /><Mic className="size-4" />Screen, camera and microphone</span><span className="text-sm text-muted-foreground">Talk us through it. Your camera and voice are recorded alongside your screen.</span></span>
            </Label>
          </RadioGroup>
          {choice === "camera" && (
            <div className="space-y-3 rounded-md border bg-muted/50 p-3">
              <p className="font-medium">{CAMERA_CONSENT.title}</p>
              <ul className="space-y-2 text-sm">
                {CAMERA_CONSENT.points.map((p) => (
                  <li key={p.heading}><span className="font-medium">{p.heading}.</span> <span className="text-muted-foreground">{p.text}</span></li>
                ))}
              </ul>
              <Label className="flex cursor-pointer items-start gap-3 rounded-md bg-background p-3 text-sm font-normal">
                <Checkbox checked={agreed} onCheckedChange={(v) => setAgreed(v === true)} className="mt-0.5" aria-label="I agree to camera and microphone recording" />
                <span>{CAMERA_CONSENT.agreement}</span>
              </Label>
              <p className="text-xs text-muted-foreground">{CAMERA_CONSENT.browserStep} <a href="/privacy" target="_blank" rel="noreferrer" className="underline">Privacy Policy</a></p>
            </div>
          )}
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setAsking(false)}>Cancel</Button>
            <Button disabled={!canStartRecording(choice, agreed)} onClick={() => void begin(choice === "camera")}>Start recording</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      {pending && (
        <div className="w-80 rounded-lg border bg-card p-3 text-card-foreground shadow-lg">
          <div className="mb-2 flex items-center justify-between">
            <p className="text-sm font-medium">Send this recording to Harmonious?</p>
            <button aria-label="Discard recording" onClick={discard}><X className="h-4 w-4" /></button>
          </div>
          {camUrl && <p className="mb-1 text-xs text-muted-foreground">Your screen</p>}
          <video src={screenUrl ?? undefined} controls className="mb-2 w-full rounded" />
          {camUrl && <p className="mb-1 text-xs text-muted-foreground">{pending.camKind === "camera_microphone" ? "Your camera and microphone" : "Your microphone"}</p>}
          {camUrl && pending.camKind === "camera_microphone" && <video src={camUrl} controls className="mb-2 w-full rounded" />}
          {camUrl && pending.camKind === "microphone" && <audio src={camUrl} controls className="mb-2 w-full" />}
          <Textarea value={note} onChange={(e) => setNote(e.target.value)} placeholder="What were you trying to do? (optional)" className="mb-2" />
          <div className="flex gap-2">
            <Button size="sm" onClick={send} disabled={saving}>{saving ? "Sending…" : "Send"}</Button>
            <Button size="sm" variant="outline" onClick={discard}>Discard</Button>
          </div>
        </div>
      )}
      {recording && (
        <Button size="sm" variant="outline" onClick={() => stopAllRef.current?.()}>
          <Square className="mr-1 h-3 w-3" /> Stop recording
        </Button>
      )}
    </div>
  );
}
