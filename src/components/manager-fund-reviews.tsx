import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { RefreshCw } from "lucide-react";
import { investorGridFn, fundBooksFn } from "@/lib/fund-tabs.functions";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { LoadError } from "@/components/load-error";
import { InvestorSheet } from "@/components/fund-tabs/investors-tab";
import { InvestorDocumentReview } from "@/components/investor-document-review";
import { ManagerBankingSummary } from "@/components/manager-banking-summary";
import { WireFromBankForm } from "@/components/wire-from-bank-form";
import { StatementUpload } from "@/components/fund-tabs/statement-upload";
import { Transactions } from "@/components/fund-tabs/banking-tab";
import { usd } from "@/components/fund-tabs/shared";

/** Manager preparation and canonical status only; no identity or money authority is granted here. */
export function ManagerFundReviews({ fundId }: { fundId: string }) {
  const [tab, setTab] = useState("kyc");
  return <section className="min-w-0 space-y-4 border-b pb-6">
    <h2 className="font-heading text-xl font-semibold">Fund reviews</h2>
    <Tabs value={tab} onValueChange={setTab}>
      <div className="overflow-x-auto">
        <TabsList className="h-auto w-max justify-start">
          <TabsTrigger value="kyc">KYC / KYB</TabsTrigger>
          <TabsTrigger value="banking">Banking complete</TabsTrigger>
          <TabsTrigger value="investors">Investor approval</TabsTrigger>
          <TabsTrigger value="receipts">Money received</TabsTrigger>
        </TabsList>
      </div>
      <TabsContent value="kyc">{tab === "kyc" && <InvestorReviewList fundId={fundId} kind="kyc" />}</TabsContent>
      <TabsContent value="banking">{tab === "banking" && <div className="space-y-5">
        <ManagerBankingSummary fundId={fundId} />
        <section className="space-y-3"><h3 className="font-semibold">Bank details &amp; evidence</h3><WireFromBankForm fundId={fundId} allowPrefill={false} /></section>
      </div>}</TabsContent>
      <TabsContent value="investors">{tab === "investors" && <div className="space-y-5">
        <p className="text-sm text-muted-foreground">Document approval permits signing; approval to fund remains a separate review.</p>
        <InvestorDocumentReview offeringId={fundId} />
      </div>}</TabsContent>
      <TabsContent value="receipts">{tab === "receipts" && <ReceiptReview fundId={fundId} />}</TabsContent>
    </Tabs>
  </section>;
}

function InvestorReviewList({ fundId, kind }: { fundId: string; kind: "kyc" | "receipts" }) {
  const load = useServerFn(investorGridFn);
  const q = useQuery({ queryKey: ["fund-investor-grid", fundId], queryFn: () => load({ data: { fundId } }) });
  const [search, setSearch] = useState("");
  const [needsOnly, setNeedsOnly] = useState(false);
  const [open, setOpen] = useState<string | null>(null);
  const rows = (q.data ?? []).filter((r) => (!needsOnly || !r.kycOk) && `${r.name} ${r.profileName ?? ""} ${r.email ?? ""}`.toLowerCase().includes(search.toLowerCase()));
  return <div className="space-y-3">
    <div className="flex flex-wrap items-center gap-2">
      <Input className="max-w-sm" aria-label="Search investors" placeholder="Search investors" value={search} onChange={(e) => setSearch(e.target.value)} />
      {kind === "kyc" && <Button variant={needsOnly ? "default" : "outline"} onClick={() => setNeedsOnly(!needsOnly)} aria-pressed={needsOnly}>Needs attention</Button>}
      <Button variant="outline" size="icon" aria-label="Refresh investor reviews" disabled={q.isFetching} onClick={() => void q.refetch()}><RefreshCw className="size-4" /></Button>
    </div>
    {kind === "kyc" && <p className="text-sm text-muted-foreground">Verification results come from identity and AML checks. Pending or unresolved matches remain open.</p>}
    {q.isPending ? <p className="text-sm text-muted-foreground">Loading investors…</p> : q.error ? <LoadError error={q.error} what="Investor reviews" audience="account" onRetry={() => void q.refetch()} /> : !rows.length ? <p className="py-4 text-sm text-muted-foreground">No investors match this view.</p> :
      <ul className="divide-y">{rows.map((r) => <li key={r.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
        <div className="min-w-0"><p className="font-medium break-words">{r.name}</p>{r.profileName && <p className="text-xs text-muted-foreground break-words">{r.profileName}</p>}
          <p className="text-xs text-muted-foreground">{kind === "kyc" ? r.kycLabel : `${usd(r.receivedCents)} reconciled · ${usd(r.committedCents)} committed`}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2"><Badge variant="outline">{kind === "kyc" ? r.kycOk ? "Clear" : "Not cleared" : r.wiring}</Badge><Button size="sm" variant="outline" onClick={() => setOpen(r.id)}>Review investor</Button></div>
      </li>)}</ul>}
    <InvestorSheet fundId={fundId} id={open} onClose={() => setOpen(null)} />
  </div>;
}

function ReceiptReview({ fundId }: { fundId: string }) {
  const load = useServerFn(fundBooksFn);
  const q = useQuery({ queryKey: ["fund-books", fundId], queryFn: () => load({ data: { fundId } }) });
  return <div className="space-y-5">
    <InvestorReviewList fundId={fundId} kind="receipts" />
    <p className="text-sm text-muted-foreground">Only reconciled bank receipts count as received. Uploaded statements and investor labels do not confirm funding.</p>
    {q.isPending ? <p className="text-sm text-muted-foreground">Loading bank evidence…</p> : q.error ? <LoadError error={q.error} what="Bank evidence" audience="account" onRetry={() => void q.refetch()} /> : q.data && <>
      <StatementUpload fundId={fundId} investors={q.data.investors ?? []} />
      <Transactions fundId={fundId} d={q.data} />
    </>}
  </div>;
}