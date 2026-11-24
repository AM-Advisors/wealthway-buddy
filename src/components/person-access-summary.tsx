import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Badge } from "@/components/ui/badge";
import { getPersonAccessSummary } from "@/lib/user-access.functions";

const KIND: Record<string, string> = {
  staff: "Staff role",
  fund_manager: "Fund manager",
  client_member: "Client member",
  fund_team: "Fund team",
  investor: "Investor",
};

/** Everything this person can open, and why. Read-only; changes stay in the sections below. */
export function PersonAccessSummary({ userId }: { userId: string }) {
  const load = useServerFn(getPersonAccessSummary);
  const q = useQuery({ queryKey: ["person-access-summary", userId], queryFn: () => load({ data: { userId } }), retry: false });
  return (
    <section className="rounded-lg border">
      <div className="flex flex-wrap items-center gap-2 border-b p-4">
        <h2 className="mr-auto text-lg">Access</h2>
        {q.data && <Badge variant={q.data.hasPerson ? "outline" : "destructive"}>{q.data.hasPerson ? "Linked to person record" : "No person record"}</Badge>}
      </div>
      {q.isLoading && <p className="p-4 text-sm text-muted-foreground">Loading…</p>}
      {q.error && <p className="p-4 text-sm text-destructive">{(q.error as Error).message}</p>}
      {q.data && !q.data.lines.length && <p className="p-4 text-sm text-muted-foreground">This person can't open any fund or client.</p>}
      {q.data && q.data.lines.length > 0 && (
        <ul className="divide-y text-sm">
          {q.data.lines.map((l, i) => (
            <li key={`${l.kind}-${l.fundId ?? l.clientId ?? i}`} className="flex flex-wrap items-center gap-2 p-3">
              <Badge variant="outline">{KIND[l.kind]}</Badge><span>{l.label}</span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
