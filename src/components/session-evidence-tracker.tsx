import { useEffect, useRef } from "react";
import { useRouterState } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { logSecurityEvent } from "@/lib/account-security.functions";
import { browserErrorCategory, evidencePath } from "@/lib/session-evidence";
import type { Session } from "@supabase/supabase-js";

/** Mounted outside all gates: no DOM, inputs, response bodies or error messages recorded. */
export function SessionEvidenceTracker() {
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  const log = useServerFn(logSecurityEvent);
  const path = useRef(pathname);
  const recordPage = useRef<(() => void) | null>(null);
  path.current = pathname;

  useEffect(() => {
    let active = true;
    let userId: string | null = null;
    let lastError = 0;
    let lastPage = "";
    let busy = false;
    let sessionKey: string | null = null;
    let loggedSession: string | null = null;
    let deviceId: string | undefined;
    try {
      deviceId = localStorage.getItem("hm-device-id") ?? crypto.randomUUID();
      localStorage.setItem("hm-device-id", deviceId);
    } catch { /* storage is optional */ }
    const send = async (eventType: "sign_in" | "page_view" | "client_error", action?: string) => {
      if (!active || !userId) return false;
      try {
        const result = await log({ data: { eventType, action, path: evidencePath(path.current), deviceId } });
        if (result.signOut) { await supabase.auth.signOut(); return false; }
        return "recorded" in result && result.recorded === true;
      } catch { return false; }
    };
    const page = async () => {
      const current = evidencePath(path.current);
      if (!userId || current === lastPage) return;
      if (await send("page_view")) lastPage = current;
    };
    recordPage.current = () => { void page(); };
    const observe = async () => {
      if (busy || !active || !userId) return;
      busy = true;
      try {
        if (sessionKey && loggedSession !== sessionKey && await send("sign_in", "Authenticated session observed")) loggedSession = sessionKey;
        await page();
      }
      finally { busy = false; }
    };
    const updateSession = (session: Session | null) => {
      if (userId !== (session?.user.id ?? null)) lastPage = "";
      userId = session?.user.id ?? null;
      // Used only for local deduplication; the server independently verifies claims.
      sessionKey = null;
      if (session) {
        try {
          const payload = session.access_token.split(".")[1];
          if (payload) {
            const claims = JSON.parse(atob(payload.replace(/-/g, "+").replace(/_/g, "/"))) as { session_id?: unknown };
            if (typeof claims.session_id === "string") sessionKey = `${session.user.id}:${claims.session_id}`;
          }
        } catch { /* malformed tokens never become evidence */ }
      }
    };
    const { data: subscription } = supabase.auth.onAuthStateChange((_event, session) => {
      updateSession(session);
      // Auth callbacks must not await another auth call.
      window.setTimeout(() => { void observe(); }, 0);
    });
    void supabase.auth.getSession().then(({ data }) => {
      if (!active) return;
      updateSession(data.session);
      void observe();
    });
    const error = (kind: "error" | "rejection", name: unknown) => {
      if (!userId || Date.now() - lastError < 10_000) return;
      lastError = Date.now();
      void send("client_error", browserErrorCategory(kind, name));
    };
    const onError = (event: ErrorEvent) => error("error", event.error instanceof Error ? event.error.name : undefined);
    const onRejection = (event: PromiseRejectionEvent) => error("rejection", event.reason instanceof Error ? event.reason.name : undefined);
    window.addEventListener("error", onError);
    window.addEventListener("unhandledrejection", onRejection);
    const retry = window.setInterval(() => { void observe(); }, 60_000);
    return () => {
      active = false;
      recordPage.current = null;
      subscription.subscription.unsubscribe();
      window.clearInterval(retry);
      window.removeEventListener("error", onError);
      window.removeEventListener("unhandledrejection", onRejection);
    };
  }, [log]);

  useEffect(() => { recordPage.current?.(); }, [pathname]);
  return null;
}