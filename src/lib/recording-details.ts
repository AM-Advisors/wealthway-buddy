/**
 * Pure per-recording details: device from the browser description, and a breakdown of a
 * page replay (pages, time, clicks, typing, markers). Never reads typed values; replays are
 * already masked and markers carry no page content.
 */
export type DeviceInfo = { browser: string; os: string; type: "Phone" | "Tablet" | "Computer" | "Unknown" };

export function parseDevice(ua: string | null | undefined): DeviceInfo {
  const u = ua ?? "";
  if (!u) return { browser: "Unknown browser", os: "Unknown system", type: "Unknown" };
  const v = (re: RegExp) => u.match(re)?.[1]?.split(".")[0];
  let browser = "Other browser";
  if (/Edg\//.test(u)) browser = `Edge ${v(/Edg\/([\d.]+)/) ?? ""}`;
  else if (/OPR\//.test(u)) browser = `Opera ${v(/OPR\/([\d.]+)/) ?? ""}`;
  else if (/CriOS\//.test(u)) browser = `Chrome ${v(/CriOS\/([\d.]+)/) ?? ""}`;
  else if (/FxiOS\//.test(u)) browser = `Firefox ${v(/FxiOS\/([\d.]+)/) ?? ""}`;
  else if (/Firefox\//.test(u)) browser = `Firefox ${v(/Firefox\/([\d.]+)/) ?? ""}`;
  else if (/Chrome\//.test(u)) browser = `Chrome ${v(/Chrome\/([\d.]+)/) ?? ""}`;
  else if (/Safari\//.test(u)) browser = `Safari ${v(/Version\/([\d.]+)/) ?? ""}`;
  let os = "Other system";
  if (/iPhone/.test(u)) os = `iPhone iOS ${(u.match(/OS (\d+)_/)?.[1]) ?? ""}`;
  else if (/iPad/.test(u)) os = `iPad iOS ${(u.match(/OS (\d+)_/)?.[1]) ?? ""}`;
  else if (/Android/.test(u)) os = `Android ${v(/Android ([\d.]+)/) ?? ""}`;
  else if (/Windows NT/.test(u)) os = "Windows";
  else if (/Mac OS X/.test(u)) os = "Mac";
  else if (/CrOS/.test(u)) os = "ChromeOS";
  else if (/Linux/.test(u)) os = "Linux";
  const type: DeviceInfo["type"] = /iPad|Tablet/.test(u) || (/Android/.test(u) && !/Mobile/.test(u)) ? "Tablet" : /iPhone|Mobile/.test(u) ? "Phone" : "Computer";
  return { browser: browser.trim(), os: os.trim(), type };
}

/** Markers the recorder adds to replays. Content-free by design. */
export const MARKER_LABELS: Record<string, string> = {
  page: "Opened page",
  tab_hidden: "Left the tab",
  tab_visible: "Came back to the tab",
  focus_lost: "Switched to another window or app",
  focus_back: "Returned to the window",
  screenshot_key: "Pressed the screenshot key (Windows)",
  print: "Opened print",
  copy: "Copied something",
  offline: "Lost internet connection",
  online: "Internet connection back",
  page_error: "Page error",
  resize: "Window resized",
  screen_video_started: "Started a screen video for Harmonious",
  screen_video_stopped: "Stopped the screen video",
};

export type Marker = { at: number; offsetMs: number; kind: string; label: string; detail?: string };
export type PageVisit = { path: string; at: number; seconds: number };
export type Breakdown = {
  startedAt: number | null; durationSeconds: number; activeSeconds: number; awaySeconds: number;
  pages: PageVisit[]; clicks: number; typing: number; scrolls: number; resizes: number; idleGaps: number;
  markers: Marker[]; counts: Record<string, number>;
};

type Ev = { type: number; timestamp: number; data?: any };
const pathOf = (href: unknown) => { try { return new URL(String(href)).pathname; } catch { return String(href ?? "").split("?")[0] || "/"; } };
const IDLE_MS = 60_000;

export function recordingBreakdown(input: unknown[]): Breakdown {
  const events = (input as Ev[]).filter((e) => e && typeof e.timestamp === "number").sort((a, b) => a.timestamp - b.timestamp);
  const empty: Breakdown = { startedAt: null, durationSeconds: 0, activeSeconds: 0, awaySeconds: 0, pages: [], clicks: 0, typing: 0, scrolls: 0, resizes: 0, idleGaps: 0, markers: [], counts: {} };
  if (!events.length) return empty;
  const t0 = events[0]!.timestamp, tEnd = events[events.length - 1]!.timestamp;
  const out = { ...empty, startedAt: t0, durationSeconds: Math.round((tEnd - t0) / 1000), markers: [] as Marker[], pages: [] as PageVisit[], counts: {} as Record<string, number> };
  const visit = (path: string, at: number) => { const last = out.pages[out.pages.length - 1]; if (last?.path === path) return; out.pages.push({ path, at, seconds: 0 }); };
  const mark = (kind: string, at: number, detail?: string) => {
    out.counts[kind] = (out.counts[kind] ?? 0) + 1;
    out.markers.push({ at, offsetMs: at - t0, kind, label: MARKER_LABELS[kind] ?? kind, ...(detail ? { detail } : {}) });
  };
  let awayFrom: number | null = null, prev = t0;
  for (const e of events) {
    if (e.timestamp - prev > IDLE_MS) out.idleGaps++;
    prev = e.timestamp;
    if (e.type === 4 && e.data?.href) visit(pathOf(e.data.href), e.timestamp);
    else if (e.type === 3) {
      const s = e.data?.source;
      if (s === 2 && (e.data?.type === 2 || e.data?.type === 4 || e.data?.type === 7)) out.clicks++;
      else if (s === 5) out.typing++;
      else if (s === 3) out.scrolls++;
      else if (s === 4) out.resizes++;
    } else if (e.type === 5 && e.data?.tag === "hm") {
      const p = e.data.payload ?? {};
      const kind = String(p.kind ?? "");
      if (!kind) continue;
      if (kind === "page") { visit(String(p.path ?? p.detail ?? "/"), e.timestamp); continue; }
      if (kind === "tab_hidden" || kind === "focus_lost") { if (awayFrom === null) awayFrom = e.timestamp; }
      if (kind === "tab_visible" || kind === "focus_back") { if (awayFrom !== null) { out.awaySeconds += (e.timestamp - awayFrom) / 1000; awayFrom = null; } }
      mark(kind, e.timestamp, typeof p.detail === "string" ? p.detail.slice(0, 80) : undefined);
    }
  }
  if (awayFrom !== null) out.awaySeconds += (tEnd - awayFrom) / 1000;
  for (let i = 0; i < out.pages.length; i++) {
    const next = out.pages[i + 1]?.at ?? tEnd;
    out.pages[i]!.seconds = Math.max(0, Math.round((next - out.pages[i]!.at) / 1000));
  }
  out.awaySeconds = Math.round(out.awaySeconds);
  out.activeSeconds = Math.max(0, out.durationSeconds - out.awaySeconds);
  return out;
}

export function duration(seconds: number): string {
  const s = Math.max(0, Math.round(seconds));
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ${s % 60}s`;
  return `${Math.floor(m / 60)}h ${m % 60}m`;
}

export type ClientInfo = { screen?: string; window?: string; pixelRatio?: number; timeZone?: string; language?: string; touch?: boolean; extendedDisplay?: boolean | null; connection?: string | null };

/** Readable device facts captured when the recording started. */
export function clientInfoLines(c: ClientInfo | null | undefined): string[] {
  if (!c) return [];
  const out: string[] = [];
  if (c.screen) out.push(`Screen ${c.screen}${c.pixelRatio ? ` @${c.pixelRatio}x` : ""}`);
  if (c.window) out.push(`Window ${c.window}`);
  if (c.extendedDisplay) out.push("More than one display");
  if (c.touch) out.push("Touch screen");
  if (c.timeZone) out.push(`Device time zone ${c.timeZone}`);
  if (c.language) out.push(`Language ${c.language}`);
  if (c.connection) out.push(`Connection ${c.connection}`);
  return out;
}
