import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { ArrowDown, ArrowUp, GripVertical, Settings2 } from "lucide-react";
import { toast } from "sonner";

import { CapTablesCard } from "@/components/cap-table-billing";
import { AttentionCenter } from "@/components/attention-center";
import { ClientDashboard } from "@/components/client-dashboard";
import { ClientSowPanel } from "@/components/client-sow-panel";
import { FundComparison, InsightCharts, InsightFilterBar, ServiceCosts, SummaryTiles, useInsights, type InsightFilters } from "@/components/client-insights";
import { useClientPortal } from "@/components/client-portal-context";
import { getClientRecords } from "@/lib/client-records.functions";
import { getClientInsights, getDashboardPrefs, saveDashboardPrefs } from "@/lib/client-insights.functions";
import { DASHBOARD_CARDS, DEFAULT_ORDER, PERIODS, PERIOD_LABEL, resolveLayout, type CardId, type Period } from "@/lib/client-dashboard-model";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

export const Route = createFileRoute("/_authenticated/client/")({
  head: () => ({
    meta: [
      { title: "Portal overview - Harmonious" },
      { name: "description", content: "What needs your attention, plus Harmonious costs, capital raised and fees earned by fund and service." },
      { property: "og:title", content: "Portal overview - Harmonious" },
      { property: "og:description", content: "Attention items, costs and earnings by fund, service and period." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: ClientOverviewPage,
});

function ClientOverviewPage() {
  const { data, clientId } = useClientPortal();
  const activeClientId = clientId ?? ((data?.client as any)?.id as string | undefined) ?? null;
  const loadRecords = useServerFn(getClientRecords);
  const loadInsights = useServerFn(getClientInsights);
  const loadPrefs = useServerFn(getDashboardPrefs);
  const savePrefs = useServerFn(saveDashboardPrefs);
  const qc = useQueryClient();

  const { data: records } = useQuery({ queryKey: ["client-records", activeClientId], queryFn: () => loadRecords({ data: { clientId: activeClientId } }), retry: false });
  const insights = useQuery({ queryKey: ["client-insights", activeClientId], enabled: !!activeClientId, queryFn: () => loadInsights({ data: { clientId: activeClientId! } }), retry: false });
  const prefs = useQuery({ queryKey: ["dash-prefs", activeClientId], enabled: !!activeClientId, queryFn: () => loadPrefs({ data: { clientId: activeClientId! } }), retry: false });

  const layout = useMemo(() => resolveLayout(prefs.data?.layout, prefs.data?.hidden), [prefs.data]);
  const [filters, setFilters] = useState<InsightFilters>({ period: "month", fundId: null, service: null });
  useEffect(() => {
    if (prefs.data) setFilters((f) => ({ ...f, period: (prefs.data.default_period as Period) ?? "month", fundId: prefs.data.default_fund_id ?? null }));
  }, [prefs.data]);

  const facts = (insights.data?.facts ?? []) as any[];
  const fundsList = insights.data?.funds ?? [];
  const services = useMemo(() => [...new Set(facts.filter((f) => f.service).map((f) => String(f.service)))].sort(), [facts]);
  const view = useInsights(facts, filters);

  const [editing, setEditing] = useState(false);
  const save = async (next: { order: CardId[]; hidden: CardId[]; period: Period; fundId: string | null }) => {
    if (!activeClientId) return;
    try {
      await savePrefs({ data: { clientId: activeClientId, layout: next.order, hidden: next.hidden, defaultPeriod: next.period, defaultFundId: next.fundId } });
      qc.invalidateQueries({ queryKey: ["dash-prefs", activeClientId] });
      toast.success("Dashboard saved");
      setEditing(false);
    } catch (e) { toast.error((e as Error).message); }
  };

  const funds = (data?.funds ?? []) as any[];
  const sows = (data?.sows ?? []) as any[];
  const cards: Record<CardId, React.ReactNode> = {
    attention: <AttentionCenter workspace="company" />,
    summary: <SummaryTiles total={view.total} />,
    insights: <InsightCharts buckets={view.buckets} />,
    services: <ServiceCosts rows={view.services} />,
    funds: <FundComparison deals={view.deals} />,
    records: (
      <ClientDashboard funds={funds} invoices={(data?.invoices ?? []) as any[]} payments={(data?.payments ?? []) as any[]}
        wireRequests={(data?.wireRequests ?? []) as any[]} serviceRequests={((data as any)?.serviceRequests ?? []) as any[]}
        services={(data?.services ?? []) as any[]} sows={sows}
        signedDocuments={(records?.signedDocuments ?? []) as any[]} statements={(records?.statements ?? []) as any[]} />
    ),
    sow: sows.length ? <ClientSowPanel sows={sows} /> : null,
    captables: <CapTablesCard />,
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <InsightFilterBar funds={fundsList} services={services} value={filters} onChange={setFilters} />
        <div className="flex items-center gap-2">
          <Link to="/client/setup-options" className="text-xs text-muted-foreground underline">White-label options</Link>
          <Button size="sm" variant="outline" onClick={() => setEditing(true)}><Settings2 className="mr-1 h-4 w-4" /> Customize</Button>
        </div>
      </div>
      {insights.error && <p className="text-sm text-destructive">{(insights.error as Error).message}</p>}
      {layout.order.filter((id) => !layout.hidden.includes(id)).map((id) => cards[id] ? <section key={id}>{cards[id]}</section> : null)}
      {editing && <CustomizeDialog initial={layout} period={filters.period} fundId={filters.fundId} funds={fundsList} onClose={() => setEditing(false)} onSave={save} />}
    </div>
  );
}

function CustomizeDialog({ initial, period, fundId, funds, onClose, onSave }: {
  initial: { order: CardId[]; hidden: CardId[] }; period: Period; fundId: string | null; funds: { id: string; name: string }[];
  onClose: () => void; onSave: (v: { order: CardId[]; hidden: CardId[]; period: Period; fundId: string | null }) => void;
}) {
  const [order, setOrder] = useState(initial.order);
  const [hidden, setHidden] = useState(initial.hidden);
  const [p, setP] = useState<Period>(period);
  const [f, setF] = useState<string | null>(fundId);
  const [drag, setDrag] = useState<number | null>(null);
  const label = (id: CardId) => DASHBOARD_CARDS.find((c) => c.id === id)!.label;
  const move = (from: number, to: number) => { if (to < 0 || to >= order.length) return; const n = [...order]; const [x] = n.splice(from, 1); n.splice(to, 0, x); setOrder(n); };
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader><DialogTitle>Customize your dashboard</DialogTitle><DialogDescription>Only you see these choices. "Needs your attention" always stays on.</DialogDescription></DialogHeader>
        <ul className="space-y-1">
          {order.map((id, i) => (
            <li key={id} draggable onDragStart={() => setDrag(i)} onDragOver={(e) => e.preventDefault()} onDrop={() => { if (drag !== null) move(drag, i); setDrag(null); }}
              className="flex items-center gap-2 rounded-md border bg-card px-2 py-1.5">
              <GripVertical className="h-4 w-4 cursor-grab text-muted-foreground" />
              <Checkbox id={`c-${id}`} checked={!hidden.includes(id)} disabled={id === "attention"} onCheckedChange={(v) => setHidden(v ? hidden.filter((h) => h !== id) : [...hidden, id])} />
              <Label htmlFor={`c-${id}`} className="flex-1 text-sm font-normal">{label(id)}</Label>
              <Button size="icon" variant="ghost" className="h-7 w-7" aria-label="Move up" onClick={() => move(i, i - 1)}><ArrowUp className="h-3 w-3" /></Button>
              <Button size="icon" variant="ghost" className="h-7 w-7" aria-label="Move down" onClick={() => move(i, i + 1)}><ArrowDown className="h-3 w-3" /></Button>
            </li>
          ))}
        </ul>
        <div className="grid grid-cols-2 gap-3">
          <div><Label className="text-xs">Default period</Label>
            <Select value={p} onValueChange={(v) => setP(v as Period)}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{PERIODS.map((x) => <SelectItem key={x} value={x}>{PERIOD_LABEL[x]}</SelectItem>)}</SelectContent></Select></div>
          <div><Label className="text-xs">Default fund</Label>
            <Select value={f ?? "all"} onValueChange={(v) => setF(v === "all" ? null : v)}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">All funds</SelectItem>{funds.map((x) => <SelectItem key={x.id} value={x.id}>{x.name}</SelectItem>)}</SelectContent></Select></div>
        </div>
        <DialogFooter className="gap-2 sm:justify-between">
          <Button variant="ghost" onClick={() => { setOrder(DEFAULT_ORDER); setHidden([]); setP("month"); setF(null); }}>Reset to default</Button>
          <Button onClick={() => onSave({ order, hidden, period: p, fundId: f })}>Save</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
