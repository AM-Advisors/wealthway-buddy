import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { investorSessionActivityFn } from "@/lib/investor-session-activity.functions";

const human = (s: string | null | undefined) => (s ? s.replace(/[_.]/g, " ").replace(/^./, (m) => m.toUpperCase()) : "");
const device = (ua: string | null) => !ua ? "" : /iphone|ipad/i.test(ua) ? "iPhone/iPad" : /android/i.test(ua) ? "Android" : /mac/i.test(ua) ? "Mac" : /windows/i.test(ua) ? "Windows" : "Browser";

/** Staff only: sign-ins and what the investor did, grouped by session. */
export function InvestorSessionActivity({ onboardingId }: { onboardingId: string }) {
  const load = useServerFn(investorSessionActivityFn);
  const q = useQuery({ queryKey: ["investor-session-activity", onboardingId], queryFn: () => load({ data: { onboardingId } }) });
  const [shown, setShown] = useState(5);
  const events = q.data?.events ?? [];
  const sessions: { id: string; items: typeof events }[] = [];
  for (const e of events) {
    const key = e.session_id ?? e.created_at.slice(0, 10);
    const last = sessions[sessions.length - 1];
    if (last && last.id === key) last.items.push(e); else sessions.push({ id: key, items: [e] });
  }
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base">Sign-ins and activity</CardTitle>
        <CardDescription>Recorded sign-ins and pages or actions in their account, newest first. Staff only.</CardDescription>
      </CardHeader>
      <CardContent className="text-sm">
        {q.isLoading ? <p className="text-muted-foreground">Loading…</p>
          : q.error ? <p className="text-destructive">Activity could not be loaded.</p>
          : !q.data?.hasAccount ? <p className="text-muted-foreground">The investor has not created an account yet.</p>
          : !sessions.length ? <p className="text-muted-foreground">No sign-ins recorded yet.</p>
          : <div className="space-y-4">
            {sessions.slice(0, shown).map((s) => {
              const first = s.items[s.items.length - 1]!;
              return <div key={s.id + first.created_at} className="rounded-md border p-3">
                <p className="font-medium">{new Date(first.created_at).toLocaleString()}</p>
                <p className="text-xs text-muted-foreground">{[first.ip, [first.city, first.region, first.country].filter(Boolean).join(", "), device(first.user_agent)].filter(Boolean).join(" · ")}</p>
                <ul className="mt-2 space-y-1">
                  {[...s.items].reverse().map((e) => <li key={e.id} className="flex flex-wrap justify-between gap-2">
                    <span>{human(e.action || e.event_type)}{e.path ? <span className="text-muted-foreground"> · {e.path}</span> : null}</span>
                    <span className="text-xs text-muted-foreground">{new Date(e.created_at).toLocaleTimeString()}</span>
                  </li>)}
                </ul>
              </div>;
            })}
            {sessions.length > shown ? <Button size="sm" variant="outline" onClick={() => setShown((n) => n + 10)}>Show more sessions</Button> : null}
          </div>}
      </CardContent>
    </Card>
  );
}
