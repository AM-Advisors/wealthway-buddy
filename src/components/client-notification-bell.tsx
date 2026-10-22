import { Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Bell } from "lucide-react";

import { listMyNotifications, markNotificationsRead } from "@/lib/client-dashboard.functions";
import { getAttention } from "@/lib/attention.functions";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

/** Portal bell: open items waiting on the person plus recent status notices. */
export function ClientNotificationBell() {
  const list = useServerFn(listMyNotifications);
  const mark = useServerFn(markNotificationsRead);
  const att = useServerFn(getAttention);
  const qc = useQueryClient();
  const n = useQuery({ queryKey: ["my-notifications"], queryFn: () => list(), refetchInterval: 60_000, retry: false });
  const a = useQuery({ queryKey: ["attention", "company"], queryFn: () => att({ data: { workspace: "company" } }) as Promise<any>, retry: false });
  const needs = ((a.data?.groups?.needs_you ?? []) as any[]);
  const notes = (n.data ?? []) as any[];
  const unread = notes.filter((x) => !x.read_at).length;
  const count = unread + needs.length;
  const readAll = async () => { await mark({ data: { ids: null } }); qc.invalidateQueries({ queryKey: ["my-notifications"] }); };

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="outline" size="icon" className="relative" aria-label={`Notifications${count ? `, ${count} need attention` : ""}`}>
          <Bell className="h-4 w-4" />
          {count > 0 && <span className="absolute -right-1 -top-1 min-w-5 rounded-full bg-destructive px-1 text-center text-[10px] font-semibold leading-5 text-destructive-foreground">{count > 99 ? "99+" : count}</span>}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80 p-0">
        <div className="flex items-center justify-between border-b px-3 py-2">
          <p className="text-sm font-medium">Notifications</p>
          {unread > 0 && <button className="text-xs text-primary underline" onClick={readAll}>Mark all read</button>}
        </div>
        <div className="max-h-96 overflow-y-auto">
          {needs.length > 0 && <p className="px-3 pt-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">Waiting on you</p>}
          {needs.slice(0, 10).map((i) => (
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
          {!needs.length && !notes.length && <p className="px-3 py-6 text-center text-sm text-muted-foreground">You're all caught up.</p>}
        </div>
      </PopoverContent>
    </Popover>
  );
}
