/** Browser-only: turn recordings into MP4 files. Import dynamically from click handlers. */
export const REPLAY_FPS = 4;

/** Timestamps (ms from start) at which replay frames are captured. */
export function frameTimes(durationMs: number, fps = REPLAY_FPS, maxFrames = 7200): number[] {
  const step = 1000 / fps;
  const n = Math.min(maxFrames, Math.max(1, Math.ceil(Math.max(0, durationMs) / step) + 1));
  return Array.from({ length: n }, (_, i) => Math.min(durationMs, i * step));
}

export const mp4Name = (name: string) => name.replace(/\.(webm|html)$/i, "") + ".mp4";

export async function canMakeMp4(): Promise<boolean> {
  if (typeof VideoEncoder === "undefined") return false;
  const { canEncodeVideo } = await import("mediabunny");
  return canEncodeVideo("avc");
}

/** Converts a WebM blob (screen or camera video) to MP4. */
export async function webmToMp4(blob: Blob, onProgress: (p: number) => void): Promise<Blob> {
  const mb = await import("mediabunny");
  const input = new mb.Input({ source: new mb.BlobSource(blob), formats: mb.ALL_FORMATS });
  const target = new mb.BufferTarget();
  const output = new mb.Output({ format: new mb.Mp4OutputFormat({ fastStart: "in-memory" }), target });
  const conv = await mb.Conversion.init({ input, output, video: { codec: "avc", forceTranscode: true }, audio: { codec: "aac", forceTranscode: true } });
  conv.onProgress = (p) => onProgress(p);
  await conv.execute();
  if (!target.buffer) throw new Error("Video couldn't be made.");
  return new Blob([target.buffer], { type: "video/mp4" });
}

/** Plays rrweb events offscreen and records frames into an MP4. Typed text stays masked as recorded. */
export async function replayToMp4(events: any[], onProgress: (p: number) => void): Promise<Blob> {
  const [{ Replayer }, h2c, mb] = await Promise.all([import("rrweb"), import("html2canvas-pro"), import("mediabunny")]);
  const host = document.createElement("div");
  host.style.cssText = "position:fixed;left:-20000px;top:0;width:1280px;height:800px;overflow:hidden;pointer-events:none";
  document.body.appendChild(host);
  try {
    const replayer = new Replayer(events, { root: host, skipInactive: false, mouseTail: false, triggerFocus: false, UNSAFE_replayCanvas: false });
    const meta = replayer.getMetaData();
    const iframe = host.querySelector("iframe") as HTMLIFrameElement;
    const w = Math.max(320, Math.min(1920, Number(iframe?.width) || 1280)) & ~1;
    const h = Math.max(240, Math.min(1200, Number(iframe?.height) || 800)) & ~1;
    host.style.width = `${w}px`; host.style.height = `${h}px`;
    const canvas = document.createElement("canvas"); canvas.width = w; canvas.height = h;
    const ctx = canvas.getContext("2d")!;
    const target = new mb.BufferTarget();
    const output = new mb.Output({ format: new mb.Mp4OutputFormat({ fastStart: "in-memory" }), target });
    const source = new mb.CanvasSource(canvas, { codec: "avc", bitrate: mb.QUALITY_MEDIUM });
    output.addVideoTrack(source, { frameRate: REPLAY_FPS });
    await output.start();
    const times = frameTimes(meta.totalTime);
    for (let i = 0; i < times.length; i++) {
      replayer.pause(times[i]!);
      await new Promise((r) => requestAnimationFrame(() => r(null)));
      const doc = iframe?.contentDocument;
      ctx.fillStyle = "#ffffff"; ctx.fillRect(0, 0, w, h);
      if (doc?.documentElement) {
        try {
          const shot = await h2c.default(doc.documentElement, { width: w, height: h, windowWidth: w, windowHeight: h, scale: 1, logging: false, useCORS: true, backgroundColor: "#ffffff", x: doc.defaultView?.scrollX ?? 0, y: doc.defaultView?.scrollY ?? 0 });
          ctx.drawImage(shot, 0, 0, w, h);
        } catch { /* keep blank frame */ }
      }
      await source.add(i / REPLAY_FPS, 1 / REPLAY_FPS);
      onProgress((i + 1) / times.length);
    }
    await output.finalize();
    replayer.destroy();
    if (!target.buffer) throw new Error("Video couldn't be made.");
    return new Blob([target.buffer], { type: "video/mp4" });
  } finally { host.remove(); }
}
