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
import { ServiceRequestsBoard, stageLabel } from "@/components/service-requests-board";
import {
  getServiceCatalog,
  listClients,
  listServiceRequests,
  PRICING_MODELS,
  proposeRateToClient,
} from "@/lib/contracts.functions";
import { getServiceRateSuggestion } from "@/lib/fund-fees.functions";

function money(cents: number | null | undefined) {
  if (cents === null || cents === undefined) return "—";
  return `$${(cents / 100).toLocaleString("en-US")}`;
}

const NEXT_STEP: Record<string, string> = {
  quoted: "Waiting on the client to approve and sign it.",
  signed: "Approved by the client — switch it on from the queue below to make it billable.",
  activated: "Active and on the client's rates, so it can be invoiced.",
  declined: "Declined.",
  withdrawn: "Withdrawn.",
  requested: "Sitting with Harmonious.",
  in_review: "Being scoped by Harmonious.",
};

/** Harmonious puts a fee in front of a client, the client approves it, then it can be invoiced. */
export function RateProposalBoard() {
  const queryClient = useQueryClient();
  const loadClients = useServerFn(listClients);
  const loadCatalog = useServerFn(getServiceCatalog);
  const loadRequests = useServerFn(listServiceRequests);
  const propose = useServerFn(proposeRateToClient);
  const suggestRate = useServerFn(getServiceRateSuggestion);

  const clients = useQuery({ queryKey: ["contract-clients"], queryFn: () => loadClients(), retry: false });
  const catalog = useQuery({ queryKey: ["service-catalog"], queryFn: () => loadCatalog(), retry: false });
  const requests = useQuery({
    queryKey: ["service-requests"],
    queryFn: () => loadRequests(),
    retry: false,
  });

  const [clientId, setClientId] = useState("");
  const [offeringId, setOfferingId] = useState("none");
  const [serviceKey, setServiceKey] = useState("");
  const [sowId, setSowId] = useState("none");
  const [amount, setAmount] = useState("");
  const [pricingModel, setPricingModel] = useState("one_time");
  const [effectiveDate, setEffectiveDate] = useState("");
  const [terms, setTerms] = useState("");
  const [reason, setReason] = useState("");
  const [note, setNote] = useState("");

  const client = useMemo(
    () => (clients.data?.clients ?? []).find((c: any) => c.id === clientId),
    [clients.data, clientId],
  );

  const suggestion = useQuery({
    queryKey: ["service-rate-suggestion", clientId, serviceKey],
    queryFn: () => suggestRate({ data: { clientId, serviceKey } }),
    enabled: Boolean(clientId && serviceKey),
    retry: false,
  });

  const suggested = suggestion.data ?? null;
  const cents = Math.round(Number(amount.replace(/[^0-9.]/g, "")) * 100);
  const feeSource: "client_rate" | "standard" | "custom" =
    suggested?.cents != null && suggested.cents === cents && suggested.source
      ? (suggested.source as "client_rate" | "standard")
      : "custom";

  const reset = () => {
    setServiceKey("");
    setAmount("");
    setTerms("");
    setReason("");
    setNote("");
    setEffectiveDate("");
  };

  const send = useMutation({
    mutationFn: () =>
      propose({
        data: {
          clientId,
          offeringId: offeringId === "none" ? null : offeringId,
          serviceKey,
          feeCents: cents,
          pricingModel,
          sowId: sowId === "none" ? null : sowId,
          effectiveDate,
          amendmentTerms: terms,
          feeSource,
          feeRateId: feeSource === "client_rate" ? (suggested?.rateId ?? null) : null,
          feeOverrideReason: reason,
          note,
        },
      }),
    onSuccess: () => {
      toast.success("Proposal sent. The client has been emailed and can approve it in their portal.");
      reset();
      void queryClient.invalidateQueries({ queryKey: ["service-requests"] });
    },
    onError: (e: any) => toast.error(e?.message ?? "That didn't send."),
  });

  const ready = Boolean(clientId && serviceKey && amount && Number.isFinite(cents) && cents >= 0);
  const canManage = requests.data?.canManage ?? false;

  const proposals = (requests.data?.requests ?? []).filter(
    (r: any) => r.requester_note === "Fee proposed by Harmonious",
  );

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Propose a fee to a client</CardTitle>
          <CardDescription>
            Put a written fee in front of a client for approval. Nothing is added to their scope and
            nothing is invoiced until they sign it and it is switched on.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {!canManage && (
            <p className="text-sm text-muted-foreground">
              You can see proposals here, but proposing a fee needs legal, compliance, finance, client
              success or admin authority.
            </p>
          )}
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label>Client</Label>
              <Select value={clientId} onValueChange={(v) => { setClientId(v); setOfferingId("none"); setSowId("none"); }}>
                <SelectTrigger><SelectValue placeholder="Choose a client" /></SelectTrigger>
                <SelectContent>
                  {(clients.data?.clients ?? []).map((c: any) => (
                    <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Fund (optional)</Label>
              <Select value={offeringId} onValueChange={setOfferingId} disabled={!client}>
                <SelectTrigger><SelectValue placeholder="Across the engagement" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Across the engagement</SelectItem>
                  {(client?.funds ?? []).map((f: any) => (
                    <SelectItem key={f.id} value={f.id}>{f.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Service</Label>
              <Select value={serviceKey} onValueChange={setServiceKey}>
                <SelectTrigger><SelectValue placeholder="Choose a service" /></SelectTrigger>
                <SelectContent>
                  {(catalog.data?.services ?? []).map((s: any) => (
                    <SelectItem key={s.key} value={s.key}>{s.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Statement of work (optional)</Label>
              <Select value={sowId} onValueChange={setSowId} disabled={!client}>
                <SelectTrigger><SelectValue placeholder="Attach later" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Attach later</SelectItem>
                  {(client?.sows ?? []).map((s: any) => (
                    <SelectItem key={s.id} value={s.id}>{s.title}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Fee (USD)</Label>
              <Input
                inputMode="decimal"
                placeholder="0.00"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
              />
              {suggested?.cents != null && (
                <p className="text-xs text-muted-foreground">
                  On file: {money(suggested.cents)} — {suggested.label}{" "}
                  <button
                    type="button"
                    className="underline"
                    onClick={() => {
                      setAmount(String((suggested.cents as number) / 100));
                      if (suggested.pricingModel) setPricingModel(String(suggested.pricingModel));
                    }}
                  >
                    use this
                  </button>
                </p>
              )}
            </div>
            <div className="space-y-1.5">
              <Label>Billing basis</Label>
              <Select value={pricingModel} onValueChange={setPricingModel}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {PRICING_MODELS.map((m) => (
                    <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Effective from</Label>
              <Input type="date" value={effectiveDate} onChange={(e) => setEffectiveDate(e.target.value)} />
            </div>
          </div>

          {feeSource === "custom" && amount !== "" && (
            <div className="space-y-1.5">
              <Label>Why this fee differs from the rate card</Label>
              <Input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Recorded on the audit trail" />
            </div>
          )}

          <div className="space-y-1.5">
            <Label>What the client is agreeing to</Label>
            <Textarea
              rows={4}
              value={terms}
              onChange={(e) => setTerms(e.target.value)}
              placeholder="Describe the work, the fee and when it applies. This is what the client signs."
            />
          </div>
          <div className="space-y-1.5">
            <Label>Internal note (optional)</Label>
            <Input value={note} onChange={(e) => setNote(e.target.value)} />
          </div>

          <div className="flex flex-wrap gap-2">
            <Button disabled={!ready || !canManage || send.isPending} onClick={() => send.mutate()}>
              {send.isPending ? "Sending…" : "Send for the client's approval"}
            </Button>
            <Button variant="outline" onClick={reset} disabled={send.isPending}>
              Clear
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Proposals you've sent</CardTitle>
          <CardDescription>
            Where each proposed fee stands, from sent through to billable.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {requests.isLoading && <p className="text-sm text-muted-foreground">Loading…</p>}
          {!requests.isLoading && proposals.length === 0 && (
            <p className="text-sm text-muted-foreground">No fee proposals sent yet.</p>
          )}
          {proposals.map((p: any) => (
            <div key={p.id} className="rounded-md border p-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="min-w-0">
                  <p className="text-sm font-medium">
                    {p.serviceName} · {p.clientName}
                    {p.fundName ? ` · ${p.fundName}` : ""}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {money(p.proposed_fee_cents)}
                    {p.proposed_pricing_model ? ` · ${String(p.proposed_pricing_model).replace(/_/g, " ")}` : ""}
                    {p.effective_date ? ` · from ${p.effective_date}` : ""}
                  </p>
                </div>
                <Badge variant={p.status === "activated" ? "default" : "secondary"}>
                  {stageLabel(p.status)}
                </Badge>
              </div>
              <p className="mt-2 text-xs text-muted-foreground">
                {NEXT_STEP[p.status] ?? ""}
                {p.signer_name ? ` Signed by ${p.signer_name}.` : ""}
              </p>
            </div>
          ))}
        </CardContent>
      </Card>

      <ServiceRequestsBoard />
    </div>
  );
}
