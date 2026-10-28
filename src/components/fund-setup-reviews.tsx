import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { getFundSetupOverview } from "@/lib/fund-setup-canonical.functions";
import { invalidateFund } from "@/lib/fund-query-keys";
import { EconomicsCard } from "@/components/fund-setup-canonical";
import { OfferingDocumentsSetup } from "@/components/offering-documents-setup";
import { FundQuestionSectionCard } from "@/components/fund-question-section-card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

/** Navigation only: each existing review tool retains its own authorization and decisions. */
export function FundSetupReviews({ fundId }: { fundId: string }) {
  const [tab, setTab] = useState("fees");
  return <Tabs value={tab} onValueChange={setTab} className="space-y-4">
    <TabsList aria-label="Fund setup approvals" className="h-auto w-full flex-wrap justify-start gap-1">
      <TabsTrigger value="fees">Fees &amp; terms</TabsTrigger>
      <TabsTrigger value="documents">Documents</TabsTrigger>
      <TabsTrigger value="questions">Investor questions</TabsTrigger>
    </TabsList>
    <TabsContent value="fees">{tab === "fees" && <FeesReview fundId={fundId} />}</TabsContent>
    <TabsContent value="documents">{tab === "documents" && <OfferingDocumentsSetup offeringId={fundId} />}</TabsContent>
    <TabsContent value="questions">{tab === "questions" && <FundQuestionSectionCard offeringId={fundId} />}</TabsContent>
  </Tabs>;
}

function FeesReview({ fundId }: { fundId: string }) {
  const load = useServerFn(getFundSetupOverview);
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ["fund-setup-canonical", fundId], queryFn: () => load({ data: { offeringId: fundId } }) });
  if (q.isPending) return <p className="text-sm text-muted-foreground">Loading fees &amp; terms…</p>;
  if (q.isError) return <p role="alert" className="text-sm text-destructive">{q.error.message}</p>;
  return <EconomicsCard offeringId={fundId} d={q.data} onSaved={() => { void invalidateFund(qc, fundId); }} />;
}