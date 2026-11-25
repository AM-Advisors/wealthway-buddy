import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Link } from "@tanstack/react-router";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { fundOpenItemsFn } from "@/lib/fund-work.functions";
import { groupFor, type FundWorkItem } from "@/lib/fund-work-model";

type Mode = "harmonious" | "manager" | string;
const GROUPS = [
  { key: "you", label: "Needs you" },
  { key: "harmonious", label: "Harmonious handling" },
  { key: "waiting", label: "Waiting on someone else" },
] as const;

function OpenLink({ item, fundId, mode }: { item: FundWorkItem; fundId: string; mode: Mode }) {
  const cls = "text-sm font-medium text-primary hover:underline";
  if (item.onboardingId) {
    return mode === "harmonious"
      ? <Link to="/ops/fund/$fundId/investor/$onboardingId" params={{ fundId, onboardingId: item.onboardingId }} className={cls}>Open →</Link>
      : <Link to="/manager/fund/$fundId/investor/$onboardingId" params={{ fundId, onboardingId: item.onboardingId }} className={cls}>Open →</Link>;
  }
  return mode === "harmonious"
    ? <Link to="/ops/fund/$fundId" params={{ fundId }} search={(p: any) => ({ ...p, tab: item.tab })} className={cls}>Open →</Link>
    : <Link to="/client/funds/$fundId" params={{ fundId }} search={(p: any) => ({ ...p, tab: item.tab })} className={cls}>Open →</Link>;
}

/** Every open item for the fund, grouped by who it waits on. Read-only; actions stay on their own screens. */
export function FundOpenItems({ fundId, mode }: { fundId: string; mode: Mode }) {
  const load = useServerFn(fundOpenItemsFn);
  const q = useQuery({ queryKey: ["fund-open-items", fundId], queryFn: () => load({ data: { fundId } }) });
  const [group, setGroup] = useState<"all" | "you" | "harmonious" | "waiting">("all");
  if (q.isLoading) return <p className="text-sm text-muted-foreground">Loading open items…</p>;
  if (q.error) return <div className="space-y-2 rounded-md border p-6 text-center text-sm"><p className="text-destructive">Couldn't load open items.</p><Button size="sm" variant="outline" onClick={() => q.refetch()}>Try again</Button></div>;
  const staff = !!q.data?.staff;
  const items = q.data?.items ?? [];
  const by = (k: string) => items.filter((i) => groupFor(i, staff) === k);
  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-lg font-semibold">Open items</h2>
        <p className="text-sm text-muted-foreground">Everything still waiting on this fund. Click Open to handle it where it lives.</p>
      </div>
      {!!q.data?.failed.length && <p className="rounded-md border border-destructive/40 p-3 text-sm text-destructive">Couldn't load: {q.data.failed.join(", ")}. Try again in a moment.</p>}
      <div className="flex flex-wrap gap-2">
        <Button size="sm" variant={group === "all" ? "default" : "outline"} onClick={() => setGroup("all")}>All ({items.length})</Button>
        {GROUPS.map((g) => <Button key={g.key} size="sm" variant={group === g.key ? "default" : "outline"} onClick={() => setGroup(g.key)}>{g.label} ({by(g.key).length})</Button>)}
      </div>
      {items.length === 0 ? <p className="rounded-md border p-6 text-center text-sm text-muted-foreground">Nothing open on this fund.</p> : GROUPS.filter((g) => group === "all" || group === g.key).map((g) => {
        const list = by(g.key);
        if (!list.length) return null;
        return (
          <section key={g.key} className="space-y-2">
            <h3 className="text-base font-medium text-muted-foreground">{g.label}</h3>
            <ul className="divide-y rounded-md border">
              {list.map((i) => (
                <li key={i.id} className="flex flex-wrap items-center gap-3 p-3">
                  <div className="min-w-0 flex-1">
                    <p className="font-medium">{i.title}</p>
                    <p className="text-sm text-muted-foreground">{i.label}{i.due ? ` · Due ${i.due}` : ""}</p>
                  </div>
                  <Badge variant="outline">{i.status}</Badge>
                  <OpenLink item={i} fundId={fundId} mode={mode} />
                </li>
              ))}
            </ul>
          </section>
        );
      })}
    </div>
  );
}
