import { createFileRoute, notFound, useNavigate, useSearch } from "@tanstack/react-router";
import { useMutation } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";

import { getOfferingLanding, startOnboardingFn } from "@/lib/investor-onboarding.functions";
import { useAuth } from "@/hooks/useAuth";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

const SITE = "https://onboard.harmonious.co";

const money = (cents: number | null | undefined) =>
  cents == null ? "—" : `$${(cents / 100).toLocaleString(undefined, { maximumFractionDigits: 2 })}`;

export const Route = createFileRoute("/invest/$slug")({
  validateSearch: (search: Record<string, unknown>) => ({
    invite: typeof search['invite'] === "string" ? (search['invite'] as string) : undefined,
  }),
  loader: async ({ params }) => {
    const fund = await getOfferingLanding({ data: { slug: params.slug } }).catch(() => null);
    if (!fund) throw notFound();
    return { fund };
  },
  head: ({ loaderData, params }) => {
    const name = loaderData?.fund.name ?? "Fund";
    const description = (
      loaderData?.fund.description ?? `Invest in ${name} through the Harmonious portal.`
    ).slice(0, 155);
    return {
      meta: [
        { title: `Invest in ${name} — Harmonious` },
        { name: "description", content: description },
        { property: "og:title", content: `Invest in ${name} — Harmonious` },
        { property: "og:description", content: description },
        { property: "og:type", content: "website" },
        { property: "og:url", content: `${SITE}/invest/${params.slug}` },
        { name: "twitter:card", content: "summary" },
      ],
    };
  },
  component: InvestLanding,
});

function InvestLanding() {
  const { fund } = Route.useLoaderData();
  const { invite } = useSearch({ from: "/invest/$slug" });
  const { slug } = Route.useParams();
  const navigate = useNavigate();
  const { user, loading } = useAuth();
  const start = useServerFn(startOnboardingFn);

  const begin = useMutation({
    mutationFn: () => start({ data: { slugOrId: slug, invitationToken: invite ?? null } }),
    onSuccess: (result: any) =>
      navigate({ to: "/investment/$onboardingId", params: { onboardingId: result.onboardingId } }),
    onError: (e: any) => toast.error(String(e?.message ?? e).replace(/^Forbidden:\s*/, "")),
  });

  return (
    <main className="mx-auto max-w-3xl px-4 py-16">
      <Card>
        <CardHeader>
          <CardTitle className="text-3xl">{fund.name}</CardTitle>
          <CardDescription>{fund.legalName ?? ""}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          {fund.description ? <p className="text-sm">{fund.description}</p> : null}
          <p className="text-sm text-muted-foreground">
            Minimum investment {money(fund.minInvestmentCents)}
            {fund.targetClose ? ` · Target close ${fund.targetClose}` : ""}
          </p>
          {loading ? null : user ? (
            <Button onClick={() => begin.mutate()} disabled={begin.isPending}>
              {begin.isPending ? "Opening…" : "Start or continue your investment"}
            </Button>
          ) : (
            <Button onClick={() => navigate({ to: "/auth" })}>Sign in to invest</Button>
          )}
        </CardContent>
      </Card>
    </main>
  );
}
