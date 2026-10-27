import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { logSecurityEvent } from "@/lib/account-security.functions";
import { clearStoredClientContext } from "@/lib/client-context-storage";
import { isStaffSurface } from "@/lib/host-routing";
import { createSessionActivity } from "@/lib/session-activity";
import {
  SESSION_COUNTDOWN_SECONDS,
  formatCountdown,
  shouldWarn,
  idleLimitFor,
  remainingSessionSeconds,
} from "@/lib/session-timeout-model";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

/**
 * Warns every signed-in user before their idle session ends: they can choose
 * Continue to stay signed in or sign out now; ignoring the warning signs them
 * out automatically. Public pages never show it.
 */
export function SessionTimeoutNotice() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const log = useServerFn(logSecurityEvent);

  const [signedIn, setSignedIn] = useState(false);
  const [userId, setUserId] = useState<string | null>(null);
  const [warn, setWarn] = useState(false);
  const [secondsLeft, setSecondsLeft] = useState(SESSION_COUNTDOWN_SECONDS);
  const warnRef = useRef(false);
  const secondsRef = useRef(SESSION_COUNTDOWN_SECONDS);
  const lastActivity = useRef(Date.now());
  const activity = useRef<ReturnType<typeof createSessionActivity> | null>(null);
  const warningDeadline = useRef(0);
  const signingOut = useRef(false);

  const clearWarning = useCallback(() => {
    warnRef.current = false;
    secondsRef.current = SESSION_COUNTDOWN_SECONDS;
    setWarn(false);
    setSecondsLeft(SESSION_COUNTDOWN_SECONDS);
  }, []);

  const signOut = useCallback(
    async (action: string) => {
      if (signingOut.current) return;
      signingOut.current = true;
      await log({ data: { eventType: "sign_out", action } }).catch(() => {});
      await queryClient.cancelQueries();
      queryClient.clear();
      // Nothing about the last workspace, company or delegated context survives sign-out.
      clearStoredClientContext();
      await supabase.auth.signOut();
      clearWarning();
      setSignedIn(false);
      navigate({ to: "/auth", replace: true });
    },
    [log, queryClient, navigate, clearWarning],
  );

  useEffect(() => {
    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      setSignedIn(!!session);
      setUserId(session?.user.id ?? null);
      if (session) signingOut.current = false;
      if (!session) clearWarning();
    });
    void supabase.auth.getSession().then(({ data }) => {
      setSignedIn(!!data.session);
      setUserId(data.session?.user.id ?? null);
      lastActivity.current = Date.now();
    });
    return () => sub.subscription.unsubscribe();
  }, [clearWarning]);

  useEffect(() => {
    clearWarning();
    if (!userId) return;
    const shared = createSessionActivity(userId, (time) => {
      lastActivity.current = time;
      clearWarning();
    });
    activity.current = shared;
    lastActivity.current = shared.read();
    return () => { shared.close(); activity.current = null; };
  }, [userId, clearWarning]);

  useEffect(() => {
    if (!signedIn) return;
    const h = setInterval(() => {
      if (signingOut.current) return;
      const latest = activity.current?.read();
      if (latest && latest > lastActivity.current) {
        lastActivity.current = latest;
        clearWarning();
      }
      if (!warnRef.current) {
        const idle = Date.now() - lastActivity.current;
        const limit = idleLimitFor(isStaffSurface(window.location.host, window.location.pathname));
        if (shouldWarn(idle, warnRef.current, limit)) {
          warnRef.current = true;
          secondsRef.current = SESSION_COUNTDOWN_SECONDS;
          warningDeadline.current = Date.now() + SESSION_COUNTDOWN_SECONDS * 1000;
          setWarn(true);
          setSecondsLeft(SESSION_COUNTDOWN_SECONDS);
        }
      } else {
        const next = remainingSessionSeconds(warningDeadline.current, Date.now());
        secondsRef.current = next;
        setSecondsLeft(next);
        if (next === 0) void signOut("Signed out automatically after inactivity");
      }
    }, 1_000);
    return () => clearInterval(h);
  }, [signedIn, signOut, clearWarning]);

  useEffect(() => {
    if (!signedIn) return;
    // Activity anywhere keeps the session alive; clicks inside the warning
    // dialog itself never reset it, so the countdown stays honest.
    const active = () => {
      if (!warnRef.current) lastActivity.current = activity.current?.record() ?? Date.now();
    };
    const events: (keyof DocumentEventMap)[] = ["pointerdown", "keydown", "wheel", "mousemove", "touchstart", "scroll"];
    events.forEach((e) => document.addEventListener(e, active, { passive: true }));
    return () => events.forEach((e) => document.removeEventListener(e, active));
  }, [signedIn]);

  const staySignedIn = useCallback(() => {
    // Refresh the access token now so the continued session is fully valid.
    void supabase.auth.refreshSession().catch(() => {});
    lastActivity.current = activity.current?.record(true) ?? Date.now();
    clearWarning();
  }, [clearWarning]);

  if (!signedIn || !warn) return null;

  return (
    <AlertDialog open>
      <AlertDialogContent
        onEscapeKeyDown={(e: KeyboardEvent) => e.preventDefault()}
      >
        <AlertDialogHeader>
          <AlertDialogTitle>You're about to be signed out</AlertDialogTitle>
          <AlertDialogDescription>
            You've been inactive for a while. For your security, you'll be signed out in{" "}
            {formatCountdown(secondsLeft)}. Choose Continue to keep working, or sign out now.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel onClick={staySignedIn}>Continue</AlertDialogCancel>
          <AlertDialogAction
            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            onClick={(e) => {
              e.preventDefault();
              void signOut("Signed out from the inactivity notice");
            }}
          >
            Sign out now
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
