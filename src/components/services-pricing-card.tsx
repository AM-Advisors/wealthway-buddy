import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { getFundServicesPricing } from "@/lib/commercial-pricing.functions";
import { COMMERCIAL_STATUS_LABEL } from "@/lib/commercial-pricing";

const money = (c: number) => `$${(c / 100).toLocaleString("en-US", { maximumFractionDigits: 0 })}`;
const BASIS: Record<string, string> = { one_time: "one-time", annual: "per year", recurring: "recurring", transaction: "per transaction", per_request: "quoted per request" };

/** Fund Services & Pricing. Informational only — never a gate. */
export function ServicesPricingCard({ fundId }: { fundId: string }) {
  const load = useServerFn(getFundServicesPricing);
  const q = useQuery({ queryKey: ["fund-services-pricing", fundId], queryFn: () => load({ data: { offeringId: fundId } }), retry: false });
  const d = q.data as any;
  if (!d) return null;
  const label = d.internal ? COMMERCIAL_STATUS_LABEL[d.status as keyof typeof COMMERCIAL_STATUS_LABEL] : d.clientStatus;
  if (!d.internal && !d.lines.length) return null;
  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <CardTitle className="text-base">Services &amp; Pricing</CardTitle>
          {label ? <Badge variant={d.status === "approved" || d.clientStatus === "Approved" ? "secondary" : "outline"}>{label}</Badge> : null}
        </div>
        {d.internal && d.status === "legacy_review" ? (
          <CardDescription>No pricing snapshot was recorded for this older fund. This is a Harmonious follow-up only and does not affect the fund or its investors.</CardDescription>
        ) : null}
      </CardHeader>
      {d.lines.length ? (
        <CardContent>
          <ul className="divide-y text-sm">
            {d.lines.map((l: any) => (
              <li key={l.serviceKey} className="flex items-center justify-between gap-3 py-2">
                <span>{l.label}</span>
                <span className="text-right font-medium">
                  {l.passThrough ? "Billed at cost" : `${money(l.finalCents)} ${BASIS[l.pricingModel] ?? ""}`}
                  {d.internal && !l.passThrough && l.finalCents !== l.baselineCents ? (
                    <span className="block text-xs text-muted-foreground">Baseline {money(l.baselineCents)}</span>
                  ) : null}
                </span>
              </li>
            ))}
          </ul>
        </CardContent>
      ) : null}
    </Card>
  );
}
