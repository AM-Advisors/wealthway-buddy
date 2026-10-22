import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { getLinkedQuoteForSow } from "@/lib/sales-hub.functions";
import { QuoteBuilder } from "@/routes/_authenticated/sales_.quotes";
import { quoteInputsFromRows } from "@/lib/quote-sow-sync";

export function LinkedSowTermsEditor({ sowId, onChanged }: { sowId: string; onChanged: () => void }) {
  const load = useServerFn(getLinkedQuoteForSow);
  const qc = useQueryClient();
  const [editing, setEditing] = useState(false);
  const q = useQuery({ queryKey: ["sow-linked-quote", sowId], queryFn: () => load({ data: { sowId } }) });
  if (q.error) return <p className="text-sm text-destructive">{q.error.message}</p>;
  if (!q.data) return null;
  const d = q.data;
  const quote = d.quote;
  return <div className="mb-4">
    {editing ? <QuoteBuilder onCancel={() => { setEditing(false); qc.invalidateQueries(); onChanged(); }} initial={{
      id: quote.id, title: quote.title, clientId: quote.client_id, contactId: quote.contact_id,
      offeringId: quote.offering_id, dealId: quote.deal_id, validUntil: quote.valid_until,
      notes: quote.notes, expectedUpdatedAt: quote.updated_at, lines: quoteInputsFromRows(d.lines),
    }} /> : <Button variant="outline" disabled={!d.canEdit} onClick={() => setEditing(true)}>Edit linked services &amp; pricing</Button>}
  </div>;
}