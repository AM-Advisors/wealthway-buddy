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
import { openCloseAttachment, updateFundCloseRequestStatus } from "@/lib/fund-close-requests.functions";
import { CloseInvestorTerms } from "@/components/close-investor-terms";
import { Pencil } from "lucide-react";
import { CloseHarmoniousFees } from "@/components/close-harmonious-fees";

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

function Field({ k, v }: { k: string; v: React.ReactNode }) {
  return <div><dt className="text-xs text-muted-foreground">{k}</dt><dd className="font-medium">{v || "Not recorded"}</dd></div>;
}
function Group({ title, children }: { title: string; children: React.ReactNode }) {
  return <section className="rounded-md border p-4"><p className="mb-3 font-semibold">{title}</p><dl className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">{children}</dl></section>;
}

function CloseAttachment({ r, kind, name, path }: { r: any; kind: "purchase_agreement" | "wire_instructions"; name: string | undefined; path: string | undefined }) {
  const openFile = useServerFn(openCloseAttachment);
  const [busy, setBusy] = useState(false);
  async function open() {
    const tab = window.open("about:blank", "_blank");
    if (tab) tab.opener = null;
    setBusy(true);
    try {
      const { url } = await openFile({ data: { id: r.id, kind } });
      if (tab) tab.location.href = url;
      else toast.error("Allow pop-ups to open the attachment.");
    } catch (e) { tab?.close(); toast.error(e instanceof Error ? e.message : "Couldn't open the attachment."); }
    finally { setBusy(false); }
  }
  return path ? <Button size="sm" variant="link" className="h-auto max-w-full whitespace-normal break-all p-0 text-left" disabled={busy} onClick={open}>{busy ? "Opening…" : name || "Open copy"}</Button> : <>{name || "Not attached"}</>;
}

export function CloseDetailsSummary({ r }: { r: any }) {
  if (!r.details || !Object.keys(r.details).length) return null;
  const d = r.details;
  const asset = d.assetMode === "new" ? d.asset?.name : d.existingAsset;
  const assetDetail = d.assetMode === "new" ? [d.asset?.issuer, d.asset?.type, d.asset?.amountCents == null ? null : money(d.asset.amountCents)].filter(Boolean).join(" · ") : "";
  const wire = d.wire ?? {};
  const lines: any[] = Array.isArray(d.blueSkyLines) ? d.blueSkyLines : [];
  const yes = (on: boolean | undefined, cents: number | null | undefined) => (on ?? cents != null) ? "Yes" : "No";
  return (
    <div className="space-y-3">
      <Group title="Close details">
        <Field k="Close date requested" v={fmtDate(r.target_date)} />
        <Field k="Amount for close" v={d.closeAmountCents == null ? null : money(d.closeAmountCents)} />
        <Field k="Asset" v={<>{asset}{assetDetail && <span className="block text-xs font-normal text-muted-foreground">{assetDetail}</span>}</>} />
        <Field k="Purchase agreement" v={<CloseAttachment r={r} kind="purchase_agreement" name={d.purchaseAgreementName} path={d.purchaseAgreementPath} />} />
        <Field k="Signed-copy confirmation" v={d.purchaseAgreementSigned ? "Confirmed by uploader, pending review" : "Not confirmed"} />
      </Group>
      <Group title="Fees">
        <Field k="Recorded management fee total" v={d.managementFeeCents == null ? null : money(d.managementFeeCents)} />
        <Field k="Default management fee" v={d.managementFeePct == null ? null : `${d.managementFeePct}% before investor exceptions`} />
        <Field k="Bank name" v={d.feeBankName} />
        <Field k="Address" v={d.feeAddress} />
      </Group>
      <Group title="Legal fees">
        <Field k="Legal fees" v={yes(d.legalOn, d.legalFeesCents)} />
        <Field k="Payee account" v={d.legalPayee} />
        <Field k="Amount" v={d.legalFeesCents == null ? null : money(d.legalFeesCents)} />
        <Field k="Due date" v={d.legalDueDate ? fmtDate(d.legalDueDate) : null} />
      </Group>
      <Group title="Broker-Dealer fee">
        <Field k="Broker-Dealer fee" v={yes(d.brokerDealerOn, d.brokerDealerFeesCents)} />
        <Field k="Fee amount" v={d.brokerDealerFeesCents == null ? null : money(d.brokerDealerFeesCents)} />
        <Field k="Payee account" v={d.brokerDealerPayee} />
        <Field k="Broker-Dealer name" v={d.brokerDealerName} />
        <Field k="Due date" v={d.brokerDealerDueDate ? fmtDate(d.brokerDealerDueDate) : null} />
      </Group>
      <Group title="Form D & Blue Sky fees">
        <Field k="Electronic Form D Filing" v={money(d.formDFeeCents ?? 16000)} />
        <Field k="States" v={lines.length ? lines.map((l) => l.state).join(", ") : (d.investorStates?.length ? d.investorStates.join(", ") : null)} />
        <Field k="State fees" v={lines.length ? lines.map((l) => `${l.state}: ${l.status === "filed" ? "already filed" : l.status === "review" ? "needs review" : l.status === "none" ? "no fee" : money(l.cents)}`).join(" · ") : null} />
        <Field k="Estimated total" v={d.filingTotalCents == null ? null : money(d.filingTotalCents)} />
      </Group>
      <Group title="Receiving account (wire to)">
        <Field k="Account name" v={wire.beneficiary} />
        <Field k="Bank name" v={wire.bankName} />
        <Field k="Address" v={d.wireAddress} />
        <Field k="Account number" v={wire.accountLast4 ? `Ending ${wire.accountLast4}` : null} />
        <Field k="Routing number" v={wire.routingLast4 ? `Ending ${wire.routingLast4}` : null} />
        <Field k="Wire instructions copy" v={<CloseAttachment r={r} kind="wire_instructions" name={d.wireInstructionsName} path={d.wireInstructionsPath} />} />
      </Group>
    </div>
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
        {Array.isArray(r.investorTerms ?? r.details?.investorTerms) && <CloseInvestorTerms investors={r.investorTerms ?? r.details.investorTerms} />}
        {(r.harmoniousFees ?? r.details?.harmoniousFees) ? <CloseHarmoniousFees fees={r.harmoniousFees ?? r.details.harmoniousFees} operations={operations} clientId={r.client_id ?? r.details?.harmoniousFees?.clientId ?? null} /> : r.details?.sideLetterCount != null && <p>Side letters (recorded estimate): {money(r.details.sideLetterFeeCents)}. This earlier close has no full Harmonious fee schedule on file.</p>}
        {r.staff_note && <p className="text-xs text-muted-foreground">Harmonious: {r.staff_note}</p>}
        {r.status === "draft" && onContinue && <Button size="sm" variant="outline" onClick={onContinue}><Pencil className="mr-2 h-4 w-4" />Edit close details</Button>}
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
