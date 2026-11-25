import { Button } from '@/components/ui/button';
import { Link } from '@tanstack/react-router';
import type { CloseHarmoniousFees as Fees } from '@/lib/close-harmonious-fees';
const money = (c: number | null) => c === null ? 'Needs pricing review' : (c/100).toLocaleString('en-US',{style:'currency',currency:'USD'});
export function CloseHarmoniousFees({ fees, operations = false, clientId }: { fees: Fees; operations?: boolean; clientId?: string | null }) {
  return <section className="space-y-3" aria-label="Harmonious fees">
    <h3 className="font-semibold">Harmonious fees</h3>
    <p className="text-xs text-muted-foreground">Recorded fund commitments: {money(fees.raiseCents)}.{fees.lines.some(l=>l.key.startsWith('SPV_TXN:')) && ' The SPV fee is one-time for the fund, not an additional fee for every close.'}</p>
    <div className="divide-y border-y">{fees.lines.map(l=><div key={l.key} className="grid gap-2 py-3 sm:grid-cols-[1fr_auto]">
      <div><p className="font-medium">{l.label}</p><p className="text-xs text-muted-foreground">{l.source} · {l.scope} · {l.cadence.replaceAll('_',' ')}{l.quantity !== 1 ? ` · ${l.quantity} × ${money(l.unitCents)}` : ''}</p>{l.issue && <p className="text-xs text-destructive">{l.issue}</p>}</div><p className="font-medium">{l.cadence === 'included' ? 'Included' : money(l.cents)}</p>
    </div>)}</div>
    {fees.sideLetterPaidCount > 0 && <p className="text-xs text-muted-foreground">{fees.sideLetterPaidCount} already-paid side letter{fees.sideLetterPaidCount === 1 ? '' : 's'} excluded.</p>}
    <p className="font-semibold">One-time fee estimate: {money(fees.oneTimeCents)}{fees.needsReview ? ' plus items needing review' : ''}</p>
    <p className="text-xs text-muted-foreground">Recurring services are shown separately by billing period. These are reference estimates, not an invoice or instruction to pay.</p>
    {operations && clientId && <Button size="sm" variant="outline" asChild><Link to="/ops/clients/$clientId" params={{clientId}} search={{tab:'services'}}>Adjust fees &amp; internal approvals</Link></Button>}
  </section>;
}