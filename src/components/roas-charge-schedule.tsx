import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ROAS_ENTITIES, roasChargesForYear, roasChargeSummary, roasVisibleYears } from "@/lib/roas-billing-terms";

const money = (cents: number) => (cents / 100).toLocaleString("en-US", { style: "currency", currency: "USD" });

export function RoasChargeSchedule({ asOf }: { asOf: string }) {
  return <section className="space-y-6" aria-label="ROAS annual billing schedule">
    <header className="space-y-2"><h2 className="text-xl font-semibold">Paid, due and future charges</h2>
      <p className="text-sm text-muted-foreground">Payment allocations confirmed by Alyssa on October 28, 2026. Reported payments below are separate from recorded invoice receipts. Invoice issuance and recurring activation are pending the signed agreement.</p>
    </header>
    {roasVisibleYears(asOf).map(year => {
      const charges = roasChargesForYear(year);
      const totals = roasChargeSummary(charges, asOf);
      return <section key={year} className="space-y-3" aria-label={`${year} charges`}>
        <h3 className="text-lg font-semibold">{year}</h3>
        <dl className="grid gap-4 border-y py-4 sm:grid-cols-4">{[["Total", totals.totalCents], ["Reported paid", totals.reportedPaidCents], ["Due now", totals.dueNowCents], ["Future due", totals.futureCents]].map(([label, amount]) => <div key={label}><dt className="text-sm text-muted-foreground">{label}</dt><dd className="text-xl font-semibold tabular-nums">{money(Number(amount))}</dd></div>)}</dl>
        <Table><TableHeader><TableRow><TableHead>Entity / service</TableHead><TableHead>Period / cadence</TableHead><TableHead>Due date</TableHead><TableHead>Status</TableHead><TableHead className="text-right">Charge</TableHead><TableHead className="text-right">Reported paid</TableHead><TableHead className="text-right">Balance</TableHead></TableRow></TableHeader><TableBody>
          {charges.map(charge => { const balance = charge.amountCents - charge.reportedPaidCents; const status = !balance ? "Reported paid" : charge.dueOn <= asOf ? charge.reportedPaidCents ? "Partially paid · due now" : "Due now" : "Future due";
            return <TableRow key={charge.key}><TableCell><p className="font-medium">{ROAS_ENTITIES[charge.entity].name}</p><p className="text-sm text-muted-foreground">{charge.service}</p></TableCell><TableCell>{charge.period}<p className="text-xs text-muted-foreground">{charge.cadence}</p></TableCell><TableCell className="whitespace-nowrap">{charge.dueOn}</TableCell><TableCell><Badge variant={balance ? "outline" : "secondary"}>{status}</Badge></TableCell><TableCell className="text-right tabular-nums">{money(charge.amountCents)}</TableCell><TableCell className="text-right tabular-nums">{money(charge.reportedPaidCents)}</TableCell><TableCell className="text-right tabular-nums">{money(balance)}</TableCell></TableRow>;
          })}
        </TableBody></Table>
      </section>;
    })}
    <p className="text-xs text-muted-foreground">Annual services renew until canceled. Later years appear January 1 of that year. Original setup invoice and voided history remain below.</p>
  </section>;
}