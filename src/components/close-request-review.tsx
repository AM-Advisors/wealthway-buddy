import { useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { CloseFilingsPanel } from "@/components/close-filings-panel";
import { approveFundCloseRequest } from "@/lib/close-filings.functions";
import { updateFundCloseRequestStatus } from "@/lib/fund-close-requests.functions";

const LABEL: Record<string, string> = {
  draft: "Draft: not sent for review",
  submitted: "Submitted: Harmonious reviewing",
  in_review: "In review",
  approved: "Approved: filings in progress",
  completed: "Completed",
  returned: "Returned",
};

const money = (cents: number | null | undefined) => typeof cents === "number"
  ? (cents / 100).toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 2 })
  : "Not recorded";

const fmtDate = (value: string | null | undefined) => value
  ? new Date(value).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })
  : "Not recorded";

export function CloseDetailsSummary({ r }: { r: any }) {
  if (!r.details || !Object.keys(r.details).length) return null;
  const d = r.details;
  const asset = d.assetMode === "new" ? d.asset?.name : d.existingAsset;
  const assetDetail = d.assetMode === "new"
    ? [d.asset?.issuer, d.asset?.type, d.asset?.amountCents == null ? null : money(d.asset.amountCents)].filter(Boolean).join(" · ")
    : "";
  const wire = d.wire ?? {};
  const payment = [wire.method?.toUpperCase(), wire.amountCents == null ? null : money(wire.amountCents), wire.beneficiary, wire.bankName].filter(Boolean).join(" · ");
  const account = [wire.routingLast4 ? `Routing ending ${wire.routingLast4}` : null, wire.accountLast4 ? `Account ending ${wire.accountLast4}` : null].filter(Boolean).join(" · ");
  const legal = [money(d.legalFeesCents), d.legalFeesDetail].filter(Boolean).join(" · ");
  const broker = [money(d.brokerDealerFeesCents), d.brokerDealerDetail].filter(Boolean).join(" · ");
  return (
    <dl className="grid gap-4 rounded-md border p-4 sm:grid-cols-2 lg:grid-cols-3">
      <div><dt className="text-xs text-muted-foreground">Asset</dt><dd>{asset || "Not recorded"}{assetDetail && <span className="block text-xs text-muted-foreground">{assetDetail}</span>}{d.asset?.notes && <span className="block text-xs text-muted-foreground">{d.asset.notes}</span>}</dd></div>
      <div><dt className="text-xs text-muted-foreground">Management fee</dt><dd>{d.managementFeePct == null ? "Not recorded" : `${d.managementFeePct}% · ${money(d.managementFeeCents)}`}{d.feeConfirmed === true && <span className="block text-xs text-muted-foreground">Confirmed by the preparer</span>}</dd></div>
      <div><dt className="text-xs text-muted-foreground">Payment details</dt><dd>{payment || "Not recorded"}{account && <span className="block text-xs text-muted-foreground">{account}</span>}{wire.reference && <span className="block text-xs text-muted-foreground">Reference: {wire.reference}</span>}</dd></div>
      <div><dt className="text-xs text-muted-foreground">Investor states</dt><dd>{d.investorStates?.length ? d.investorStates.join(", ") : "Not recorded"}</dd></div>
      <div><dt className="text-xs text-muted-foreground">Purchase agreement</dt><dd>{d.purchaseAgreementName || "Not attached"}</dd></div>
      <div><dt className="text-xs text-muted-foreground">Legal fees</dt><dd>{legal}</dd></div>
      <div><dt className="text-xs text-muted-foreground">Broker/Dealer Fee</dt><dd>{broker}</dd></div>
      <div><dt className="text-xs text-muted-foreground">Harmonious Form D Filing Fee</dt><dd>{money(d.formDFeeCents ?? 16000)}</dd></div>
    </dl>
  );
}

/** The same close card is used for managers and Operations. Operations only adds its protected work below. */
export function CloseRequestCard({ r, onContinue, operations = false, showFund = false }: { r: any; onContinue?: () => void; operations?: boolean; showFund?: boolean }) {
  return (
    <Card>
      <CardHeader className="flex-row items-start justify-between gap-3 space-y-0">
        <div>
          <CardTitle className="text-base">
            {showFund
              ? <Link to="/ops/fund/$fundId" params={{ fundId: r.offering_id }} search={{ tab: "closes" }} className="hover:underline">{r.offerings?.name ?? "Fund"}</Link>
              : <>{r.status === "draft" ? "Saved" : "Requested"} {fmtDate(r.created_at)} · {r.onboarding_ids.length} investor{r.onboarding_ids.length === 1 ? "" : "s"}</>}
          </CardTitle>
          <CardDescription>
            {showFund && <>{new Date(r.created_at).toLocaleDateString("en-US")} · {r.onboarding_ids.length} investor{r.onboarding_ids.length === 1 ? "" : "s"} · </>}
            Target close date: {fmtDate(r.target_date)}
          </CardDescription>
        </div>
        <Badge variant={r.status === "completed" ? "default" : r.status === "returned" ? "destructive" : "secondary"}>{LABEL[r.status] ?? r.status}</Badge>
      </CardHeader>
      <CardContent className="space-y-3 text-sm">
        {r.notes && <p>{r.notes}</p>}
        <CloseDetailsSummary r={r} />
        {r.details?.sideLetterCount != null && <p>Side letters (estimate): {r.details.sideLetterCount} × ${((r.details.sideLetterUnitCents ?? 150000) / 100).toLocaleString("en-US")}{r.details.sideLetterPaidCount ? `, ${r.details.sideLetterPaidCount} already paid` : ""} = <span className="font-semibold">${(r.details.sideLetterFeeCents / 100).toLocaleString("en-US")}</span></p>}
        {r.staff_note && <p className="text-xs text-muted-foreground">Harmonious: {r.staff_note}</p>}
        {r.status === "draft" && onContinue && <Button size="sm" variant="outline" onClick={onContinue}>Continue details</Button>}
        {operations && <CloseRequestOperations r={r} />}
      </CardContent>
    </Card>
  );
}

function CloseRequestOperations({ r }: { r: any }) {
  const qc = useQueryClient();
  const update = useServerFn(updateFundCloseRequestStatus);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const approve = useServerFn(approveFundCloseRequest);

  async function refresh() {
    await Promise.all([
      qc.invalidateQueries({ queryKey: ["ops-close-requests"] }),
      qc.invalidateQueries({ queryKey: ["client-fund-closes", r.offering_id] }),
    ]);
  }

  async function doApprove() {
    setBusy(true);
    try {
      await approve({ data: { id: r.id, note } });
      toast.success("Close approved. You can now generate the filings.");
      setNote("");
      await refresh();
    } catch (e: any) { toast.error(e?.message ?? "Couldn't approve."); } finally { setBusy(false); }
  }

  async function set(status: "in_review" | "completed" | "returned") {
    setBusy(true);
    try {
      await update({ data: { id: r.id, status, note } });
      toast.success("Updated.");
      setNote("");
      await refresh();
    } catch (e: any) { toast.error(e?.message ?? "Couldn't update."); } finally { setBusy(false); }
  }

  return (
    <section className="space-y-3 rounded-md border bg-muted/20 p-4" aria-label="Operations review">
      <div>
        <h3 className="font-medium">Operations review</h3>
        <p className="text-xs text-muted-foreground">Only Operations sees these review, filing and completion controls.</p>
      </div>
      {r.status === "draft" ? <p className="text-xs text-muted-foreground">Draft details only. The fund manager must send this for review before Harmonious can approve or complete it.</p> : r.status !== "completed" && (
        <div className="flex flex-wrap gap-2">
          <Input aria-label="Operations review note" placeholder="Note (required to return)" value={note} onChange={(e) => setNote(e.target.value)} className="max-w-sm bg-background" />
          {r.status === "submitted" && <Button size="sm" variant="outline" disabled={busy} onClick={() => set("in_review")}>Start review</Button>}
          {r.status === "in_review" && <Button size="sm" disabled={busy} onClick={doApprove}>Approve close</Button>}
          {r.status === "approved" && <Button size="sm" disabled={busy} onClick={() => set("completed")}>Mark completed</Button>}
          <Button size="sm" variant="destructive" disabled={busy} onClick={() => set("returned")}>Return</Button>
        </div>
      )}
      {(r.status === "approved" || r.status === "completed") && <CloseFilingsPanel requestId={r.id} canPrepare={r.status === "approved"} />}
    </section>
  );
}

export function CloseRequestReview({ r }: { r: any }) {
  return <CloseRequestCard r={r} operations showFund />;
}
