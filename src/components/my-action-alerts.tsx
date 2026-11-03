import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";

import { LoadError } from "@/components/load-error";
import { getMyActionAlerts } from "@/lib/staff-tasks.functions";

/** Shared query so menu badges and page lists agree. Read only; nothing is emailed. */
export function useMyActionAlerts(enabled = true) {
  const load = useServerFn(getMyActionAlerts);
  return useQuery({ queryKey: ["my-action-alerts"], queryFn: () => load(), enabled, refetchInterval: 60_000, staleTime: 30_000, retry: false });
}

export function MyActionAlerts({ kinds }: { kinds: string[] }) {
  const q = useMyActionAlerts();
  if (q.isError) return <LoadError error={q.error} what="Your alerts" onRetry={() => q.refetch()} />;
  const items = (q.data?.alerts ?? []).filter((a: any) => kinds.includes(a.kind));
  if (!items.length) return null;
  return (
    <section aria-label="Waiting on you" className="space-y-2 rounded-lg border border-primary/30 bg-primary/5 p-3">
      <h2 className="text-base font-semibold">Waiting on you ({items.length})</h2>
      <ul className="space-y-1">
        {items.map((a: any) => (
          <li key={a.id} className="text-sm">
            <Link to={a.href as never} className="font-medium text-primary hover:underline">{a.title}</Link>
            <span className="block text-muted-foreground">{a.detail}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}
