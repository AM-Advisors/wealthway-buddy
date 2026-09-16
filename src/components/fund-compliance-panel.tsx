import { useMemo, useState } from "react";

import { useMutation, useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";

import {
  getComplianceEvidenceUrl,
  getFundInvestorCompliance,
} from "@/lib/fund-compliance.functions";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";

type Filter = "all" | "outstanding" | "clear" | "expiring";

function statusTone(status: string) {
  if (status === "approved") return "default" as const;
  if (status === "declined") return "destructive" as const;
  if (status === "review" || status === "pending") return "secondary" as const;
  return "outline" as const;
}

function statusWord(status: string) {
  if (status === "approved") return "Approved";
  if (status === "declined") return "Declined";
  if (status === "review") return "In review";
  if (status === "pending") return "Pending";
  return "Not started";
}

function money(cents: number) {
  return (cents / 100).toLocaleString("en-US", { style: "currency", currency: "USD" });
}

function when(value: string | null) {
  if (!value) return "—";
  return new Date(value).toLocaleDateString("en-US", { dateStyle: "medium" });
}

export function FundCompliancePanel({ offeringId }: { offeringId: string }) {
  const load = useServerFn(getFundInvestorCompliance);
  const openEvidence = useServerFn(getComplianceEvidenceUrl);
  const [filter, setFilter] = useState<Filter>("all");
  const [search, setSearch] = useState("");

  const { data, isLoading, error } = useQuery({
    queryKey: ["fund-compliance", offeringId],
    queryFn: () => load({ data: { offeringId } }),
  });

  const openMutation = useMutation({
    mutationFn: (input: { source: "accreditation" | "upload"; id: string }) =>
      openEvidence({ data: { offeringId, ...input } }),
    onSuccess: (res: any) => window.open(res.url, "_blank", "noopener,noreferrer"),
    onError: (e: any) => toast.error(e?.message ?? "Could not open that file."),
  });

  const investors = ((data as any)?.investors ?? []) as any[];
  const counts = ((data as any)?.counts ?? {}) as any;
  const regType = ((data as any)?.offering?.reg_type ?? null) as string | null;

  const visible = useMemo(() => {
    const term = search.trim().toLowerCase();
    return investors.filter((inv) => {
      if (filter === "clear" && !inv.clear) return false;
      if (filter === "outstanding" && inv.clear) return false;
      if (filter === "expiring" && !inv.accreditation.expiringSoon) return false;
      if (!term) return true;
      return (
        String(inv.name).toLowerCase().includes(term) ||
        String(inv.email ?? "").toLowerCase().includes(term)
      );
    });
  }, [investors, filter, search]);

  if (isLoading) return <p className="text-sm text-muted-foreground">Loading investor checks…</p>;
  if (error) {
    return (
      <p className="text-sm text-destructive">
        {(error as any)?.message ?? "Could not load investor checks."}
      </p>
    );
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Investor checks</CardTitle>
          <CardDescription>
            Identity, anti-money-laundering and accredited-investor status for everyone in this
            fund, with the evidence they provided.
            {regType === "506c"
              ? " This fund is a 506(c) offering, so every investor needs verified evidence — a signed statement alone is not enough."
              : ""}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap gap-2 text-sm">
            <Badge variant="outline">{counts.total ?? 0} investors</Badge>
            <Badge variant="default">{counts.clear ?? 0} cleared</Badge>
            <Badge variant="secondary">{counts.outstanding ?? 0} outstanding</Badge>
            <Badge variant="outline">{counts.expiring ?? 0} expiring soon</Badge>
            {counts.amlMatches ? (
              <Badge variant="destructive">{counts.amlMatches} with screening hits</Badge>
            ) : null}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {(["all", "outstanding", "clear", "expiring"] as Filter[]).map((f) => (
              <Button
                key={f}
                size="sm"
                variant={filter === f ? "default" : "outline"}
                onClick={() => setFilter(f)}
              >
                {f === "all"
                  ? "Everyone"
                  : f === "outstanding"
                    ? "Outstanding"
                    : f === "clear"
                      ? "Cleared"
                      : "Expiring soon"}
              </Button>
            ))}
            <Input
              className="w-full sm:w-64"
              placeholder="Search by name or email"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
        </CardContent>
      </Card>

      {visible.length === 0 ? (
        <p className="text-sm text-muted-foreground">No investors match that view.</p>
      ) : (
        visible.map((inv) => (
          <Card key={inv.applicationId}>
            <CardHeader className="pb-3">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <CardTitle className="text-base">{inv.name}</CardTitle>
                  <CardDescription>
                    {inv.email ?? "No email on file"} · {money(inv.commitmentCents)} committed
                  </CardDescription>
                </div>
                <Badge variant={inv.clear ? "default" : "secondary"}>
                  {inv.clear ? "All checks cleared" : "Checks outstanding"}
                </Badge>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-3 sm:grid-cols-3">
                <div className="rounded-md border p-3">
                  <p className="text-xs uppercase text-muted-foreground">Identity</p>
                  <Badge className="mt-1" variant={statusTone(inv.kyc.status)}>
                    {statusWord(inv.kyc.status)}
                  </Badge>
                  <p className="mt-2 text-xs text-muted-foreground">
                    {inv.kyc.provider ? `${inv.kyc.provider} · ` : ""}
                    {when(inv.kyc.decidedAt)}
                  </p>
                </div>
                <div className="rounded-md border p-3">
                  <p className="text-xs uppercase text-muted-foreground">Screening</p>
                  <Badge className="mt-1" variant={statusTone(inv.aml.status)}>
                    {statusWord(inv.aml.status)}
                  </Badge>
                  <p className="mt-2 text-xs text-muted-foreground">
                    {inv.aml.matches > 0 ? `${inv.aml.matches} possible match(es) · ` : ""}
                    {when(inv.aml.decidedAt)}
                  </p>
                </div>
                <div className="rounded-md border p-3">
                  <p className="text-xs uppercase text-muted-foreground">Accreditation</p>
                  <Badge className="mt-1" variant={statusTone(inv.accreditation.status)}>
                    {statusWord(inv.accreditation.status)}
                  </Badge>
                  <p className="mt-2 text-xs text-muted-foreground">
                    {inv.accreditation.regType ? `${inv.accreditation.regType} · ` : ""}
                    {inv.accreditation.method
                      ? `${String(inv.accreditation.method).replace(/_/g, " ")} · `
                      : ""}
                    {when(inv.accreditation.decidedAt)}
                  </p>
                  {inv.accreditation.expiresAt ? (
                    <p
                      className={
                        inv.accreditation.expiringSoon
                          ? "mt-1 text-xs font-medium text-destructive"
                          : "mt-1 text-xs text-muted-foreground"
                      }
                    >
                      Valid until {when(inv.accreditation.expiresAt)}
                    </p>
                  ) : null}
                </div>
              </div>

              <div>
                <p className="text-xs uppercase text-muted-foreground">Evidence on file</p>
                {inv.evidence.length === 0 ? (
                  <p className="mt-1 text-sm text-muted-foreground">
                    Nothing uploaded for this investor yet.
                  </p>
                ) : (
                  <ul className="mt-2 divide-y rounded-md border">
                    {inv.evidence.map((ev: any) => (
                      <li
                        key={`${ev.source}:${ev.id}`}
                        className="flex flex-wrap items-center justify-between gap-2 p-2"
                      >
                        <div className="min-w-0">
                          <p className="truncate text-sm">{ev.fileName}</p>
                          <p className="text-xs text-muted-foreground">
                            {String(ev.kind).replace(/_/g, " ")} · {when(ev.uploadedAt)}
                          </p>
                        </div>
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={openMutation.isPending}
                          onClick={() =>
                            openMutation.mutate({ source: ev.source, id: ev.id })
                          }
                        >
                          Open
                        </Button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </CardContent>
          </Card>
        ))
      )}
    </div>
  );
}
