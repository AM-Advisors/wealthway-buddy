import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useNavigate } from "@tanstack/react-router";
import { toast } from "sonner";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { getLinkedQuoteForSow, reviseSalesQuote } from "@/lib/sales-hub.functions";
import { QuoteBuilder } from "@/routes/_authenticated/sales_.quotes";
import { quoteInputsFromRows } from "@/lib/quote-sow-sync";

export function LinkedSowTermsEditor({ sowId, onChanged }: { sowId: string; onChanged: () => void }) {
  const load = useServerFn(getLinkedQuoteForSow);
  const revise = useServerFn(reviseSalesQuote);
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [editing, setEditing] = useState(false);
  const q = useQuery({ queryKey: ["sow-linked-quote", sowId], queryFn: () => load({ data: { sowId } }) });
  const revision = useMutation({
    mutationFn: async () => {
      if (!q.data) throw new Error("No linked quote.");
      return revise({ data: { id: q.data.quote.id } });
    },
    onSuccess: result => { qc.invalidateQueries(); navigate({ to: "/sales/quotes/$id", params: { id: result.id } }); },
    onError: (error: Error) => toast.error(error.message),
  });
  if (q.error) return <p className="text-sm text-destructive">{q.error.message}</p>;
  if (!q.data) return null;
  const d = q.data;
  const quote = d.quote;
  return <div className="mb-4">
    {editing ? <QuoteBuilder onCancel={() => { setEditing(false); qc.invalidateQueries(); onChanged(); }} initial={{
      id: quote.id, title: quote.title, clientId: quote.client_id, contactId: quote.contact_id,
      offeringId: quote.offering_id, dealId: quote.deal_id, validUntil: quote.valid_until,
      notes: quote.notes, expectedUpdatedAt: quote.updated_at, sections: (quote as any).sections ?? null, lines: quoteInputsFromRows(d.lines),
    }} /> : d.canEdit ? <Button variant="outline" onClick={() => setEditing(true)}>Edit linked services &amp; pricing</Button>
      : !["signed", "superseded", "lost"].includes(quote.status) ? <Button variant="outline" disabled={revision.isPending} onClick={() => revision.mutate()}>Create linked quote &amp; SOW revision</Button> : null}
  </div>;
}