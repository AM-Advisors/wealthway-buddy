import { createFileRoute, Link } from "@tanstack/react-router";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export const Route = createFileRoute("/_authenticated/manager/capital")({
  head: () => ({
    meta: [
      { title: "Capital — Harmonious" },
      {
        name: "description",
        content: "Investor capital, cash to confirm and distributions for the funds you manage.",
      },
      { property: "og:title", content: "Capital — Harmonious" },
      {
        property: "og:description",
        content: "Investor capital, cash to confirm and distributions for the funds you manage.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: ManagerCapitalPage,
});

/**
 * Capital brings the existing capital surfaces together in one place instead of
 * adding more items to the menu. Every section is the page that already owns
 * that work — nothing about the underlying records changes.
 */
const SECTIONS = [
  {
    title: "Investor capital",
    description: "Capital accounts and allocations for each investor.",
    url: "/manager/allocations",
  },
  {
    title: "Cash to confirm",
    description: "Incoming funds waiting on your confirmation.",
    url: "/manager/cash-approvals",
  },
  {
    title: "Capital calls and funding",
    description: "Where each investor stands on funding.",
    url: "/manager/investor-onboarding",
  },
  {
    title: "Distributions",
    description: "Distributions to your investors and their progress.",
    url: "/manager/distributions",
  },
];

function ManagerCapitalPage() {
  return (
    <div className="mx-auto w-full max-w-4xl space-y-6 p-6">
      <div>
        <h1 className="text-2xl font-semibold">Capital</h1>
        <p className="text-sm text-muted-foreground">
          Money in and money out for the funds you manage.
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        {SECTIONS.map((section) => (
          <Card key={section.url}>
            <CardHeader>
              <CardTitle className="text-base">{section.title}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-sm">
              <p className="text-muted-foreground">{section.description}</p>
              <Link to={section.url as never} className="font-medium underline">
                Open
              </Link>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
