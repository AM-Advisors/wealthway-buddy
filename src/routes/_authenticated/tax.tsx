import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { getInvestorTaxDocuments } from "@/lib/tax.functions";

export const Route = createFileRoute("/_authenticated/tax")({
  head: () => ({
    meta: [
      { title: "Tax documents — Harmonious" },
      { name: "description", content: "Your tax documents for each investment profile." },
      { property: "og:title", content: "Tax documents — Harmonious" },
      { property: "og:description", content: "Your tax documents for each investment profile." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: TaxPage,
});

function TaxPage() {
  const docsFn = useServerFn(getInvestorTaxDocuments);
  const { data, isLoading } = useQuery({
    queryKey: ["investor-tax-documents"],
    queryFn: () => docsFn({ data: {} }) as Promise<any>,
  });

  const groups: { label: string; items: any[] }[] = [
    { label: "Schedule K-1", items: data?.k1Forms ?? data?.k1 ?? [] },
    { label: "Form 1042-S", items: data?.form1042s ?? data?.f1042s ?? [] },
    { label: "Form 1099", items: data?.form1099 ?? data?.f1099 ?? [] },
  ];

  return (
    <div className="mx-auto w-full max-w-4xl space-y-6 p-6">
      <div>
        <h1 className="text-2xl font-semibold">Tax</h1>
        <p className="text-sm text-muted-foreground">
          Tax documents are kept separate for each of your investment profiles.
        </p>
      </div>

      {isLoading && <p className="text-sm text-muted-foreground">Loading your tax documents…</p>}

      {!isLoading &&
        groups.map((group) => (
          <Card key={group.label}>
            <CardHeader>
              <CardTitle>{group.label}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {group.items.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  Nothing issued yet. Documents appear here once Harmonious releases them.
                </p>
              ) : (
                group.items.map((item: any, index: number) => (
                  <div key={item.id ?? index} className="rounded-md border p-3 text-sm">
                    <p className="font-medium">
                      {item.tax_year ?? item.year ?? ""} {group.label}
                    </p>
                    <p className="text-muted-foreground">
                      {item.profile_name ?? item.investment_profile_name ?? "Investment profile"}
                    </p>
                  </div>
                ))
              )}
            </CardContent>
          </Card>
        ))}

      <p className="text-sm">
        <Link to="/documents" className="underline">
          All of your documents
        </Link>
      </p>
    </div>
  );
}
