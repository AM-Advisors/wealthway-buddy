// Visitor cookie choices for the public site. Stored only in this browser.
// Any future analytics/marketing script must check hasConsent() before loading.
export type CookieCategory = "functional" | "analytics" | "marketing";
export type CookieChoices = { necessary: true } & Record<CookieCategory, boolean>;

const KEY = "harmonious-cookie-consent-v1";
const EVENT = "harmonious-cookie-consent";
export const OPEN_SETTINGS_EVENT = "harmonious-cookie-settings-open";

export const COOKIE_CATEGORIES: { id: "necessary" | CookieCategory; label: string; description: string }[] = [
  { id: "necessary", label: "Strictly necessary", description: "Sign-in, security and remembering these choices. Always on." },
  { id: "functional", label: "Preferences", description: "Remembers settings like light or dark mode." },
  { id: "analytics", label: "Analytics", description: "Helps us understand which pages are used so we can improve them." },
  { id: "marketing", label: "Marketing", description: "Measures our campaigns and shows relevant Harmonious content." },
];

export function readConsent(): (CookieChoices & { savedAt: string }) | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export function saveConsent(c: Omit<CookieChoices, "necessary">) {
  const value = { necessary: true, ...c, savedAt: new Date().toISOString() };
  window.localStorage.setItem(KEY, JSON.stringify(value));
  window.dispatchEvent(new CustomEvent(EVENT, { detail: value }));
}

export function hasConsent(cat: CookieCategory): boolean {
  return !!readConsent()?.[cat];
}

export function openCookieSettings() {
  window.dispatchEvent(new Event(OPEN_SETTINGS_EVENT));
}
