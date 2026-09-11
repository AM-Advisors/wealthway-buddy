import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { getInvoiceDelivery, resendInvoiceEmail } from "@/lib/invoices.functions";

const LABELS: Record<string, string> = {
  sent: "Delivered",
  rejected: "Refused by the mail provider",
  bounced: "Bounced",
  complained: "Marked as spam",
  unsubscribed: "Unsubscribed",
  suppressed: "Blocked after an earlier failure",
  rate_limited: "Held back briefly",
  unknown: "Not confirmed",
};

/** Shows whether the invoice email actually reached the client, with a resend. */
export function InvoiceEmailStatus({
  invoiceId,
  canResend = true,
}: {
  invoiceId: string;
  canResend?: boolean;
}) {
  const load = useServerFn(getInvoiceDelivery);
  const resend = useServerFn(resendInvoiceEmail);
  const [open, setOpen] = useState(false);
  const [sending, setSending] = useState(false);

  const { data, isLoading, refetch } = useQuery({
    queryKey: ["invoice-delivery", invoiceId],
    queryFn: () => load({ data: { id: invoiceId } }),
    staleTime: 60_000,
  });

  if (isLoading) return <span className="text-xs text-muted-foreground">Checking email…</span>;
  if (!data || (data as any).draft) return null;

  const rows = (data as any).rows as {
    email: string;
    name: string;
    state: string;
    at: string | null;
    detail: string | null;
  }[];
  const confirmed = (data as any).confirmed as boolean;
  const problem = (data as any).problem as boolean;
  const available = (data as any).available as boolean;

  const badge = !available
    ? { text: "Email status unavailable", variant: "outline" as const }
    : !rows.length
      ? { text: "No contact to email", variant: "destructive" as const }
      : problem
        ? { text: confirmed ? "Email problem" : "Email not confirmed", variant: "destructive" as const }
        : { text: "Email delivered", variant: "secondary" as const };

  return (
    <div className="flex flex-wrap items-center gap-2">
      <Badge variant={badge.variant}>{badge.text}</Badge>
      {rows.length > 0 && (
        <Button size="sm" variant="ghost" onClick={() => setOpen((v) => !v)}>
          {open ? "Hide detail" : "Who got it"}
        </Button>
      )}
      {canResend && (
        <Button
          size="sm"
          variant="outline"
          disabled={sending}
          onClick={async () => {
            setSending(true);
            try {
              await resend({ data: { id: invoiceId } });
              toast.success("Invoice sent again.");
              await refetch();
            } catch (err: any) {
              toast.error(err?.message ?? "That email couldn't be sent.");
            } finally {
              setSending(false);
            }
          }}
        >
          {sending ? "Sending…" : "Send again"}
        </Button>
      )}
      {open && (
        <ul className="w-full space-y-1 rounded-md border p-2 text-xs">
          {rows.map((r) => (
            <li key={r.email} className="flex flex-wrap items-center gap-2">
              <span className="font-medium">{r.name}</span>
              <span className="text-muted-foreground">{r.email}</span>
              <span className={r.state === "sent" ? "" : "text-destructive"}>
                {LABELS[r.state] ?? r.state}
              </span>
              {r.at && (
                <span className="text-muted-foreground">{new Date(r.at).toLocaleString()}</span>
              )}
              {r.detail && <span className="text-muted-foreground">({r.detail})</span>}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
