import { useEffect } from "react";
import { useRouterState } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { recordStaffActivity } from "@/lib/staff-directory.functions";

/**
 * Records page views and clicks for every signed-in user (staff and clients) so
 * People & Access can show their full activity trail. Only labels of buttons and
 * links are kept, never typed values. Best-effort: failures are ignored.
 */
export function ActivityTracker() {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const log = useServerFn(recordStaffActivity);

  useEffect(() => {
    const t = setTimeout(async () => {
      const { data } = await supabase.auth.getSession();
      if (!data.session) return;
      void log({ data: { kind: "page", path: pathname.slice(0, 300), label: document.title.replace(/ - Harmonious.*$/, "").slice(0, 200) || null } }).catch(() => {});
    }, 800);
    return () => clearTimeout(t);
  }, [pathname, log]);

  useEffect(() => {
    let last = 0;
    const onClick = async (e: MouseEvent) => {
      const el = (e.target as HTMLElement | null)?.closest?.("a,button,[role=button],[role=tab],[role=menuitem],[role=option],summary") as HTMLElement | null;
      if (!el || el.closest("input,textarea,[contenteditable=true]")) return;
      const now = Date.now();
      if (now - last < 300) return;
      last = now;
      const text = (el.getAttribute("aria-label") || el.textContent || "").replace(/\s+/g, " ").trim().slice(0, 120);
      if (!text) return;
      const { data } = await supabase.auth.getSession();
      if (!data.session) return;
      const href = el instanceof HTMLAnchorElement ? ` → ${el.getAttribute("href") ?? ""}` : "";
      void log({ data: { kind: "click", path: window.location.pathname.slice(0, 300), label: `${text}${href}`.slice(0, 200) } }).catch(() => {});
    };
    document.addEventListener("click", onClick, true);
    return () => document.removeEventListener("click", onClick, true);
  }, [log]);

  return null;
}
