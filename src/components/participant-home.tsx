import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { ArrowRight } from "lucide-react";
import { myParticipantAssignmentsFn } from "@/lib/participant-home.functions";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { LoadError } from "@/components/load-error";

export function useParticipantAssignments() {
  const load = useServerFn(myParticipantAssignmentsFn);
  return useQuery({ queryKey: ["my-participant-assignments"], queryFn: () => load(), retry: false, refetchInterval: 60_000 });
}

export function ParticipantHome() {
  const q = useParticipantAssignments();
  if (q.isError) return <LoadError audience="account" what="Your assigned investments" error={q.error} onRetry={() => void q.refetch()} />;
  if (q.isPending) return <p className="text-sm text-muted-foreground">Loading assigned investments…</p>;
  if (!q.data?.length) return null;
  return <section className="space-y-3" aria-label="Investments you help with">
    <h2 className="text-xl font-semibold">Investments you help with</h2>
    <ul className="divide-y rounded-lg border">
      {q.data.map((p) => <li key={p.id} className="flex flex-wrap items-center justify-between gap-4 p-4">
        <div className="min-w-0 space-y-1"><p className="break-words text-base font-semibold">{p.fundName}</p>
          <p className="break-words text-sm text-muted-foreground">{p.investingAs}</p><Badge variant="outline">{p.roleLabel}</Badge></div>
        <Button asChild variant="outline"><Link to={p.href as never}>{p.role === "preparer" ? "Open investor details" : "View investment"}<ArrowRight className="size-4" /></Link></Button>
      </li>)}
    </ul>
  </section>;
}