import { createFileRoute, notFound, useNavigate, useSearch } from "@tanstack/react-router";
import { useMutation } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";

import { PENDING_MATCH_MESSAGE } from "@/lib/investor-record-model";
import { getOfferingLanding, startOnboardingFn } from "@/lib/investor-onboarding.functions";
import { useAuth } from "@/hooks/useAuth";
import { DealReview } from "@/components/deal-review";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

const SITE = "https://app.harmonious.co";

const money = (cents: number | null | undefined) =>
  cents == null ? "-" : `$${(cents / 100).toLocaleString(undefined, { maximumFractionDigits: 2 })}`;

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
        { name: "robots", content: "noindex, nofollow" },
        { title: `Invest in ${name} - Harmonious` },
        { name: "description", content: description },
        { property: "og:title", content: `Invest in ${name} - Harmonious` },
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
      result.onboardingId
        ? navigate({ to: "/investment/$onboardingId", params: { onboardingId: result.onboardingId } })
        : toast.message(PENDING_MATCH_MESSAGE.title, { description: PENDING_MATCH_MESSAGE.body }),
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
          {loading || user ? null : (
            <Button onClick={() => navigate({ to: "/auth" })}>Sign in to review the deal and invest</Button>
          )}
        </CardContent>
      </Card>
      {user ? (
        <div className="mt-6 space-y-6">
          <h2 className="text-xl font-semibold">Review this deal</h2>
          <DealReview slug={slug} />
          <Card>
            <CardContent className="space-y-3 py-6">
              <p className="text-sm text-muted-foreground">
                Reviewing creates no commitment. When you continue, you'll go through About You, Verification, Sign and Fund.
              </p>
              <Button onClick={() => begin.mutate()} disabled={begin.isPending}>
                {begin.isPending ? "Opening…" : "I've reviewed this deal - continue to invest"}
              </Button>
            </CardContent>
          </Card>
        </div>
      ) : null}
    </main>
  );
}
