import { FundAgreementGate } from "@/components/fund-agreement-gate";
import { FundProvidersPanel } from "@/components/fund-providers-panel";
import { useEffect, useMemo, useState } from "react";

import { Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";

import { supabase } from "@/integrations/supabase/client";
import { getManagerFundHome } from "@/lib/manager-fund.functions";
import { money, prettyStatus, statusTone } from "@/lib/status";
import { regTypeLabel } from "@/lib/reg-types";
import { FundComplianceCard } from "@/components/fund-compliance-card";
import { FundAgreementCard } from "@/components/fund-agreement-card";
import {
  ScopeSection,
  ScopeServicesPanel,
  ScopeSummary,
} from "@/components/fund-scope-section";
import { FundReadinessPanel } from "@/components/fund-readiness-panel";
import { SETUP_STEP_SECTIONS, sectionState, useFundScope } from "@/lib/fund-scope";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

const STAGES = [
  { value: "all", label: "Every stage" },
  { value: "identity", label: "Identity and screening" },
  { value: "accreditation", label: "Accreditation" },
  { value: "documents", label: "Documents" },
  { value: "funding", label: "Funding" },
  { value: "complete", label: "Complete" },
] as const;

const STAGE_LABEL: Record<string, string> = {
  identity: "Identity and screening",
  accreditation: "Accreditation",
  documents: "Documents",
  funding: "Funding",
  complete: "Complete",
};

function when(value?: string | null) {
  if (!value) return "—";
  return new Date(value).toLocaleString();
}

function day(value?: string | null) {
  if (!value) return "—";
  return new Date(value).toLocaleDateString("en-US", { dateStyle: "medium" });
}

export function ManagerFundHome({ offeringId }: { offeringId: string }) {
  const load = useServerFn(getManagerFundHome);
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [stage, setStage] = useState<string>("all");
  const scope = useFundScope(offeringId);

  const query = useQuery({
    queryKey: ["manager-fund-home", offeringId],
    queryFn: () => load({ data: { offeringId } }),
    refetchInterval: 60_000,
  });

  useEffect(() => {
    const channel = supabase
      .channel(`manager-fund-home-${offeringId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "document_signatures" }, () => {
        queryClient.invalidateQueries({ queryKey: ["manager-fund-home", offeringId] });
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "wire_confirmations" }, () => {
        queryClient.invalidateQueries({ queryKey: ["manager-fund-home", offeringId] });
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "payments" }, () => {
        queryClient.invalidateQueries({ queryKey: ["manager-fund-home", offeringId] });
      })
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "investor_applications",
          filter: `offering_id=eq.${offeringId}`,
        },
        () => {
          queryClient.invalidateQueries({ queryKey: ["manager-fund-home", offeringId] });
        },
      )
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [offeringId, queryClient]);

  const data = query.data;

  const rows = useMemo(() => {
    if (!data) return [];
    const term = search.trim().toLowerCase();
    return data.applications.filter((row: any) => {
      if (stage !== "all" && row.stage !== stage) return false;
      if (!term) return true;
      return (
        String(row.name).toLowerCase().includes(term) ||
        String(row.email ?? "").toLowerCase().includes(term)
      );
    });
  }, [data, search, stage]);

  if (query.isLoading) {
    return (
      <main className="mx-auto max-w-6xl px-4 py-10">
        <p className="text-sm text-muted-foreground">Loading this fund…</p>
      </main>
    );
  }

  if (query.isError || !data) {
    return (
      <main className="mx-auto max-w-3xl px-4 py-16 text-center">
        <h1 className="text-2xl">This fund isn't available to you</h1>
        <p className="mt-3 text-sm text-muted-foreground">
          {(query.error as any)?.message ??
            "Ask a Harmonious administrator to assign you to this fund."}
        </p>
        <Button asChild variant="outline" className="mt-6">
          <Link to="/manager">Back to your panel</Link>
        </Button>
      </main>
    );
  }

  const { fund, progress, documents, counts, totals } = data;
  const percent = Math.round((progress.done / progress.total) * 100);
  const roomCategories = [
    ...new Set(documents.room.map((d: any) => String(d.category ?? "Other"))),
  ];

  return (
    <main className="mx-auto max-w-6xl px-4 py-10">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs uppercase tracking-wide text-muted-foreground">Fund</p>
          <h1 className="mt-1 text-3xl">{fund.name}</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            {regTypeLabel(fund.regType)} ·{" "}
            {fund.isOpen ? "Open" : "Closed"}
            {fund.legalEntityName ? ` · ${fund.legalEntityName}` : ""}
            {fund.entityType ? ` · ${fund.entityType}` : ""}
          </p>
        </div>
        <Button asChild variant="outline" size="sm">
          <Link to="/manager">Back to your panel</Link>
        </Button>
      </div>

      <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="Committed" value={money(totals.committedCents)} />
        <Stat label="In transit" value={money(totals.inTransitCents)} />
        <Stat label="Received" value={money(totals.receivedCents)} />
        <Stat
          label="Target raise"
          value={totals.targetRaiseCents ? money(totals.targetRaiseCents) : "Not set"}
        />
      </div>

      <div className="mt-6 space-y-4">
        <FundAgreementGate fundId={offeringId} />
        <ScopeSummary scope={scope} />
        <ScopeServicesPanel scope={scope} offeringId={offeringId} />
        <FundReadinessPanel offeringId={offeringId} />
        <FundProvidersPanel scope={scope} />
      </div>

      <Card className="mt-8">
        <CardHeader>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <CardTitle className="text-base">Setup progress</CardTitle>
              <CardDescription>
                {progress.done} of {progress.total} steps done.
              </CardDescription>
            </div>
            <Badge variant={percent === 100 ? "default" : "secondary"}>{percent}% complete</Badge>
          </div>
          <div className="mt-3 h-2 w-full overflow-hidden rounded-full bg-muted">
            <div className="h-full rounded-full bg-primary" style={{ width: `${percent}%` }} />
          </div>
        </CardHeader>
        <CardContent className="space-y-2">
          {progress.steps.map((step: any) => {
            const section = SETUP_STEP_SECTIONS[step.key as string];
            const state = section ? sectionState(scope, section) : "open";
            const blocked = state === "blocked";
            return (
              <div
                key={step.key}
                className="flex flex-wrap items-center justify-between gap-3 rounded-lg border p-3"
              >
                <div className="min-w-0">
                  <p className="text-sm">
                    {step.done ? "✓ " : "• "}
                    {step.label}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {blocked
                      ? "This service is not currently included in your active scope."
                      : step.detail}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  {blocked ? <Badge variant="outline">Not in scope</Badge> : null}
                  {state === "unknown" ? (
                    <Badge variant="outline">Scope not recorded</Badge>
                  ) : null}
                  {!blocked ? (
                    <>
                      <Badge variant={step.done ? "default" : "outline"}>
                        {step.done ? "Done" : "To do"}
                      </Badge>
                      <Button asChild size="sm" variant="outline">
                        <Link to={step.href}>{step.done ? "Review" : "Finish"}</Link>
                      </Button>
                    </>
                  ) : null}
                </div>
              </div>
            );
          })}
        </CardContent>
      </Card>

      <div className="mt-6">
      <ScopeSection scope={scope} section="banking" offeringId={offeringId} label="Banking">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Banking</CardTitle>
            <CardDescription>
              Enter your fund's receiving account details, or apply for an account through the
              portal.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button asChild size="sm">
              <Link to="/manager/fund-banking/$fundId" params={{ fundId: offeringId }}>
                Open fund banking
              </Link>
            </Button>
          </CardContent>
        </Card>
      </ScopeSection>
      </div>

      <div className="mt-6">
      <ScopeSection scope={scope} section="documents" offeringId={offeringId} label="Fund documents">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Documents investors sign</CardTitle>
          <CardDescription>
            {documents.fund.length} document{documents.fund.length === 1 ? "" : "s"} in this fund.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {documents.fund.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No documents yet.{" "}
              <Link className="underline" to="/manager/documents">
                Add the first one
              </Link>
              .
            </p>
          ) : (
            documents.fund.map((doc: any) => (
              <div
                key={doc.id}
                className="flex flex-wrap items-center justify-between gap-3 rounded-lg border p-3"
              >
                <div className="min-w-0">
                  <p className="text-sm">{doc.title}</p>
                  <p className="text-xs text-muted-foreground">
                    {prettyStatus(doc.docType)} · version {doc.version} · updated{" "}
                    {day(doc.updatedAt)}
                    {doc.fileName ? ` · ${doc.fileName}` : ""}
                    {doc.templatePack ? ` · ${doc.templatePack}` : ""}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  {doc.requiresSignature ? (
                    <Badge variant="secondary">{doc.signedCount} signed</Badge>
                  ) : (
                    <Badge variant="outline">Reference</Badge>
                  )}
                  <Button asChild size="sm" variant="outline">
                    <Link to="/manager/documents">Edit</Link>
                  </Button>
                </div>
              </div>
            ))
          )}
        </CardContent>
      </Card>

      </ScopeSection>
      </div>

      <div className="mt-6">
      <ScopeSection scope={scope} section="diligence" offeringId={offeringId} label="Diligence room">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Diligence room materials</CardTitle>
          <CardDescription>
            {documents.room.length} file{documents.room.length === 1 ? "" : "s"} across{" "}
            {roomCategories.length} section{roomCategories.length === 1 ? "" : "s"}.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {documents.room.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Nothing uploaded yet.{" "}
              <Link className="underline" to="/manager/diligence">
                Open the diligence room
              </Link>
              .
            </p>
          ) : (
            roomCategories.map((category) => (
              <div key={category as string}>
                <p className="text-xs uppercase tracking-wide text-muted-foreground">
                  {category as string}
                </p>
                <div className="mt-2 space-y-2">
                  {documents.room
                    .filter((d: any) => String(d.category ?? "Other") === category)
                    .map((doc: any) => (
                      <div
                        key={doc.id}
                        className="flex flex-wrap items-center justify-between gap-2 rounded-lg border p-3"
                      >
                        <div className="min-w-0">
                          <p className="text-sm">{doc.title}</p>
                          <p className="text-xs text-muted-foreground">
                            version {doc.version} · added {day(doc.uploadedAt)}
                          </p>
                        </div>
                        <Badge variant={doc.visibility === "all" ? "outline" : "secondary"}>
                          {doc.visibility === "all" ? "Everyone" : "Chosen investors"}
                        </Badge>
                      </div>
                    ))}
                </div>
              </div>
            ))
          )}
          <Button asChild size="sm" variant="outline">
            <Link to="/manager/diligence">Manage room materials</Link>
          </Button>
        </CardContent>
      </Card>

      </ScopeSection>
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <ScopeSection
          scope={scope}
          section="signed_documents"
          offeringId={offeringId}
          label="Signed documents"
        >
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Signed copies filed back</CardTitle>
            <CardDescription>The most recent signatures in this fund.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            {documents.signedCopies.length === 0 ? (
              <p className="text-sm text-muted-foreground">Nothing signed yet.</p>
            ) : (
              documents.signedCopies.map((s: any) => (
                <div key={s.id} className="rounded-lg border p-3">
                  <p className="text-sm">{s.documentTitle}</p>
                  <p className="text-xs text-muted-foreground">
                    signed {when(s.signedAt)}
                    {s.filedAt ? ` · filed ${when(s.filedAt)}` : " · not filed yet"}
                  </p>
                </div>
              ))
            )}
          </CardContent>
        </Card>

        </ScopeSection>

        <ScopeSection scope={scope} section="tax" offeringId={offeringId} label="Tax documents">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Tax documents</CardTitle>
            <CardDescription>Approved by the operations team for this fund.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            {documents.tax.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                No approved tax documents for this fund yet.
              </p>
            ) : (
              documents.tax.map((t: any) => (
                <div key={t.id} className="rounded-lg border p-3">
                  <p className="text-sm">
                    {t.docType.toUpperCase()}
                    {t.taxYear ? ` · ${t.taxYear}` : ""}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {t.fileName ?? "Document"} · approved {day(t.reviewedAt)}
                  </p>
                </div>
              ))
            )}
          </CardContent>
        </Card>
        </ScopeSection>
      </div>


      <div className="mt-6">
      <ScopeSection
        scope={scope}
        section="applications"
        offeringId={offeringId}
        label="Investor onboarding"
      >
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Investor applications</CardTitle>
          <CardDescription>
            {counts.total} in this fund · {counts.identity} in identity · {counts.accreditation} in
            accreditation · {counts.documents} in documents · {counts.funding} funding ·{" "}
            {counts.complete} complete.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <Input
              placeholder="Search by name or email"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
            <Select value={stage} onValueChange={setStage}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {STAGES.map((s) => (
                  <SelectItem key={s.value} value={s.value}>
                    {s.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {rows.length === 0 ? (
            <p className="text-sm text-muted-foreground">No investors match that.</p>
          ) : (
            rows.map((row: any) => (
              <div
                key={row.applicationId}
                className="flex flex-wrap items-center justify-between gap-3 rounded-lg border p-3"
              >
                <div className="min-w-0">
                  <p className="text-sm">
                    {row.name} · {money(row.commitmentCents)}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {prettyStatus(row.accountLabel)} · {row.signedCount} of {row.requiredSignatures}{" "}
                    signed
                    {row.wireStatus ? ` · wire ${prettyStatus(row.wireStatus)}` : ""}
                    {row.receivedCents ? ` · ${money(row.receivedCents)} received` : ""} · updated{" "}
                    {when(row.updatedAt)}
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <Badge variant={row.stage === "complete" ? "default" : "secondary"}>
                    {STAGE_LABEL[row.stage] ?? prettyStatus(row.stage)}
                  </Badge>
                  <Badge variant={statusTone(row.managerReviewStatus)}>
                    {prettyStatus(row.managerReviewStatus)}
                  </Badge>
                  <Button asChild size="sm" variant="outline">
                    <Link
                      to="/manager/$applicationId"
                      params={{ applicationId: row.applicationId }}
                    >
                      Open
                    </Link>
                  </Button>
                </div>
              </div>
            ))
          )}
        </CardContent>
      </Card>
      </ScopeSection>
      </div>

      <FundComplianceCard offeringId={offeringId} />

      <div className="mt-8">
        <FundAgreementCard offeringId={offeringId} />
      </div>

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
