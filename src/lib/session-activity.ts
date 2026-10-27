import { latestSessionActivity } from "./session-timeout-model";

/** Same-origin, account-scoped activity only; no tokens, form data or history. */
export function createSessionActivity(userId: string, onRemoteActivity: (time: number) => void) {
  const key = `hm-session-activity:${userId}`;
  let latest = Date.now();
  let lastPublished = 0;
  let channel: BroadcastChannel | undefined;
  const receive = (value: unknown) => {
    const next = latestSessionActivity(latest, value, Date.now());
    if (next > latest) { latest = next; onRemoteActivity(next); }
  };
  const storage = (event: StorageEvent) => { if (event.key === key && event.newValue !== null) receive(event.newValue); };
  window.addEventListener("storage", storage);
  try {
    channel = new BroadcastChannel(key);
    channel.onmessage = (event) => receive(event.data);
  } catch { /* storage events still synchronize browsers without channels */ }
  const read = () => {
    try { receive(localStorage.getItem(key)); } catch { /* channels still work when storage is unavailable */ }
    return latest;
  };
  const record = (force = false) => {
    const now = Date.now();
    latest = Math.max(read(), now);
    if (!force && now - lastPublished < 1000) return latest;
    lastPublished = now;
    try { localStorage.setItem(key, String(latest)); } catch { /* storage is optional */ }
    channel?.postMessage(latest);
    return latest;
  };
  record(true);
  return { read, record, close: () => { window.removeEventListener("storage", storage); channel?.close(); } };
}