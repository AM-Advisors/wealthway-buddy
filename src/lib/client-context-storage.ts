import { storageKeysToClear } from "@/lib/client-navigation";

function purge(store: Storage) {
  const keys: string[] = [];
  for (let i = 0; i < store.length; i += 1) {
    const key = store.key(i);
    if (key) keys.push(key);
  }
  for (const key of storageKeysToClear(keys)) store.removeItem(key);
}

/**
 * Forgets every record the browser was holding on to — the active workspace,
 * the chosen company, anything else this application stored — leaving only
 * cosmetic layout state. Used when switching workspace and when signing out.
 */
export function clearStoredClientContext() {
  if (typeof window === "undefined") return;
  for (const store of [window.sessionStorage, window.localStorage]) {
    try {
      purge(store);
    } catch {
      /* storage unavailable — nothing was remembered in the first place */
    }
  }
}
