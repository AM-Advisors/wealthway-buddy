import { Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Bell } from "lucide-react";

import { listMyNotifications, markNotificationsRead } from "@/lib/client-insights.functions";
import { getAttention } from "@/lib/attention.functions";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { useClientWorkspace } from "@/components/client-workspace";
import { useInvestorDashboard } from "@/components/investor-dashboard";
import { useParticipantAssignments } from "@/components/participant-home";

/** Portal bell: open items waiting on the person plus recent status notices. */
export function ClientNotificationBell() {
  const { activeKind } = useClientWorkspace();
  const investor = useInvestorDashboard(false, activeKind === "investor" || activeKind === null);
  const assignments = useParticipantAssignments();
  const list = useServerFn(listMyNotifications);
  const mark = useServerFn(markNotificationsRead);
  const att = useServerFn(getAttention);
  const qc = useQueryClient();
  const n = useQuery({ queryKey: ["my-notifications"], queryFn: () => list(), refetchInterval: 60_000, retry: false });
  const a = useQuery({ queryKey: ["attention", activeKind ?? "auto"], queryFn: () => att({ data: activeKind ? { workspace: activeKind } : {} }) as Promise<any>, retry: false, refetchInterval: 60_000 });
  const covered = new Set(investor.data?.investments.map((i) => i.id) ?? []);
  const needs = ((a.data?.groups?.needs_you ?? []) as any[]).filter((i) => !(i.sourceTable === "investor_onboardings" && covered.has(i.sourceId)));
  const tasks = investor.data?.investments.flatMap((i) => (i.outstandingTasks ?? []).map((t) => ({ ...t, id: `${i.id}:${t.key}`, fundName: i.fundName, href: `/investment/${i.id}` }))) ?? [];
  const notes = (n.data ?? []) as any[];
  const unread = notes.filter((x) => !x.read_at).length;
  const count = unread + needs.length + tasks.filter((t) => t.actionable).length;
  const readAll = async () => { await mark({ data: { ids: null } }); qc.invalidateQueries({ queryKey: ["my-notifications"] }); };

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="outline" size="icon" className="relative" aria-label={`Notifications${count ? `, ${count} need attention` : ""}`}>
          <Bell className="h-4 w-4" />
          {count > 0 && <span className="absolute -right-1 -top-1 min-w-5 rounded-full bg-destructive px-1 text-center text-[10px] font-semibold leading-5 text-destructive-foreground">{count > 99 ? "99+" : count}</span>}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-96 max-w-[calc(100vw-2rem)] p-0">
        <div className="flex items-center justify-between border-b px-3 py-2">
          <p className="text-sm font-medium">Notifications</p>
          {unread > 0 && <Button variant="ghost" size="sm" onClick={readAll}>Mark all read</Button>}
        </div>
        <div className="max-h-[min(24rem,40dvh)] overflow-y-auto">
          {(a.isError || investor.isError || assignments.isError || n.isError) && <p className="px-3 py-3 text-sm text-destructive">Some tasks or updates could not be loaded.</p>}
          {(tasks.length > 0 || needs.length > 0) && <p className="px-3 pt-3 text-sm font-semibold">Outstanding tasks</p>}
          {tasks.map((t) => <Link key={t.id} to={t.href as never} className="block border-b px-3 py-3 text-sm hover:bg-muted/60"><span className="font-medium">{t.label}</span><span className="mt-1 block text-sm text-muted-foreground">{t.fundName} · {t.status}</span></Link>)}
          {!!assignments.data?.length && <p className="px-3 pt-3 text-sm font-semibold">Investments you help with</p>}
          {assignments.data?.map((p) => <Link key={p.id} to={p.href as never} className="block border-b px-3 py-3 text-sm hover:bg-muted/60"><span className="font-medium">{p.fundName}</span><span className="mt-1 block text-sm text-muted-foreground">{p.investingAs} · {p.roleLabel}</span></Link>)}
          {needs.length > 0 && <p className="px-3 pt-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">Waiting on you</p>}
          {needs.map((i) => (
            <Link key={i.id} to={i.href as any} className="block border-b px-3 py-2 text-sm hover:bg-muted/60">
              <span className="font-medium">{i.title}</span>
              <span className="block text-xs text-muted-foreground">{i.fundName ? `${i.fundName} · ` : ""}{i.status}</span>
            </Link>
          ))}
          {notes.length > 0 && <p className="px-3 pt-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">Updates</p>}
          {notes.map((x) => (
            <Link key={x.id} to={(x.path || "/client") as any} onClick={() => !x.read_at && mark({ data: { ids: [x.id] } }).then(() => qc.invalidateQueries({ queryKey: ["my-notifications"] }))}
              className="block border-b px-3 py-2 text-sm hover:bg-muted/60">
              <span className={x.read_at ? "" : "font-semibold"}>{x.title}</span>
              {x.body && <span className="block text-xs text-muted-foreground">{x.body}</span>}
              <span className="block text-[11px] text-muted-foreground">{new Date(x.created_at).toLocaleString()}</span>
            </Link>
          ))}
          {!needs.length && !notes.length && !tasks.length && !assignments.data?.length && !a.isPending && !n.isPending && !investor.isPending && !assignments.isPending && !a.isError && !n.isError && !investor.isError && !assignments.isError && <p className="px-3 py-6 text-center text-sm text-muted-foreground">You're all caught up.</p>}
        </div>
        <Button asChild variant="ghost" className="w-full rounded-none border-t"><Link to="/prepared">View all notifications & tasks</Link></Button>
      </PopoverContent>
    </Popover>
  );
}
