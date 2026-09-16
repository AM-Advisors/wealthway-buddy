import { useMemo, useState } from "react";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";

import { supabase } from "@/integrations/supabase/client";
import {
  getComplianceEvidenceUrl,
  getFundInvestorCompliance,
} from "@/lib/fund-compliance.functions";
import {
  COMPLIANCE_DOC_KINDS,
  decideComplianceCheck,
  getInvestorComplianceDetail,
  recordFundUploadForInvestor,
} from "@/lib/kyc-aml.functions";
import { ComplianceTrail } from "@/components/compliance-trail";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

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

              <InvestorComplianceReview
                offeringId={offeringId}
                applicationId={inv.applicationId}
              />
            </CardContent>
          </Card>
        ))
      )}
    </div>
  );
}

const CHECKS = [
  { value: "kyc", label: "Identity" },
  { value: "aml", label: "Screening" },
  { value: "accreditation", label: "Accreditation" },
] as const;

function InvestorComplianceReview({
  offeringId,
  applicationId,
}: {
  offeringId: string;
  applicationId: string;
}) {
  const queryClient = useQueryClient();
  const loadDetail = useServerFn(getInvestorComplianceDetail);
  const decide = useServerFn(decideComplianceCheck);
  const recordUpload = useServerFn(recordFundUploadForInvestor);

  const [open, setOpen] = useState(false);
  const [checkKind, setCheckKind] = useState<string>("kyc");
  const [note, setNote] = useState("");
  const [docKind, setDocKind] = useState<string>(COMPLIANCE_DOC_KINDS[0].value);
  const [uploading, setUploading] = useState(false);

  const detailKey = ["fund-compliance-detail", offeringId, applicationId];
  const { data, isLoading } = useQuery({
    queryKey: detailKey,
    queryFn: () => loadDetail({ data: { offeringId, applicationId } }),
    enabled: open,
  });

  const decideMutation = useMutation({
    mutationFn: (decision: "approved" | "declined" | "info_requested") =>
      decide({ data: { offeringId, applicationId, checkKind: checkKind as never, decision, note } }),
    onSuccess: () => {
      setNote("");
      toast.success("Decision recorded.");
      queryClient.invalidateQueries({ queryKey: detailKey });
      queryClient.invalidateQueries({ queryKey: ["fund-compliance", offeringId] });
    },
    onError: (e: any) => toast.error(e?.message ?? "Could not record that decision."),
  });

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 25 * 1024 * 1024) {
      toast.error("Files must be 25 MB or smaller.");
      e.target.value = "";
      return;
    }
    const investorId = (data as any)?.application?.user_id as string | undefined;
    if (!investorId) {
      toast.error("Open the review panel again and retry.");
      return;
    }
    setUploading(true);
    try {
      const path = `${investorId}/${crypto.randomUUID()}-${file.name.replace(/[^\w.\-]/g, "_")}`;
      const { error } = await supabase.storage.from("investor-uploads").upload(path, file);
      if (error) throw new Error(error.message);
      await recordUpload({
        data: {
          offeringId,
          applicationId,
          storage_path: path,
          file_name: file.name,
          doc_kind: docKind as never,
          note: note || null,
        },
      });
      setNote("");
      toast.success("Document filed for this investor.");
      queryClient.invalidateQueries({ queryKey: detailKey });
      queryClient.invalidateQueries({ queryKey: ["fund-compliance", offeringId] });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Upload failed.");
    } finally {
      setUploading(false);
      e.target.value = "";
    }
  }

  if (!open) {
    return (
      <Button size="sm" variant="outline" onClick={() => setOpen(true)}>
        Review and record a decision
      </Button>
    );
  }

  return (
    <div className="space-y-4 rounded-md border p-3">
      <div className="flex items-center justify-between">
        <p className="text-sm font-medium">Review</p>
        <Button size="sm" variant="ghost" onClick={() => setOpen(false)}>
          Close
        </Button>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor={`check-${applicationId}`}>Which check</Label>
          <select
            id={`check-${applicationId}`}
            className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
            value={checkKind}
            onChange={(e) => setCheckKind(e.target.value)}
          >
            {CHECKS.map((c) => (
              <option key={c.value} value={c.value}>
                {c.label}
              </option>
            ))}
          </select>
        </div>
        <div className="space-y-2">
          <Label htmlFor={`doc-kind-${applicationId}`}>Document type (for uploads)</Label>
          <select
            id={`doc-kind-${applicationId}`}
            className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
            value={docKind}
            onChange={(e) => setDocKind(e.target.value)}
          >
            {COMPLIANCE_DOC_KINDS.map((k) => (
              <option key={k.value} value={k.value}>
                {k.label}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="space-y-2">
        <Label htmlFor={`note-${applicationId}`}>Note to the investor</Label>
        <Textarea
          id={`note-${applicationId}`}
          value={note}
          maxLength={1000}
          placeholder="Required when declining or asking for more information"
          onChange={(e) => setNote(e.target.value)}
        />
      </div>

      <div className="flex flex-wrap gap-2">
        <Button
          size="sm"
          disabled={decideMutation.isPending}
          onClick={() => decideMutation.mutate("approved")}
        >
          Approve
        </Button>
        <Button
          size="sm"
          variant="outline"
          disabled={decideMutation.isPending}
          onClick={() => decideMutation.mutate("info_requested")}
        >
          Request more information
        </Button>
        <Button
          size="sm"
          variant="destructive"
          disabled={decideMutation.isPending}
          onClick={() => decideMutation.mutate("declined")}
        >
          Decline
        </Button>
      </div>

      <div className="space-y-2">
        <Label htmlFor={`file-${applicationId}`}>Upload a document on their behalf</Label>
        <Input id={`file-${applicationId}`} type="file" disabled={uploading} onChange={onFile} />
        <p className="text-xs text-muted-foreground">
          Use this for paperwork the investor sent you directly. Up to 25 MB.
        </p>
      </div>

      <div>
        <p className="text-xs uppercase text-muted-foreground">Submission history</p>
        <div className="mt-2">
          {isLoading ? (
            <p className="text-sm text-muted-foreground">Loading history…</p>
          ) : (
            <ComplianceTrail rows={((data as any)?.trail ?? []) as any} />
          )}
        </div>
      </div>
    </div>
  );
}
