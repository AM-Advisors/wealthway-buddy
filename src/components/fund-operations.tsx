import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import {
  getFundOperations,
  raiseApplicationFlag,
  resolveApplicationFlag,
} from "@/lib/manager.functions";
import { money, prettyStatus, statusTone } from "@/lib/status";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

const CATEGORIES = [
  { value: "identity", label: "Identity / AML delay" },
  { value: "accreditation", label: "Accreditation issue" },
  { value: "documents", label: "Document not signed" },
  { value: "funding", label: "Funding delay" },
  { value: "other", label: "Other" },
] as const;

function when(value?: string | null) {
  if (!value) return "—";
  return new Date(value).toLocaleString();
}

export function FundOperations({ offeringId }: { offeringId: string }) {
  const load = useServerFn(getFundOperations);
  const raise = useServerFn(raiseApplicationFlag);
  const resolve = useServerFn(resolveApplicationFlag);
  const queryClient = useQueryClient();

  const opsQuery = useQuery({
    queryKey: ["fund-operations", offeringId],
    queryFn: () => load({ data: { offeringId } }),
    refetchInterval: 30_000,
  });

  // Live updates: the moment an investor signs, wires or moves stage, refresh this fund.
  useEffect(() => {
    const channel = supabase
      .channel(`fund-ops-${offeringId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "document_signatures" }, () => {
        queryClient.invalidateQueries({ queryKey: ["fund-operations", offeringId] });
        queryClient.invalidateQueries({ queryKey: ["fund-overview", offeringId] });
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "wire_confirmations" }, () => {
        queryClient.invalidateQueries({ queryKey: ["fund-operations", offeringId] });
      })
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "investor_applications", filter: `offering_id=eq.${offeringId}` },
        () => {
          queryClient.invalidateQueries({ queryKey: ["fund-operations", offeringId] });
          queryClient.invalidateQueries({ queryKey: ["fund-overview", offeringId] });
        },
      )
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [offeringId, queryClient]);


  const [applicationId, setApplicationId] = useState("");
  const [category, setCategory] = useState<string>("funding");
  const [severity, setSeverity] = useState<string>("normal");
  const [note, setNote] = useState("");

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ["fund-operations", offeringId] });

  const raiseMutation = useMutation({
    mutationFn: () =>
      raise({
        data: {
          applicationId,
          offeringId,
          category: category as any,
          severity: severity as any,
          note: note.trim(),
        },
      }),
    onSuccess: () => {
      setNote("");
      toast.success("Issue flagged");
      invalidate();
    },
    onError: (e: any) => toast.error(e?.message ?? "Could not save that flag."),
  });

  const resolveMutation = useMutation({
    mutationFn: (flagId: string) => resolve({ data: { flagId } }),
    onSuccess: () => {
      toast.success("Flag resolved");
      invalidate();
    },
    onError: (e: any) => toast.error(e?.message ?? "Could not resolve that flag."),
  });

  if (opsQuery.isLoading) {
    return <p className="mt-6 text-sm text-muted-foreground">Loading fund activity…</p>;
  }
  if (opsQuery.isError || !opsQuery.data) {
    return <p className="mt-6 text-sm text-muted-foreground">Fund activity is unavailable right now.</p>;
  }

  const data = opsQuery.data;
  const openFlags = data.flags.filter((f: any) => f.status === "open");
  const resolvedFlags = data.flags.filter((f: any) => f.status !== "open");
  const behind = data.documentProgress.filter((d: any) => d.outstanding.length > 0);

  return (
    <div className="mt-10 space-y-6">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="Documents outstanding" value={String(behind.length)} />
        <Stat label="Wires awaiting review" value={String(data.pendingWireCount)} />
        <Stat label="Funds received" value={money(data.funding.settledCents)} />
        <Stat label="Open issues" value={String(openFlags.length)} />
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Document signing</CardTitle>
          <CardDescription>
            {data.requiredDocCount} document{data.requiredDocCount === 1 ? "" : "s"} require a signature in this
            fund.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {data.documentProgress.length === 0 ? (
            <p className="text-sm text-muted-foreground">No investors in this fund yet.</p>
          ) : (
            data.documentProgress.map((row: any) => (
              <div
                key={row.applicationId}
                className="flex flex-wrap items-center justify-between gap-3 rounded-lg border p-3"
              >
                <div className="min-w-0">
                  <p className="text-sm">{row.name}</p>
                  <p className="text-xs text-muted-foreground">
                    {row.signedCount} of {row.requiredCount} signed
                    {row.outstanding.length > 0 ? ` · waiting on ${row.outstanding.join(", ")}` : ""}
                    {row.lastSignedAt ? ` · last signed ${when(row.lastSignedAt)}` : ""}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <Badge variant={row.outstanding.length === 0 ? "default" : "secondary"}>
                    {row.outstanding.length === 0 ? "Complete" : "Outstanding"}
                  </Badge>
                  <Button asChild size="sm" variant="outline">
                    <Link to="/manager/$applicationId" params={{ applicationId: row.applicationId }}>
                      Open
                    </Link>
                  </Button>
                </div>
              </div>
            ))
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Wire confirmations</CardTitle>
          <CardDescription>What investors have reported sending, and where each one stands.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {data.wireConfirmations.length === 0 ? (
            <p className="text-sm text-muted-foreground">No wire confirmations submitted yet.</p>
          ) : (
            data.wireConfirmations.map((w: any) => (
              <div key={w.id} className="rounded-lg border p-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="text-sm">
                    {w.investor.name} · {money(w.amount_cents)}
                  </p>
                  <Badge variant={statusTone(w.status)}>{prettyStatus(w.status)}</Badge>
                </div>
                <p className="mt-1 text-xs text-muted-foreground">
                  Sent {w.sent_on} from {w.sending_bank_name} ····{w.sending_account_last4}
                  {w.bank_reference ? ` · ref ${w.bank_reference}` : ""}
                  {w.reviewed_at ? ` · reviewed ${when(w.reviewed_at)}` : " · awaiting review"}
                </p>
                {w.investor_note ? (
                  <p className="mt-1 text-xs text-muted-foreground">Investor note: {w.investor_note}</p>
                ) : null}
                {w.review_notes ? (
                  <p className="mt-1 text-xs text-muted-foreground">Review note: {w.review_notes}</p>
                ) : null}
              </div>
            ))
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Funding status</CardTitle>
          <CardDescription>
            {money(data.funding.pendingCents)} in flight · {money(data.funding.settledCents)} received ·{" "}
            {data.funding.failed} failed or returned.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {data.payments.length === 0 ? (
            <p className="text-sm text-muted-foreground">No funding started in this fund yet.</p>
          ) : (
            data.payments.map((p: any) => (
              <div
                key={p.id}
                className="flex flex-wrap items-center justify-between gap-3 rounded-lg border p-3"
              >
                <div className="min-w-0">
                  <p className="text-sm">
                    {p.investor.name} · {money(p.amount_cents)} by {p.method}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {p.reference_code ? `Reference ${p.reference_code} · ` : ""}
                    {p.expected_date ? `expected ${p.expected_date} · ` : ""}
                    {p.confirmed_at ? `confirmed ${when(p.confirmed_at)}` : "not confirmed"}
                  </p>
                </div>
                <Badge variant={statusTone(p.status)}>{prettyStatus(p.status)}</Badge>
              </div>
            ))
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Delays and issues</CardTitle>
          <CardDescription>
            Flag anything holding an investor up so the rest of the team can see it.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-3">
            <Select value={applicationId} onValueChange={setApplicationId}>
              <SelectTrigger>
                <SelectValue placeholder="Choose investor" />
              </SelectTrigger>
              <SelectContent>
                {data.applications.map((a: any) => (
                  <SelectItem key={a.applicationId} value={a.applicationId}>
                    {a.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={category} onValueChange={setCategory}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {CATEGORIES.map((c) => (
                  <SelectItem key={c.value} value={c.value}>
                    {c.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={severity} onValueChange={setSeverity}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="normal">Needs attention</SelectItem>
                <SelectItem value="urgent">Urgent</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <Textarea
            placeholder="What is holding this investor up?"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            rows={3}
          />
          <Button
            size="sm"
            disabled={!applicationId || note.trim().length < 3 || raiseMutation.isPending}
            onClick={() => raiseMutation.mutate()}
          >
            {raiseMutation.isPending ? "Saving…" : "Flag this issue"}
          </Button>

          <div className="space-y-3 pt-2">
            {openFlags.length === 0 ? (
              <p className="text-sm text-muted-foreground">No open issues in this fund.</p>
            ) : (
              openFlags.map((f: any) => (
                <div key={f.id} className="rounded-lg border p-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="text-sm">
                      {f.investor.name} · {prettyStatus(f.category)}
                    </p>
                    <div className="flex items-center gap-2">
                      <Badge variant={f.severity === "urgent" ? "destructive" : "secondary"}>
                        {f.severity === "urgent" ? "Urgent" : "Needs attention"}
                      </Badge>
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={resolveMutation.isPending}
                        onClick={() => resolveMutation.mutate(f.id)}
                      >
                        Resolve
                      </Button>
                    </div>
                  </div>
                  <p className="mt-1 text-sm">{f.note}</p>
                  <p className="mt-1 text-xs text-muted-foreground">Raised {when(f.created_at)}</p>
                </div>
              ))
            )}
            {resolvedFlags.length > 0 && (
              <details className="rounded-lg border p-3">
                <summary className="cursor-pointer text-sm">
                  Resolved issues ({resolvedFlags.length})
                </summary>
                <div className="mt-3 space-y-2">
                  {resolvedFlags.map((f: any) => (
                    <div key={f.id} className="text-xs text-muted-foreground">
                      {f.investor.name} · {prettyStatus(f.category)} · {f.note} · resolved {when(f.resolved_at)}
                    </div>
                  ))}
                </div>
              </details>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
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
