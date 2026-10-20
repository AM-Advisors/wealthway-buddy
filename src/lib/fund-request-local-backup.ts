// Browser-side safety copy of an in-progress Add Fund or SPV form, so a refresh or failed save
// never erases answers. Call only from effects/event handlers (uses localStorage).
export type LocalBackup<T> = { savedAt: string; request: T };

export function backupKey(clientId: string | null, draftId: string | null): string | null {
  if (!clientId) return null;
  return `fund-request-backup:${clientId}:${draftId ?? "new"}`;
}

export function writeBackup<T>(storage: Pick<Storage, "setItem">, key: string | null, request: T, now = new Date()): void {
  if (!key) return;
  try { storage.setItem(key, JSON.stringify({ savedAt: now.toISOString(), request })); } catch { /* storage full or blocked */ }
}

export function readBackup<T>(storage: Pick<Storage, "getItem">, key: string | null): LocalBackup<T> | null {
  if (!key) return null;
  try {
    const raw = storage.getItem(key);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed.savedAt !== "string" || typeof parsed.request !== "object" || !parsed.request) return null;
    return parsed as LocalBackup<T>;
  } catch { return null; }
}

export function clearBackup(storage: Pick<Storage, "removeItem">, key: string | null): void {
  if (!key) return;
  try { storage.removeItem(key); } catch { /* ignore */ }
}

/** Offer a backup only when it differs from what the server already has. */
export function shouldOfferRestore<T>(backup: LocalBackup<T> | null, serverJson: string): boolean {
  return !!backup && JSON.stringify(backup.request) !== serverJson;
}

/** Status line text: never claim saved while the last save failed. */
export function saveStatusText(s: { pending: boolean; error: string | null; savedLabel: string | null; dirty: boolean }): string {
  if (s.pending) return "Saving…";
  if (s.error) return "Not saved, retrying";
  if (s.savedLabel && !s.dirty) return `Draft saved ${s.savedLabel}`;
  return "Unsaved changes";
}
