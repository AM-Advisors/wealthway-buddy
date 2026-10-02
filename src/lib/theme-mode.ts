import { useCallback, useEffect, useState } from "react";

export type ThemeMode = "light" | "dark" | "auto";
const KEY = "harmonious-theme";

/** Runs before first paint so the chosen mode never flashes. */
export const THEME_BOOT_SCRIPT = `(function(){try{var m=localStorage.getItem('${KEY}')||'auto';var d=m==='dark'||(m==='auto'&&matchMedia('(prefers-color-scheme: dark)').matches);document.documentElement.classList.toggle('dark',d);}catch(e){}})();`;

function apply(mode: ThemeMode) {
  const dark = mode === "dark" || (mode === "auto" && window.matchMedia("(prefers-color-scheme: dark)").matches);
  document.documentElement.classList.toggle("dark", dark);
}

export function useThemeMode() {
  const [mode, setModeState] = useState<ThemeMode>("auto");
  useEffect(() => {
    const saved = (localStorage.getItem(KEY) as ThemeMode | null) ?? "auto";
    setModeState(saved);
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const onChange = () => apply((localStorage.getItem(KEY) as ThemeMode | null) ?? "auto");
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);
  const setMode = useCallback((m: ThemeMode) => {
    localStorage.setItem(KEY, m);
    setModeState(m);
    apply(m);
  }, []);
  return { mode, setMode };
}
