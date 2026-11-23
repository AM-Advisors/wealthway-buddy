/** Pure rules for shared screen-video links: one open link per video, viewers type a name and email before watching. */
export const SHARE_DAYS = 30;
/** Repeat presses by the same viewer and address inside this window count as one viewing. */
export const VIEW_DEDUPE_MINUTES = 10;

export type ShareRow = { expires_at: string; revoked_at: string | null };
export type ShareState = "active" | "expired" | "revoked";

/** Only videos people chose to record and send may be shared; background page replays stay private. */
export function canShareRecording(kind: string): boolean {
  return kind === "screen";
}

export function shareState(row: ShareRow, now: Date = new Date()): ShareState {
  if (row.revoked_at) return "revoked";
  if (Date.parse(row.expires_at) <= now.getTime()) return "expired";
  return "active";
}

export function shareExpiry(now: Date = new Date()): string {
  return new Date(now.getTime() + SHARE_DAYS * 86_400_000).toISOString();
}

export const SHARE_STATE_MESSAGE: Record<Exclude<ShareState, "active">, string> = {
  expired: "This video link has expired. Ask the person who sent it for a new one.",
  revoked: "This video link was turned off. Ask the person who sent it for a new one.",
};

export function isShareToken(token: string): boolean {
  return /^[A-Za-z0-9_-]{43}$/.test(token);
}

export function shareUrl(origin: string, token: string): string {
  return `${origin.replace(/\/+$/, "")}/api/public/watch/${token}`;
}

const EMAIL = /^[^\s@]{1,64}@[^\s@]{1,190}\.[A-Za-z]{2,}$/;

/** Name and email are required to watch. They are what the viewer typed; nothing here verifies them. */
export function checkViewer(input: { name?: unknown; email?: unknown }): { ok: true; name: string; email: string } | { ok: false; error: string } {
  const name = String(input.name ?? "").replace(/\s+/g, " ").trim();
  const email = String(input.email ?? "").trim().toLowerCase();
  if (name.length < 2 || name.length > 120) return { ok: false, error: "Please enter your full name." };
  if (!EMAIL.test(email) || email.length > 254) return { ok: false, error: "Please enter a valid email address." };
  return { ok: true, name, email };
}

/** True when this viewing repeats one already counted (same email and address within the window). */
export function isRepeatView(prev: { viewer_email: string; ip_address: string | null; viewed_at: string } | null | undefined, email: string, ip: string | null, now: Date = new Date()): boolean {
  if (!prev) return false;
  return prev.viewer_email === email && (prev.ip_address ?? null) === ip && now.getTime() - Date.parse(prev.viewed_at) < VIEW_DEDUPE_MINUTES * 60_000;
}
