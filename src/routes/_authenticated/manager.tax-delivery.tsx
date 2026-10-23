import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { TaxDocumentDownload } from "@/components/tax-document-download";
import { getManagerTaxDelivery } from "@/lib/portal-documents.functions";

export const Route = createFileRoute("/_authenticated/manager/tax-delivery")({
  head: () => ({
    meta: [
      { title: "K-1 delivery status - Harmonious" },
      { name: "description", content: "See which investors in your funds have K-1s available, without opening their tax documents." },
      { property: "og:title", content: "K-1 delivery status - Harmonious" },
      { property: "og:description", content: "K-1 availability for the funds you manage." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: Page,
});

function Page() {
  const load = useServerFn(getManagerTaxDelivery);
  const q = useQuery({ queryKey: ["manager-tax-delivery"], queryFn: () => load() as Promise<any> });
  const funds = ((q.data as any)?.funds ?? []) as any[];
  return (
    <div className="mx-auto w-full max-w-5xl space-y-6 px-4 py-8 sm:px-6">
      <div>
        <h1 className="font-heading text-2xl font-semibold">Tax delivery</h1>
        <p className="text-sm text-muted-foreground">K-1 availability for each investor. You see status only; opening an investor's K-1 needs that investor's document to be shared with you by Harmonious.</p>
      </div>
      {q.isLoading && <Skeleton className="h-40 w-full" />}
      {!q.isLoading && funds.length === 0 && <p className="text-sm text-muted-foreground">No funds are assigned to you.</p>}
      {funds.map((f) => (
        <Card key={f.offeringId}>
          <CardHeader>
            <CardTitle className="text-base">{f.fundName}</CardTitle>
            <CardDescription>{f.unresolved ? `${f.unresolved} document${f.unresolved === 1 ? "" : "s"} waiting on Harmonious review` : "No open delivery issues"}</CardDescription>
          </CardHeader>
          <CardContent className="overflow-x-auto">
            {f.years.length === 0 ? <p className="text-sm text-muted-foreground">No K-1s catalogued for this fund yet.</p> : (
              <Table>
                <TableHeader><TableRow><TableHead>Investor</TableHead>{f.years.map((y: number) => <TableHead key={y}>{y}</TableHead>)}</TableRow></TableHeader>
                <TableBody>
                  {f.investors.map((i: any) => (
                    <TableRow key={i.profileId}>
                      <TableCell>{i.name}</TableCell>
                      {f.years.map((y: number) => {
                        const c = i.years[y];
                        return (
                          <TableCell key={y}>
                            <div className="flex items-center gap-2">
                              <Badge variant={c.status === "Available" ? "default" : "outline"}>{c.status}</Badge>
                              {c.documentId && <TaxDocumentDownload documentId={c.documentId} label={`${i.name} ${y}`} />}
                            </div>
                          </TableCell>
                        );
                      })}
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
