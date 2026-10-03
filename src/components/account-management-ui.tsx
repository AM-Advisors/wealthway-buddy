import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Badge } from "@/components/ui/badge";
import { getAmDashboard } from "@/lib/account-management.functions";

export function useAmDashboard() {
  const load = useServerFn(getAmDashboard);
  return useQuery({ queryKey: ["am-dashboard"], queryFn: () => load(), retry: false });
}

export const healthVariant = (h: string) => (h === "At risk" ? "destructive" : h === "Needs attention" ? "outline" : "secondary") as "destructive" | "outline" | "secondary";
export const money = (c: number) => `$${(c / 100).toLocaleString("en-US", { maximumFractionDigits: 0 })}`;

export function AmPage({ title, intro, children }: { title: string; intro: string; children: React.ReactNode }) {
  return (
    <main className="mx-auto max-w-6xl space-y-6 px-4 py-10">
      <header><h1 className="text-3xl">{title}</h1><p className="mt-2 text-sm text-muted-foreground">{intro}</p></header>
      {children}
    </main>
  );
}

type Handoff = { id: string; client: string; clientId: string; quote: string; title: string; signedAt: string; cents: number; fundId: string | null; handedOff: boolean; setupStarted: boolean };
export function HandoffList({ rows }: { rows: Handoff[] }) {
  if (!rows.length) return <p className="text-sm text-muted-foreground">No clients signed in the last 30 days.</p>;
  return (
    <ul className="divide-y">{rows.map((h) => (
      <li key={h.id} className="flex flex-wrap items-center justify-between gap-2 py-2 text-sm">
        <div>
          <Link to="/ops/clients/$clientId" params={{ clientId: h.clientId }} search={{} as never} className="font-medium hover:underline">{h.client}</Link>
          <p className="text-xs text-muted-foreground">{h.quote} · {h.title} · {money(h.cents)} · signed {new Date(h.signedAt).toLocaleDateString()}</p>
        </div>
        <div className="flex gap-2">
          <Badge variant={h.handedOff ? "secondary" : "outline"}>{h.handedOff ? "Draft fund created" : "Hand-off pending"}</Badge>
          <Badge variant={h.setupStarted ? "secondary" : "outline"}>{h.setupStarted ? "Setup started" : "Setup not started"}</Badge>
          {h.fundId && <Link to="/ops/fund-setup/$fundId" params={{ fundId: h.fundId }} className="text-xs text-primary hover:underline">Open fund setup</Link>}
        </div>
      </li>))}
    </ul>
  );
}

type Renewal = { id: string; client: string; clientId: string; title: string; ends: string; days: number };
export function RenewalList({ rows }: { rows: Renewal[] }) {
  if (!rows.length) return <p className="text-sm text-muted-foreground">No SOWs ending in the next 90 days.</p>;
  return (
    <ul className="divide-y">{rows.map((r) => (
      <li key={r.id} className="flex flex-wrap items-center justify-between gap-2 py-2 text-sm">
        <div>
          <Link to="/ops/clients/$clientId" params={{ clientId: r.clientId }} search={{} as never} className="font-medium hover:underline">{r.client}</Link>
          <p className="text-xs text-muted-foreground">{r.title}</p>
        </div>
        <Badge variant={r.days <= 30 ? "destructive" : "outline"}>Ends {r.ends} · {r.days} days</Badge>
      </li>))}
    </ul>
  );
}
