import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Link } from "@tanstack/react-router";
import { toast } from "sonner";
import { MessageCircle } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { PortalMessageThread } from "@/components/portal-message-thread";
import {
  acknowledgeK1Fn,
  investorFundStatusFn,
  k1DownloadUrlFn,
  myFundCapitalCallsFn,
  myFundK1sFn,
} from "@/lib/investor-fund-page.functions";
import { capitalCallDetailFn, fundingReceiptFn, reportTransferInitiatedFn } from "@/lib/capital-calls.functions";

function usd(cents: number | null | undefined) {
  if (cents == null) return "-";
  return `$${(Number(cents) / 100).toLocaleString("en-US", { maximumFractionDigits: 2 })}`;
}

function dt(value: string | null | undefined) {
  if (!value) return "-";
  return new Date(value).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

const FUNDING_LABELS: Record<string, string> = {
  not_started: "Not started",
  bank_transaction_detected: "Awaiting reconciliation",
  reconciliation_pending: "Awaiting reconciliation",
  pending_reconciliation: "Awaiting reconciliation",
  partially_funded: "Partially funded",
  received: "Awaiting reconciliation",
  matched: "Awaiting reconciliation",
  processing: "Awaiting reconciliation",
  funded: "Funded",
  settled: "Funded",
  funding_exception: "Needs review",
  exception: "Needs review",
  returned: "Needs review",
  overfunded: "Needs review",
  failed: "Needs review",
  investor_reports_sent: "Reported by you",
  awaiting_wire: "Ready for your wire",
  instructions_released: "Ready for your wire",
};

// ---------------------------------------------------------------- status

export function InvestorFundStatusPanel({ offeringId }: { offeringId: string }) {
  const load = useServerFn(investorFundStatusFn);
  const q = useQuery({ queryKey: ["investor-fund-status", offeringId], queryFn: () => load({ data: { offeringId } }) });

  if (q.isLoading) return <p className="text-sm text-muted-foreground">Loading…</p>;
  const status = q.data;
  if (!status) {
    return (
      <Card>
        <CardContent className="py-6 text-sm text-muted-foreground">
          No onboarding record exists for you on this fund. If you expected one, message the fund team.
        </CardContent>
      </Card>
    );
  }
  const label = FUNDING_LABELS[status.fundingStatus ?? ""] ?? "Not started";
  const done = status.steps.filter((s: any) => s.state === "complete").length;

  return (
    <Card>
      <CardHeader className="flex-row items-start justify-between gap-3 space-y-0">
        <div>
          <CardTitle className="text-base">Your status with this fund</CardTitle>
          <CardDescription>
            {done} of {status.steps.length} onboarding steps complete.
            {status.fundingStatus === "funded" || status.fundingStatus === "settled"
              ? " Your investment is funded."
              : ""}
          </CardDescription>
        </div>
        {status.unreadFromTeam > 0 && status.applicationId ? (
          <Button asChild size="sm" variant="outline">
            <Link to="/manager/messages">
              <MessageCircle className="mr-1 h-4 w-4" />
              {status.unreadFromTeam} new from the fund team
            </Link>
          </Button>
        ) : null}
      </CardHeader>
      <CardContent className="space-y-2">
        <ol className="space-y-2">
          {status.steps.map((s: any) => (
            <li key={s.key} className="flex items-start gap-2 text-sm">
              <span className={s.state === "complete" ? "text-emerald-600" : "text-muted-foreground"}>
                {s.state === "complete" ? "✓" : "•"}
              </span>
              <div>
                <p className={s.state === "complete" ? "text-muted-foreground" : "font-medium"}>{s.label}</p>
                {s.state !== "complete" && s.detail ? (
                  <p className="text-xs text-muted-foreground">{s.detail}</p>
                ) : null}
              </div>
            </li>
          ))}
        </ol>
        <p className="pt-1 text-sm">
          Funding: <Badge variant={label === "Funded" ? "secondary" : "outline"}>{label}</Badge>
        </p>
      </CardContent>
    </Card>
  );
}

// ---------------------------------------------------------------- capital calls

export function FundCapitalCallsPanel({ offeringId }: { offeringId: string }) {
  const load = useServerFn(myFundCapitalCallsFn);
  const detail = useServerFn(capitalCallDetailFn);
  const report = useServerFn(reportTransferInitiatedFn);
  const receipt = useServerFn(fundingReceiptFn);
  const q = useQuery({ queryKey: ["investor-fund-calls", offeringId], queryFn: () => load({ data: { offeringId } }) });
  const [openLine, setOpenLine] = useState<string | null>(null);
  const [method, setMethod] = useState("wire");
  const [ref, setRef] = useState("");
  const [busy, setBusy] = useState(false);

  const calls: any[] = q.data ?? [];
  const openCall = openLine ? calls.find((c) => c.lineId === openLine) : null;

  return (
    <div className="space-y-4">
      {q.isLoading ? <p className="text-sm text-muted-foreground">Loading…</p> :
       q.error ? <p className="text-sm text-destructive">{(q.error as Error).message}</p> :
       calls.length === 0 ? (
        <Card><CardContent className="py-6 text-sm text-muted-foreground">No capital calls for this fund yet.</CardContent></Card>
      ) : (
        calls.map((c) => (
          <Card key={c.lineId}>
            <CardHeader className="pb-2">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <CardTitle className="text-base">{c.callTitle}</CardTitle>
                <Badge variant={c.amountDueCents > 0 ? "default" : "secondary"}>{c.statusLabel}</Badge>
              </div>
              <CardDescription>
                Due {dt(c.dueDate)} · Called {usd(c.calledCents)} · Remaining {usd(c.amountDueCents)}
              </CardDescription>
            </CardHeader>
            <CardContent>
              {c.statusLabel === "Ready for your wire" ? (
                <Button
                  size="sm"
                  onClick={() => {
                    setOpenLine(c.lineId);
                    setMethod("wire");
                    setRef("");
                  }}
                >
                  Pay this call
                </Button>
              ) : c.statusLabel === "Awaiting reconciliation" ? (
                <p className="text-sm text-muted-foreground">Your reported transfer is with the fund for reconciliation.</p>
              ) : null}
            </CardContent>
          </Card>
        ))
      )}

      {openCall ? (
        <CallPaySheet
          lineId={openCall.lineId}
          onClose={() => setOpenLine(null)}
          detail={detail}
          report={report}
          receipt={receipt}
          method={method}
          setMethod={setMethod}
          refCode={ref}
          setRefCode={setRef}
          busy={busy}
          setBusy={setBusy}
          onDone={() => {
            setOpenLine(null);
            q.refetch();
          }}
        />
      ) : null}
    </div>
  );
}

function CallPaySheet(props: any) {
  const { lineId, onClose } = props;
  const dq = useQuery({ queryKey: ["capital-call-detail", lineId], queryFn: () => props.detail({ data: { lineId } }) });
  const d = dq.data;

  const submit = async () => {
    props.setBusy(true);
    try {
      if (props.method === "wire") {
        await props.report({ data: { lineId, reference: props.refCode || null } });
        toast.success("Noted. The fund will reconcile your transfer before it counts as funded.");
      } else {
        await props.receipt({ data: { lineId, method: "ach", note: props.refCode || null } });
        toast.success("Noted. The fund will reconcile your transfer before it counts as funded.");
      }
      props.onDone();
    } catch (e: any) {
      toast.error(e?.message ?? "Could not record that.");
    } finally {
      props.setBusy(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex items-start justify-between gap-2">
          <div>
            <CardTitle className="text-base">Payment details</CardTitle>
            <CardDescription>
              Harmonious never moves your money. You send the transfer through your own bank, then record it here.
            </CardDescription>
          </div>
          <Button size="sm" variant="ghost" onClick={onClose}>Close</Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-4 text-sm">
        {dq.isLoading ? <p className="text-muted-foreground">Loading instructions…</p> :
         dq.error ? <p className="text-destructive">{(dq.error as Error).message}</p> : (
          <>
            <p className="text-2xl font-semibold">{usd(d?.amountDueCents ?? 0)}</p>
            {d?.instructions ? (
              <dl className="grid grid-cols-[8rem_1fr] gap-x-3 gap-y-1 rounded-md border p-3">
                {Object.entries(d.instructions as Record<string, string>)
                  .filter(([, v]) => !!v)
                  .map(([k, v]) => (
                    <div key={k} className="contents">
                      <dt className="text-xs uppercase tracking-wide text-muted-foreground">{k.replace(/_/g, " ")}</dt>
                      <dd className="break-all">{v}</dd>
                    </div>
                  ))}
              </dl>
            ) : (
              <p className="text-muted-foreground">Funding instructions are not released for this call yet.</p>
            )}
            <div className="flex flex-wrap items-end gap-2">
              <label className="text-xs text-muted-foreground">
                Method
                <select
                  className="mt-1 block rounded-md border bg-background px-2 py-1.5 text-sm"
                  value={props.method}
                  onChange={(e) => props.setMethod(e.target.value)}
                >
                  <option value="wire">Wire</option>
                  <option value="ach">ACH</option>
                </select>
              </label>
              <label className="min-w-[16rem] flex-1 text-xs text-muted-foreground">
                Reference or confirmation number (optional)
                <Input value={props.refCode} onChange={(e) => props.setRefCode(e.target.value)} placeholder="e.g. bank confirmation number" />
              </label>
              <Button onClick={submit} disabled={props.busy || !d?.instructions}>
                {props.busy ? "Recording…" : "I sent this transfer"}
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">
              Recording the transfer is informational only and does not count as funding until the fund reconciles it against the bank.
            </p>
          </>
        )}
      </CardContent>
    </Card>
  );
}

// ---------------------------------------------------------------- K-1s

const K1_BOXES: Record<string, string> = {
  "1": "Ordinary income (loss)",
  "2": "Net rental income (loss)",
  "5": "Interest income",
  "6a": "Ordinary dividends",
  "8": "Net capital gain (loss)",
  "9": "Net gain (loss)",
  "10": "Other income (loss)",
  "11A": "Section 179 deduction",
  "13L": "Other deductions",
  "14A": "Foreign transactions",
  "15A": "Alternative minimum tax",
  "16A": "Items affecting shareholder basis",
  "17A": "Information on the partner's capital account",
  "18A": "Foreign partners",
  "20A": "Other information",
};

export function FundTaxDocumentsPanel({ offeringId }: { offeringId: string }) {
  const load = useServerFn(myFundK1sFn);
  const url = useServerFn(k1DownloadUrlFn);
  const ack = useServerFn(acknowledgeK1Fn);
  const q = useQuery({ queryKey: ["investor-fund-k1s", offeringId], queryFn: () => load({ data: { offeringId } }) });
  const [busyId, setBusyId] = useState<string | null>(null);

  const k1s: any[] = q.data ?? [];

  const doAck = async (k1Id: string) => {
    setBusyId(k1Id);
    try {
      await ack({ data: { k1Id } });
      toast.success("Noted. You confirmed receipt of this K-1.");
      q.refetch();
    } catch (e: any) {
      toast.error(e?.message ?? "Could not record that.");
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="space-y-4">
      {q.isLoading ? <p className="text-sm text-muted-foreground">Loading…</p> :
       q.error ? <p className="text-sm text-destructive">{(q.error as Error).message}</p> :
       k1s.length === 0 ? (
        <Card><CardContent className="py-6 text-sm text-muted-foreground">
          No K-1 has been delivered to you for this fund yet. K-1s appear here after the fund's partnership return is finalized and Harmonious delivers them.
        </CardContent></Card>
      ) : (
        k1s.map((k) => (
          <Card key={k.id}>
            <CardHeader className="pb-2">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <CardTitle className="text-base">Schedule K-1 · tax year {k.tax_year}</CardTitle>
                <div className="flex items-center gap-2">
                  <Badge variant={k.investor_acknowledged_at ? "secondary" : "outline"}>
                    {k.investor_acknowledged_at ? "Receipt confirmed" : "Awaiting your confirmation"}
                  </Badge>
                  <Button asChild size="sm" variant="outline">
                    <Link to="/tax-return">View my tax center</Link>
                  </Button>
                </div>
              </div>
              {k.investor_acknowledged_at ? (
                <CardDescription>Confirmed {dt(k.investor_acknowledged_at)}</CardDescription>
              ) : null}
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              <dl className="grid grid-cols-[10rem_1fr] gap-x-3 gap-y-1 rounded-md border p-3">
                {Object.entries((k.boxes as Record<string, number>) ?? {})
                  .filter(([v]) => Math.abs(Number(v)) > 0)
                  .map(([box, v]) => (
                    <div key={box} className="contents">
                      <dt className="text-xs text-muted-foreground">Box {box}{K1_BOXES[box] ? ` - ${K1_BOXES[box]}` : ""}</dt>
                      <dd>{usd(Number(v))}</dd>
                    </div>
                  ))}
                {k.tax_capital ? (
                  <div className="contents">
                    <dt className="text-xs text-muted-foreground">Capital account</dt>
                    <dd>{usd(Number(k.tax_capital))}</dd>
                  </div>
                ) : null}
                {Object.keys(k.boxes ?? {}).length === 0 && !k.tax_capital ? (
                  <div className="contents"><dd className="text-muted-foreground">No taxable amounts reported this year.</dd></div>
                ) : null}
              </dl>
              {!k.investor_acknowledged_at ? (
                <Button size="sm" onClick={() => doAck(k.id)} disabled={busyId === k.id}>
                  {busyId === k.id ? "Saving…" : "I received this K-1"}
                </Button>
              ) : null}
            </CardContent>
          </Card>
        ))
      )}
    </div>
  );
}

// ---------------------------------------------------------------- messages

export function InvestorFundMessages({ offeringId, applicationId }: { offeringId: string; applicationId: string | null }) {
  if (!applicationId) {
    return (
      <Card>
        <CardContent className="py-6 text-sm text-muted-foreground">
          Private messaging opens once your onboarding is linked to an application record.
        </CardContent>
      </Card>
    );
  }
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Private messages with the fund</CardTitle>
        <CardDescription>
          Only you and the fund team see this thread. Updates land here; nothing is emailed.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <PortalMessageThread applicationId={applicationId} placeholder="Message the fund team…" />
      </CardContent>
    </Card>
  );
}
