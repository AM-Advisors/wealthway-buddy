import { Fragment, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Button } from "@/components/ui/button";
import { invoiceRemittance } from "@/lib/sales-acceptance.functions";

/** Harmonious wire/ACH instructions for one invoice. Masked until revealed; every view is logged server-side. */
export function InvoiceRemittance({ invoiceId }: { invoiceId: string }) {
  const load = useServerFn(invoiceRemittance);
  const [method, setMethod] = useState<"wire" | "ach" | null>(null);
  const [reveal, setReveal] = useState(false);
  const q = useQuery({ queryKey: ["invoice-remit", invoiceId, method, reveal], queryFn: () => load({ data: { invoiceId, method: method!, reveal } }), enabled: !!method, gcTime: 0, staleTime: 0 });
  const r = q.data?.instructions;
  return (
    <div className="space-y-2">
      <div className="flex gap-2">
        {(["wire", "ach"] as const).map((m) => (
          <Button key={m} size="sm" type="button" variant={method === m ? "default" : "outline"} onClick={() => { setMethod(m); setReveal(false); }}>
            Show {m === "ach" ? "ACH" : "wire"} instructions
          </Button>
        ))}
      </div>
      {method && q.isLoading && <p className="text-xs text-muted-foreground">Loading…</p>}
      {method && q.error && <p className="text-xs text-destructive">{(q.error as Error).message}</p>}
      {method && q.data && !r && <p className="text-sm text-muted-foreground">Contact your Harmonious representative for payment details.</p>}
      {r && (
        <div className="rounded-md border p-3 text-sm">
          <dl className="grid grid-cols-[10rem_1fr] gap-y-1">
            {([["Bank", r.bankName], ["Account name", r.accountName], ["Account number", r.accountNumber], ["Routing number", r.routingNumber], ["SWIFT", r.swiftCode],
              ["Bank address", r.bankAddress], ["Beneficiary address", r.beneficiaryAddress], ["Reference", q.data?.reference ?? null]] as [string, string | null][])
              .filter(([, v]) => v).map(([k, v]) => <Fragment key={k}><dt className="text-muted-foreground">{k}</dt><dd className="font-mono">{v}</dd></Fragment>)}
          </dl>
          {!r.revealed && <Button size="sm" variant="outline" className="mt-2" onClick={() => setReveal(true)}>Show full details</Button>}
          <p className="mt-2 text-xs text-muted-foreground">Confirm by phone with your Harmonious contact before sending. Harmonious never changes payment details by email.</p>
        </div>
      )}
    </div>
  );
}
