import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useMemo, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ChannelChip } from "@/components/marketing-ui";
import { STATUS_LABEL } from "@/lib/marketing-model";
import { getMarketingCalendar } from "@/lib/marketing.functions";
import { getCampaigns } from "@/lib/marketing-campaigns.functions";
import { useOrgTz } from "@/components/marketing/use-org-tz";
import { addYmd, fmtYmd, weekdayOf, ymdIn, ymdStartUtc } from "@/lib/org-timezone";

export const COLOR_CLS: Record<string, { band: string; dot: string }> = {
  teal: { band: "bg-chart-2/20 border-chart-2 text-foreground", dot: "bg-chart-2" },
  navy: { band: "bg-primary/15 border-primary text-foreground", dot: "bg-primary" },
  amber: { band: "bg-chart-3/20 border-chart-3 text-foreground", dot: "bg-chart-3" },
  rose: { band: "bg-chart-4/20 border-chart-4 text-foreground", dot: "bg-chart-4" },
  violet: { band: "bg-chart-5/20 border-chart-5 text-foreground", dot: "bg-chart-5" },
  green: { band: "bg-chart-1/20 border-chart-1 text-foreground", dot: "bg-chart-1" },
};
export const colorOf = (c?: string | null) => COLOR_CLS[c ?? "teal"] ?? COLOR_CLS["teal"]!;


/** Month calendar with campaign bands and their posts/emails; refreshes every 15 seconds. */
export function CampaignCalendar({ focusId, onPickDay }: { focusId?: string; onPickDay?: (ymd: string) => void }) {
  const tz = useOrgTz();
  const today = ymdIn(new Date(), tz);
  const [anchorRaw, setAnchor] = useState<string | null>(null);
  const anchor = anchorRaw ?? today.slice(0, 8) + "01";
  const loadItems = useServerFn(getMarketingCalendar);
  const loadCampaigns = useServerFn(getCampaigns);
  const days = useMemo(() => {
    const first = addYmd(anchor, -weekdayOf(anchor));
    return Array.from({ length: 42 }, (_, i) => addYmd(first, i));
  }, [anchor]);
  const from = ymdStartUtc(days[0]!, tz).toISOString(), to = ymdStartUtc(addYmd(days[41]!, 1), tz).toISOString();
  const items = useQuery({ queryKey: ["mk-cal", from, to], queryFn: () => loadItems({ data: { from, to } }), refetchInterval: 15000, retry: false });
  const camps = useQuery({ queryKey: ["mk-campaigns", from, to], queryFn: () => loadCampaigns({ data: { from, to } }), refetchInterval: 15000, retry: false });
  const campMap = useMemo(() => new Map((camps.data ?? []).map((c: any) => [c.id, c])), [camps.data]);

  const byDay = useMemo(() => {
    const m = new Map<string, any[]>();
    for (const it of items.data ?? []) {
      if (focusId && it.campaignId !== focusId) continue;
      const k = ymdIn(it.at, tz);
      m.set(k, [...(m.get(k) ?? []), it].sort((a, b) => a.at.localeCompare(b.at)));
    }
    return m;
  }, [items.data, focusId, tz]);
  const shift = (n: number) => { const [y, m] = anchor.split("-").map(Number); setAnchor(new Date(Date.UTC(y!, m! - 1 + n, 1)).toISOString().slice(0, 10)); };

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <Button size="icon" variant="outline" onClick={() => shift(-1)} aria-label="Previous month"><ChevronLeft className="h-4 w-4" /></Button>
        <Button size="sm" variant="outline" onClick={() => setAnchor(null)}>Today</Button>
        <Button size="icon" variant="outline" onClick={() => shift(1)} aria-label="Next month"><ChevronRight className="h-4 w-4" /></Button>
        <h2 className="ml-2 text-lg font-semibold">{fmtYmd(anchor, { month: "long", year: "numeric" })} <span className="text-xs font-normal text-muted-foreground">({tz})</span></h2>
        <span className="ml-auto flex items-center gap-1.5 text-xs text-muted-foreground"><span className="h-2 w-2 animate-pulse rounded-full bg-chart-2" />Live</span>
      </div>
      <div className="grid grid-cols-7 overflow-hidden rounded-lg border">
        {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((d) => <div key={d} className="border-b bg-muted px-2 py-1 text-xs font-medium text-muted-foreground">{d}</div>)}
        {days.map((d) => {
          const key = d;
          const active = (camps.data ?? []).filter((c: any) => c.starts_on <= key && c.ends_on >= key && (!focusId || c.id === focusId));
          const its = byDay.get(d) ?? [];
          const out = d.slice(0, 7) !== anchor.slice(0, 7);
          return (
            <div key={key} onClick={() => onPickDay?.(key)} className={`min-h-28 border-b border-r p-1 ${out ? "bg-muted/40" : "bg-card"} ${onPickDay ? "cursor-pointer hover:bg-muted/30" : ""}`}>
              <div className={`mb-1 text-xs ${d === today ? "font-bold text-primary" : "text-muted-foreground"}`}>{Number(d.slice(8))}</div>
              <div className="space-y-0.5">
                {active.map((c: any) => (
                  <Link key={c.id} to="/marketing/campaigns/$id" params={{ id: c.id }} onClick={(e) => e.stopPropagation()}
                    className={`block truncate rounded-sm border-l-2 px-1 text-[10px] font-medium ${colorOf(c.color).band}`} title={c.theme ?? c.name}>
                    {c.starts_on === key || weekdayOf(d) === 0 ? c.name : "\u00a0"}
                  </Link>
                ))}
                {its.map((it) => (
                  <Link key={it.kind + it.id} to={it.kind === "post" ? "/marketing/posts/$id" : "/marketing/emails/$id"} params={{ id: it.id }} onClick={(e) => e.stopPropagation()}
                    className="block rounded border bg-background p-1 text-[11px] hover:border-primary" title={STATUS_LABEL[it.status] ?? it.status}>
                    <span className="flex items-center gap-1">
                      {it.campaignId && campMap.get(it.campaignId) ? <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${colorOf((campMap.get(it.campaignId) as any).color).dot}`} /> : null}
                      {it.channels.map((c: string) => <ChannelChip key={c} c={c} />)}
                    </span>
                    <span className="mt-0.5 block truncate">{new Date(it.at).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", timeZone: tz })} {it.title}</span>
                    <span className="block text-[10px] text-muted-foreground">{STATUS_LABEL[it.status] ?? it.status}</span>
                  </Link>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
