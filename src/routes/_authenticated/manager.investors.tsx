import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";

import { getFundOverview, getManagerFunds } from "@/lib/manager.functions";
import { money, prettyStatus, statusTone } from "@/lib/status";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { FundOperations } from "@/components/fund-operations";
import { InvestorReviewBoard } from "@/components/investor-review-board";



export const Route = createFileRoute("/_authenticated/manager/investors")({
  head: () => ({
    meta: [
      { title: "Investors — Harmonious Manager" },
      {
        name: "description",
        content:
          "Fund managers review every investor in their fund: identity checks, accreditation, signed documents and funding, in one place.",
      },
      { property: "og:title", content: "Investors — Harmonious Manager" },
      {
        property: "og:description",
        content: "One workspace per fund: investor roster, verification status and document review.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: ManagerInvestorsPage,
});

const STAGES = [
  { key: "all", label: "All investors" },
  { key: "identity", label: "Identity" },
  { key: "accreditation", label: "Accreditation" },
  { key: "documents", label: "Documents" },
  { key: "funding", label: "Funding" },
  { key: "complete", label: "Complete" },
] as const;

type Stage = (typeof STAGES)[number]["key"];

function stageOf(app: any): Exclude<Stage, "all"> {
  if (app.funding_status === "settled") return "complete";
  if (app.kyc_status !== "approved" || app.aml_status !== "approved") return "identity";
  if (app.accreditation_status !== "approved") return "accreditation";
  if (app.documents_status !== "approved") return "documents";
  return "funding";
}

function ManagerInvestorsPage() {
  const funds = useServerFn(getManagerFunds);
  const overview = useServerFn(getFundOverview);

  const fundsQuery = useQuery({ queryKey: ["manager-funds"], queryFn: () => funds() });
  const [offeringId, setOfferingId] = useState<string | null>(null);
  const [stage, setStage] = useState<Stage>("all");
  const [search, setSearch] = useState("");

  const fundList = fundsQuery.data?.funds ?? [];

  useEffect(() => {
    if (!offeringId && fundList.length > 0) setOfferingId(fundList[0]!.id);
  }, [fundList, offeringId]);

  const overviewQuery = useQuery({
    queryKey: ["fund-overview", offeringId],
    queryFn: () => overview({ data: { offeringId: offeringId! } }),
    enabled: !!offeringId,
  });

  const investors = useMemo(() => {
    const rows = overviewQuery.data?.investors ?? [];
    const term = search.trim().toLowerCase();
    return rows.filter((r: any) => {
      if (stage !== "all" && stageOf(r) !== stage) return false;
      if (!term) return true;
      const name = String(r.profile?.legal_name ?? "").toLowerCase();
      const email = String(r.profile?.email ?? "").toLowerCase();
      return name.includes(term) || email.includes(term);
    });
  }, [overviewQuery.data, stage, search]);

  if (fundsQuery.isLoading) {
    return <main className="mx-auto max-w-5xl px-4 py-10 text-sm text-muted-foreground">Loading…</main>;
  }

  if (fundsQuery.isError) {
    return (
      <main className="mx-auto max-w-2xl px-4 py-16">
        <h1 className="text-3xl">Restricted</h1>
        <p className="mt-3 text-sm text-muted-foreground">
          This portal is limited to Harmonious fund managers and compliance staff.
        </p>
      </main>
    );
  }

  if (fundList.length === 0) {
    return (
      <main className="mx-auto max-w-2xl px-4 py-16">
        <h1 className="text-3xl">No funds assigned yet</h1>
        <p className="mt-3 text-sm text-muted-foreground">
          You have manager access, but no fund has been assigned to you. Ask a Harmonious administrator to
          grant you a fund on the access page.
        </p>
      </main>
    );
  }

  const data = overviewQuery.data;

  return (
    <main className="mx-auto max-w-6xl px-4 py-10">
      <h1 className="text-3xl">Investors</h1>
      <p className="mt-2 text-sm text-muted-foreground">
        Every investor in your fund, with identity, accreditation, documents and funding in one view.
      </p>



      {fundList.length > 1 && (
        <div className="mt-6 flex flex-wrap gap-2">
          {fundList.map((f: any) => (
            <Button
              key={f.id}
              size="sm"
              variant={f.id === offeringId ? "default" : "outline"}
              onClick={() => setOfferingId(f.id)}
            >
              {f.name}
            </Button>
          ))}
        </div>
      )}

      {data && (
        <>
          <div className="mt-6 flex flex-wrap items-center gap-2">
            <h2 className="text-xl">{data.offering.name}</h2>
            <Badge variant="secondary">Reg D {data.offering.reg_type}</Badge>
            <Badge variant={data.offering.is_open ? "default" : "outline"}>
              {data.offering.is_open ? "Open" : "Closed"}
            </Badge>
          </div>

          <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Stat label="Investors" value={String(data.counts.total)} />
            <Stat label="Committed" value={money(data.committedCents)} />
            <Stat label="Funded" value={money(data.settledCents)} />
            <Stat label="Complete" value={`${data.counts.complete} of ${data.counts.total}`} />
          </div>

          <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Stat label="Waiting on identity" value={String(data.counts.identity)} />
            <Stat label="Waiting on accreditation" value={String(data.counts.accreditation)} />
            <Stat label="Documents outstanding" value={String(data.counts.documents)} />
            <Stat label="Funding pending" value={String(data.counts.funding)} />
          </div>

          <div className="mt-8 flex flex-wrap items-center gap-2">
            {STAGES.map((s) => (
              <Button
                key={s.key}
                size="sm"
                variant={s.key === stage ? "default" : "outline"}
                onClick={() => setStage(s.key)}
              >
                {s.label}
              </Button>
            ))}
            <Input
              className="ml-auto w-56"
              placeholder="Search name or email"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>

          <div className="mt-4 space-y-3">
            {overviewQuery.isLoading ? (
              <p className="text-sm text-muted-foreground">Loading investors…</p>
            ) : investors.length === 0 ? (
              <p className="text-sm text-muted-foreground">No investors match this view.</p>
            ) : (
              investors.map((inv: any) => (
                <Card key={inv.id}>
                  <CardHeader className="pb-3">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="min-w-0">
                        <CardTitle className="text-base">
                          {inv.profile?.legal_name ?? "Investor"}
                        </CardTitle>
                        <CardDescription>
                          {inv.profile?.email ?? "no email on file"}
                          {inv.profile?.investor_type ? ` · ${inv.profile.investor_type}` : ""}
                          {` · ${money(inv.commitment_cents)}`}
                        </CardDescription>
                      </div>
                      <Button asChild size="sm" variant="outline">
                        <Link to="/manager/$applicationId" params={{ applicationId: inv.id }}>
                          Review
                        </Link>
                      </Button>
                    </div>
                  </CardHeader>
                  <CardContent className="flex flex-wrap gap-1.5 pt-0">
                    <Badge variant={statusTone(inv.kyc_status)}>Identity {prettyStatus(inv.kyc_status)}</Badge>
                    <Badge variant={statusTone(inv.aml_status)}>AML {prettyStatus(inv.aml_status)}</Badge>
                    <Badge variant={statusTone(inv.accreditation_status)}>
                      Accreditation {prettyStatus(inv.accreditation_status)}
                    </Badge>
                    <Badge variant={statusTone(inv.documents_status)}>
                      Documents {prettyStatus(inv.documents_status)}
                    </Badge>
                    <Badge variant={statusTone(inv.funding_status)}>
                      Funding {prettyStatus(inv.funding_status)}
                    </Badge>
                  </CardContent>
                </Card>
              ))
            )}
          </div>

          {offeringId && <InvestorReviewBoard offeringId={offeringId} />}
          {offeringId && <FundOperations offeringId={offeringId} />}
        </>
      )}

    </main>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border p-4">
      <p className="text-xs uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="mt-1 text-2xl">{value}</p>
    </div>
  );
}
