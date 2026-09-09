import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";

import { listManageableFunds } from "@/lib/public-fund.functions";
import { PublicPageSettings } from "@/components/public-page-settings";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

export const Route = createFileRoute("/_authenticated/manager/public-page")({
  head: () => ({
    meta: [
      { title: "Public fund page — Harmonious" },
      {
        name: "description",
        content: "Publish a public page for your fund with the pitch deck, documents and cap table.",
      },
      { property: "og:title", content: "Public fund page — Harmonious" },
      {
        property: "og:description",
        content: "Switch your fund's public page on and edit what visitors read first.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: ManagerPublicPage,
});

function ManagerPublicPage() {
  const load = useServerFn(listManageableFunds);
  const [selected, setSelected] = useState<string | null>(null);

  const query = useQuery({ queryKey: ["manageable-funds"], queryFn: () => load() });
  const funds = query.data?.funds ?? [];
  const fundId = selected ?? funds[0]?.id ?? null;

  return (
    <main className="mx-auto w-full max-w-3xl space-y-6 px-4 py-10">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Public fund page</h1>
          <p className="text-sm text-muted-foreground">
            Let visitors review the fund before they contact you.
          </p>
        </div>
        <Button asChild variant="outline" size="sm">
          <Link to="/manager/requests">Access requests</Link>
        </Button>
      </header>

      {funds.length > 1 ? (
        <div className="flex flex-wrap gap-2">
          {funds.map((fund) => (
            <Button
              key={fund.id}
              size="sm"
              variant={fundId === fund.id ? "default" : "outline"}
              onClick={() => setSelected(fund.id)}
            >
              {fund.name}
            </Button>
          ))}
        </div>
      ) : null}

      {query.isLoading ? <p className="text-sm text-muted-foreground">Loading…</p> : null}
      {!query.isLoading && !fundId ? (
        <Card>
          <CardContent className="py-10 text-center text-sm text-muted-foreground">
            You are not assigned to a fund yet.
          </CardContent>
        </Card>
      ) : null}

      {fundId ? <PublicPageSettings offeringId={fundId} /> : null}
    </main>
  );
}
