import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { TaxDocumentDownload } from "@/components/tax-document-download";
import { getMyTaxDocuments } from "@/lib/portal-documents.functions";

export const Route = createFileRoute("/investor/tax")({
  head: () => ({
    meta: [
      { title: "Tax documents - Harmonious Investor Portal" },
      { name: "description", content: "Your Schedule K-1s for each investment, protected by two-step verification." },
      { property: "og:title", content: "Tax documents - Harmonious Investor Portal" },
      { property: "og:description", content: "Your Schedule K-1s for each investment." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
  component: InvestorTaxPage,
});

function InvestorTaxPage() {
  const load = useServerFn(getMyTaxDocuments);
  const q = useQuery({ queryKey: ["my-tax-documents"], queryFn: () => load() as Promise<any> });
  const data = q.data as any;

  return (
    <div className="mx-auto w-full max-w-4xl space-y-6 px-4 py-8">
      <div>
        <h1 className="font-heading text-2xl font-semibold">Tax</h1>
        <p className="text-sm text-muted-foreground">Schedule K-1s for each of your investments. Each download asks you to confirm it's you.</p>
      </div>
      {q.isLoading && <Skeleton className="h-32 w-full" />}
      {q.isError && <p className="text-sm text-destructive">Tax documents are temporarily unavailable. Please try again later.</p>}
      {data?.mfaRequired && <p className="text-sm">Two-step verification is required before tax documents can be shown.</p>}
      {data && !data.mfaRequired && data.investments.length === 0 && (
        <p className="text-sm text-muted-foreground">We couldn't find investments linked to your account yet. Contact Harmonious if this looks wrong.</p>
      )}
      {data?.investments?.map((inv: any) => (
        <Card key={`${inv.offeringId}:${inv.profileId}`}>
          <CardHeader>
            <CardTitle className="text-base">{inv.fundName}</CardTitle>
            <CardDescription>Investing as {inv.profileName}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            {inv.documents.length === 0 ? (
              <p className="text-sm text-muted-foreground">Not available yet.</p>
            ) : (
              inv.documents.map((d: any) => (
                <div key={d.id} className="flex items-center justify-between gap-3 rounded-md border p-3 text-sm">
                  <span>{d.label}</span>
                  <TaxDocumentDownload documentId={d.id} label={`${inv.fundName} · ${d.label}`} />
                </div>
              ))
            )}
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
