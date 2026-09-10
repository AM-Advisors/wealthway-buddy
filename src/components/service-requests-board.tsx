import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import {
  activateServiceRequest,
  declineServiceRequest,
  listServiceRequests,
  PRICING_MODELS,
  quoteServiceRequest,
  startServiceReview,
} from "@/lib/contracts.functions";

const STAGES: { value: string; label: string }[] = [
  { value: "requested", label: "Requested" },
  { value: "in_review", label: "In review" },
  { value: "quoted", label: "Quoted" },
  { value: "signed", label: "Signed" },
  { value: "activated", label: "Active" },
  { value: "declined", label: "Declined" },
  { value: "withdrawn", label: "Withdrawn" },
];

export function stageLabel(status: string) {
  return STAGES.find((s) => s.value === status)?.label ?? status.replace(/_/g, " ");
}

function stageTone(status: string): "default" | "secondary" | "outline" | "destructive" {
  if (status === "activated") return "default";
  if (status === "declined") return "destructive";
  if (status === "signed" || status === "quoted") return "secondary";
  return "outline";
}

function money(cents: number | null | undefined) {
  if (cents === null || cents === undefined) return "—";
  return `$${(cents / 100).toLocaleString("en-US")}`;
}

/** Harmonious queue for change-of-scope requests: review, quote, sign-off, activate. */
export function ServiceRequestsBoard({ clientId }: { clientId?: string }) {
  const queryClient = useQueryClient();
  const load = useServerFn(listServiceRequests);
  const review = useServerFn(startServiceReview);
  const quote = useServerFn(quoteServiceRequest);
  const decline = useServerFn(declineServiceRequest);
  const activate = useServerFn(activateServiceRequest);

  const { data, isLoading, error } = useQuery({
    queryKey: ["service-requests"],
    queryFn: () => load(),
    retry: false,
  });

  const [stage, setStage] = useState("open");
  const [clientFilter, setClientFilter] = useState("all");
  const [search, setSearch] = useState("");
  const [quoteDraft, setQuoteDraft] = useState<any | null>(null);
  const [declineDraft, setDeclineDraft] = useState<any | null>(null);
  const [declineReason, setDeclineReason] = useState("");
  const [activateDraft, setActivateDraft] = useState<any | null>(null);

  const refresh = () => queryClient.invalidateQueries({ queryKey: ["service-requests"] });
  const fail = (e: any) => toast.error(e?.message ?? "That didn't save.");

  const reviewMut = useMutation({
    mutationFn: (vars: { id: string; note: string }) => review({ data: vars }),
    onSuccess: () => {
      toast.success("Marked as in review.");
      refresh();
    },
    onError: fail,
  });
  const quoteMut = useMutation({
    mutationFn: (vars: any) => quote({ data: vars }),
    onSuccess: () => {
      toast.success("Fee proposed to the client.");
      setQuoteDraft(null);
      refresh();
    },
    onError: fail,
  });
  const declineMut = useMutation({
    mutationFn: (vars: { id: string; reason: string }) => decline({ data: vars }),
    onSuccess: () => {
      toast.success("Request declined.");
      setDeclineDraft(null);
      setDeclineReason("");
      refresh();
    },
    onError: fail,
  });
  const activateMut = useMutation({
    mutationFn: (vars: { id: string; sowId: string; effectiveDate?: string }) =>
      activate({ data: vars }),
    onSuccess: () => {
      toast.success("Service is now active in the client's scope.");
      setActivateDraft(null);
      refresh();
    },
    onError: fail,
  });

  const requests = useMemo(() => {
    let rows = data?.requests ?? [];
    if (clientId) rows = rows.filter((r: any) => r.client_id === clientId);
    if (stage === "open") rows = rows.filter((r: any) => !["activated", "declined", "withdrawn"].includes(r.status));
    else if (stage !== "all") rows = rows.filter((r: any) => r.status === stage);
    if (clientFilter !== "all") rows = rows.filter((r: any) => r.client_id === clientFilter);
    const q = search.trim().toLowerCase();
    if (q) {
      rows = rows.filter(
        (r: any) =>
          r.serviceName.toLowerCase().includes(q) ||
          r.clientName.toLowerCase().includes(q) ||
          (r.fundName ?? "").toLowerCase().includes(q),
      );
    }
    return rows;
  }, [data, clientId, stage, clientFilter, search]);

  if (isLoading) return <p className="text-sm text-muted-foreground">Loading requests…</p>;
  if (error || !data) {
    return (
      <p className="text-sm text-muted-foreground">
        {(error as any)?.message ?? "This area isn't available to you."}
      </p>
    );
  }

  const clients = Array.from(
    new Map((data.requests as any[]).map((r) => [r.client_id, r.clientName])).entries(),
  );

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-3">
        <Select value={stage} onValueChange={setStage}>
          <SelectTrigger className="w-44">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="open">Waiting on someone</SelectItem>
            <SelectItem value="all">Every stage</SelectItem>
            {STAGES.map((s) => (
              <SelectItem key={s.value} value={s.value}>
                {s.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {!clientId ? (
          <Select value={clientFilter} onValueChange={setClientFilter}>
            <SelectTrigger className="w-56">
              <SelectValue placeholder="All clients" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All clients</SelectItem>
              {clients.map(([id, name]) => (
                <SelectItem key={id as string} value={id as string}>
                  {name as string}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        ) : null}
        <Input
          className="w-64"
          placeholder="Search service, client or fund"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      {requests.length === 0 ? (
        <p className="text-sm text-muted-foreground">Nothing here. Requests appear the moment a client asks for an additional service.</p>
      ) : (
        <div className="space-y-3">
          {requests.map((r: any) => (
            <Card key={r.id}>
              <CardHeader className="pb-2">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <CardTitle className="text-base">{r.serviceName}</CardTitle>
                    <CardDescription>
                      {r.clientName}
                      {r.fundName ? ` · ${r.fundName}` : ""} · asked{" "}
                      {new Date(r.created_at).toLocaleDateString("en-US")}
                      {r.requesterName ? ` by ${r.requesterName}` : ""}
                    </CardDescription>
                  </div>
                  <Badge variant={stageTone(r.status)}>{stageLabel(r.status)}</Badge>
                </div>
              </CardHeader>
              <CardContent className="space-y-3">
                {r.requester_note ? (
                  <p className="rounded-md bg-muted p-3 text-sm">“{r.requester_note}”</p>
                ) : null}
                {r.proposed_fee_cents !== null && r.proposed_fee_cents !== undefined ? (
                  <p className="text-sm">
                    Proposed fee: <span className="font-medium">{money(r.proposed_fee_cents)}</span>
                    {r.proposed_pricing_model
                      ? ` (${PRICING_MODELS.find((m) => m.value === r.proposed_pricing_model)?.label ?? r.proposed_pricing_model})`
                      : ""}
                    {r.effective_date ? ` · starts ${r.effective_date}` : ""}
                  </p>
                ) : null}
                {r.status === "signed" && r.signer_name ? (
                  <p className="text-sm">
                    Signed by {r.signer_name}
                    {r.signer_title ? `, ${r.signer_title}` : ""} on{" "}
                    {r.client_approved_at
                      ? new Date(r.client_approved_at).toLocaleDateString("en-US")
                      : "—"}
                    .
                  </p>
                ) : null}
                {r.status === "declined" && r.declined_reason ? (
                  <p className="text-sm text-muted-foreground">Declined: {r.declined_reason}</p>
                ) : null}
                {r.status === "activated" ? (
                  <p className="text-sm text-muted-foreground">
                    Active since {r.activated_at ? new Date(r.activated_at).toLocaleDateString("en-US") : r.effective_date}.
                  </p>
                ) : null}

                {data.canManage ? (
                  <div className="flex flex-wrap gap-2">
                    {r.status === "requested" ? (
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={reviewMut.isPending}
                        onClick={() => reviewMut.mutate({ id: r.id, note: "" })}
                      >
                        Start review
                      </Button>
                    ) : null}
                    {["requested", "in_review", "quoted"].includes(r.status) ? (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() =>
                          setQuoteDraft({
                            id: r.id,
                            serviceName: r.serviceName,
                            fee: r.proposed_fee_cents != null ? String(r.proposed_fee_cents / 100) : r.suggested?.amount_cents != null ? String(r.suggested.amount_cents / 100) : "",
                            pricingModel: r.proposed_pricing_model ?? r.suggested?.pricing_model ?? "one_time",
                            sowId: r.sow_id ?? "",
                            effectiveDate: r.effective_date ?? "",
                            amendmentTerms: r.amendment_terms ?? "",
                            note: "",
                          })
                        }
                      >
                        {r.status === "quoted" ? "Revise fee" : "Propose fee"}
                      </Button>
                    ) : null}
                    {r.status === "signed" ? (
                      <Button size="sm" onClick={() => setActivateDraft({ id: r.id, serviceName: r.serviceName, sowId: r.sow_id ?? "", effectiveDate: r.effective_date ?? "" })}>
                        Activate service
                      </Button>
                    ) : null}
                    {!["activated", "declined", "withdrawn"].includes(r.status) ? (
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => {
                          setDeclineDraft(r);
                          setDeclineReason("");
                        }}
                      >
                        Decline
                      </Button>
                    ) : null}
                  </div>
                ) : null}
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {quoteDraft ? (
        <Card className="border-primary">
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Propose a fee — {quoteDraft.serviceName}</CardTitle>
            <CardDescription>
              The client sees exactly this, signs it in writing, and only then can it be activated.
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-3 md:grid-cols-2">
            <div>
              <Label>Fee (USD)</Label>
              <Input
                inputMode="decimal"
                value={quoteDraft.fee}
                onChange={(e) => setQuoteDraft({ ...quoteDraft, fee: e.target.value })}
                placeholder="2500"
              />
            </div>
            <div>
              <Label>Pricing basis</Label>
              <Select
                value={quoteDraft.pricingModel}
                onValueChange={(v) => setQuoteDraft({ ...quoteDraft, pricingModel: v })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {PRICING_MODELS.map((m) => (
                    <SelectItem key={m.value} value={m.value}>
                      {m.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Amends which statement of work</Label>
              <Select
                value={quoteDraft.sowId || "none"}
                onValueChange={(v) => setQuoteDraft({ ...quoteDraft, sowId: v === "none" ? "" : v })}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Choose" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Decide at activation</SelectItem>
                  {(data.sows as any[]).map((s) => (
                    <SelectItem key={s.id} value={s.id}>
                      {s.title}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Start date</Label>
              <Input
                type="date"
                value={quoteDraft.effectiveDate}
                onChange={(e) => setQuoteDraft({ ...quoteDraft, effectiveDate: e.target.value })}
              />
            </div>
            <div className="md:col-span-2">
              <Label>Amendment terms the client will sign</Label>
              <Textarea
                rows={4}
                value={quoteDraft.amendmentTerms}
                onChange={(e) => setQuoteDraft({ ...quoteDraft, amendmentTerms: e.target.value })}
                placeholder="Harmonious will prepare and submit Form D and state Blue Sky notice filings for the Fund from information the Client supplies, for the fee above. Filings are submitted under the Client's direction; the Client and its counsel remain responsible for their content and timeliness."
              />
            </div>
            <div className="md:col-span-2">
              <Label>Note to the client (optional)</Label>
              <Input
                value={quoteDraft.note}
                onChange={(e) => setQuoteDraft({ ...quoteDraft, note: e.target.value })}
              />
            </div>
            <div className="flex gap-2 md:col-span-2">
              <Button
                disabled={quoteMut.isPending || !quoteDraft.fee}
                onClick={() =>
                  quoteMut.mutate({
                    id: quoteDraft.id,
                    feeCents: Math.round(Number(quoteDraft.fee) * 100),
                    pricingModel: quoteDraft.pricingModel,
                    sowId: quoteDraft.sowId || null,
                    effectiveDate: quoteDraft.effectiveDate,
                    amendmentTerms: quoteDraft.amendmentTerms,
                    note: quoteDraft.note,
                  })
                }
              >
                Send fee proposal
              </Button>
              <Button variant="ghost" onClick={() => setQuoteDraft(null)}>
                Cancel
              </Button>
            </div>
          </CardContent>
        </Card>
      ) : null}

      {declineDraft ? (
        <Card className="border-destructive">
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Decline — {declineDraft.serviceName}</CardTitle>
            <CardDescription>The client sees this reason.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <Textarea
              rows={3}
              value={declineReason}
              onChange={(e) => setDeclineReason(e.target.value)}
              placeholder="Why Harmonious can't take this on."
            />
            <div className="flex gap-2">
              <Button
                variant="destructive"
                disabled={declineMut.isPending || declineReason.trim().length < 2}
                onClick={() => declineMut.mutate({ id: declineDraft.id, reason: declineReason.trim() })}
              >
                Decline request
              </Button>
              <Button variant="ghost" onClick={() => setDeclineDraft(null)}>
                Cancel
              </Button>
            </div>
          </CardContent>
        </Card>
      ) : null}

      {activateDraft ? (
        <Card className="border-primary">
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Activate — {activateDraft.serviceName}</CardTitle>
            <CardDescription>
              The client has signed. Attach the statement of work this amendment belongs to and pick
              the start date.
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-3 md:grid-cols-2">
            <div>
              <Label>Statement of work</Label>
              <Select
                value={activateDraft.sowId || "none"}
                onValueChange={(v) => setActivateDraft({ ...activateDraft, sowId: v === "none" ? "" : v })}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Required" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Choose…</SelectItem>
                  {(data.sows as any[]).map((s) => (
                    <SelectItem key={s.id} value={s.id}>
                      {s.title}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Start date</Label>
              <Input
                type="date"
                value={activateDraft.effectiveDate}
                onChange={(e) => setActivateDraft({ ...activateDraft, effectiveDate: e.target.value })}
              />
            </div>
            <div className="flex gap-2 md:col-span-2">
              <Button
                disabled={activateMut.isPending || !activateDraft.sowId}
                onClick={() =>
                  activateMut.mutate({
                    id: activateDraft.id,
                    sowId: activateDraft.sowId,
                    effectiveDate: activateDraft.effectiveDate || undefined,
                  })
                }
              >
                Activate service
              </Button>
              <Button variant="ghost" onClick={() => setActivateDraft(null)}>
                Cancel
              </Button>
            </div>
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}
