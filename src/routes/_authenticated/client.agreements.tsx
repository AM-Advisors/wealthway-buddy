import { createFileRoute } from "@tanstack/react-router";

import { ClientOffboardingPanel } from "@/components/client-offboarding-panel";
import { ClientSowPanel } from "@/components/client-sow-panel";
import { useClientPortal } from "@/components/client-portal-context";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export const Route = createFileRoute("/_authenticated/client/agreements")({
  head: () => ({
    meta: [
      { title: "Agreements & scope — Harmonious" },
      {
        name: "description",
        content:
          "Your statement of work with Harmonious and exactly which services are included in your active scope.",
      },
      { property: "og:title", content: "Agreements & scope — Harmonious" },
      {
        property: "og:description",
        content: "Your statement of work and the services included in your active scope.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: ClientAgreementsPage,
});

const date = (value: string | null | undefined) =>
  value ? new Date(value).toLocaleDateString("en-US") : "—";

function ClientAgreementsPage() {
  const { data } = useClientPortal();
  const sows = (data?.sows ?? []) as any[];
  const services = (data?.services ?? []) as any[];

  return (
    <div className="space-y-6">
      <ClientSowPanel sows={sows as any} />

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Included in your scope</CardTitle>
          <CardDescription>
            Anything not listed here isn't currently included in your active scope. You can ask
            for it from the Sign-offs page and Harmonious will confirm the fee and paperwork
            first.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-2">
          {services.length === 0 && (
            <p className="text-sm text-muted-foreground">
              No services are recorded against your scope yet.
            </p>
          )}
          {services.map((s: any) => (
            <div key={`${s.key}-${s.offeringId ?? "client"}`} className="rounded-md border p-3">
              <p className="text-sm font-medium">{s.name}</p>
              {s.description && <p className="text-xs text-muted-foreground">{s.description}</p>}
              <p className="mt-1 text-xs text-muted-foreground">
                {s.offeringId ? "Fund-specific" : "Applies across your engagement"}
                {s.effectiveDate ? ` · from ${date(s.effectiveDate)}` : ""}
              </p>
            </div>
          ))}
        </CardContent>
      </Card>

      <ClientOffboardingPanel />
    </div>
  );
}
