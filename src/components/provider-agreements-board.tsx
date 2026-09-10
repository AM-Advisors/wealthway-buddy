import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";

import { ActivityPanel } from "@/components/activity-panel";
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
  AGREEMENT_STAGES,
  RATE_BASES,
  advanceProviderAgreement,
  listProviderAgreements,
  removeAgreementCondition,
  removeAgreementRate,
  saveAgreementCondition,
  saveAgreementRate,
  saveProviderAgreement,
  setConditionMet,
} from "@/lib/provider-agreements.functions";

const money = (cents: number) =>
  (cents / 100).toLocaleString("en-US", { style: "currency", currency: "USD" });

const when = (v: string | null | undefined) =>
  v ? new Date(v).toLocaleDateString("en-US", { dateStyle: "medium" }) : "—";

const stageLabel = (value: string) =>
  AGREEMENT_STAGES.find((s) => s.value === value)?.label ?? value;

const stageTone = (value: string) =>
  value === "active"
    ? "default"
    : value === "terminated" || value === "expired"
      ? "secondary"
      : "outline";

type Terms = {
  id?: string;
  providerId: string;
  title: string;
  reference: string;
  scopeSummary: string;
  services: string;
  startDate: string;
  endDate: string;
  noticeDays: string;
  documentUrl: string;
  note: string;
};

const emptyTerms: Terms = {
  providerId: "",
  title: "",
  reference: "",
  scopeSummary: "",
  services: "",
  startDate: "",
  endDate: "",
  noticeDays: "60",
  documentUrl: "",
  note: "",
};

/**
 * Agreements between Harmonious and the third parties it coordinates: what they
 * do, what they charge, what must be in place first, and when it goes live.
 */
export function ProviderAgreementsBoard() {
  const queryClient = useQueryClient();
  const load = useServerFn(listProviderAgreements);
  const saveAgreement = useServerFn(saveProviderAgreement);
  const saveRate = useServerFn(saveAgreementRate);
  const dropRate = useServerFn(removeAgreementRate);
  const saveCondition = useServerFn(saveAgreementCondition);
  const clearCondition = useServerFn(setConditionMet);
  const dropCondition = useServerFn(removeAgreementCondition);
  const advance = useServerFn(advanceProviderAgreement);

  const { data, isLoading, error } = useQuery({
    queryKey: ["provider-agreements"],
    queryFn: () => load(),
    retry: false,
  });

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [terms, setTerms] = useState<Terms | null>(null);
  const [rate, setRate] = useState({ label: "", basis: "per_fund", amount: "", billed: true, note: "" });
  const [condition, setCondition] = useState({ label: "", detail: "", required: true });
  const [signers, setSigners] = useState({ provider: "", providerTitle: "", ours: "", oursTitle: "" });
  const [reason, setReason] = useState("");

  const agreements = (data?.agreements ?? []) as any[];
  const providers = (data?.providers ?? []) as any[];
  const canManage = Boolean(data?.canManage);

  const selected = useMemo(
    () => agreements.find((a) => a.id === selectedId) ?? null,
    [agreements, selectedId],
  );
  const rates = useMemo(
    () => ((data?.rates ?? []) as any[]).filter((r) => r.agreement_id === selectedId),
    [data, selectedId],
  );
  const conditions = useMemo(
    () => ((data?.conditions ?? []) as any[]).filter((c) => c.agreement_id === selectedId),
    [data, selectedId],
  );
  const providerName = (id: string) => providers.find((p) => p.id === id)?.name ?? "Unknown provider";

  const refresh = () => queryClient.invalidateQueries({ queryKey: ["provider-agreements"] });
  const fail = (e: any) => toast.error(e?.message ?? "That didn't go through.");

  const saveTerms = useMutation({
    mutationFn: async () => {
      if (!terms) throw new Error("Nothing to save.");
      const res: any = await saveAgreement({
        data: {
          id: terms.id,
          providerId: terms.providerId,
          title: terms.title,
          reference: terms.reference,
          scopeSummary: terms.scopeSummary,
          services: terms.services
            .split(",")
            .map((s) => s.trim())
            .filter(Boolean),
          startDate: terms.startDate,
          endDate: terms.endDate,
          noticeDays: Number(terms.noticeDays) || 0,
          documentUrl: terms.documentUrl,
          note: terms.note,
        },
      });
      return res.id as string;
    },
    onSuccess: (id) => {
      toast.success("Agreement saved.");
      setTerms(null);
      setSelectedId(id);
      refresh();
    },
    onError: fail,
  });

  const addRate = useMutation({
    mutationFn: async () => {
      if (!selectedId) throw new Error("Choose an agreement first.");
      const cents = Math.round(Number(rate.amount) * 100);
      if (!Number.isFinite(cents)) throw new Error("Enter the price.");
      return saveRate({
        data: {
          agreementId: selectedId,
          label: rate.label,
          basis: rate.basis,
          amountCents: cents,
          billedToClient: rate.billed,
          note: rate.note,
          sortOrder: rates.length,
        },
      });
    },
    onSuccess: () => {
      setRate({ label: "", basis: "per_fund", amount: "", billed: true, note: "" });
      refresh();
    },
    onError: fail,
  });

  const addCondition = useMutation({
    mutationFn: async () => {
      if (!selectedId) throw new Error("Choose an agreement first.");
      return saveCondition({
        data: {
          agreementId: selectedId,
          label: condition.label,
          detail: condition.detail,
          required: condition.required,
          sortOrder: conditions.length,
        },
      });
    },
    onSuccess: () => {
      setCondition({ label: "", detail: "", required: true });
      refresh();
    },
    onError: fail,
  });

  const move = useMutation({
    mutationFn: (action: any) =>
      advance({
        data: {
          id: selectedId!,
          action,
          providerSignerName: signers.provider,
          providerSignerTitle: signers.providerTitle,
          harmoniousSignerName: signers.ours,
          harmoniousSignerTitle: signers.oursTitle,
          reason,
        },
      }),
    onSuccess: () => {
      toast.success("Agreement updated.");
      setReason("");
      refresh();
    },
    onError: fail,
  });

  const simple = useMutation({
    mutationFn: async (fn: () => Promise<unknown>) => fn(),
    onSuccess: () => refresh(),
    onError: fail,
  });

  if (isLoading) return <p className="text-sm text-muted-foreground">Loading provider agreements…</p>;
  if (error)
    return (
      <p className="text-sm text-muted-foreground">
        {(error as any)?.message ?? "This area isn't available to you."}
      </p>
    );

  const outstanding = conditions.filter((c) => c.required && !c.met).length;

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Provider agreements</CardTitle>
          <CardDescription>
            What each third party does for Harmonious, what they charge, and what has to be in place
            before their work starts. Harmonious coordinates these providers; it is not the bank,
            custodian, transfer agent or filing authority itself.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {agreements.length === 0 ? (
            <p className="text-sm text-muted-foreground">No provider agreements recorded yet.</p>
          ) : null}
          {agreements.map((a) => (
            <button
              key={a.id}
              onClick={() => {
                setSelectedId(a.id);
                setTerms(null);
              }}
              className={`flex w-full flex-col gap-1 rounded-md border p-3 text-left ${
                a.id === selectedId ? "border-primary" : ""
              }`}
            >
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-medium">{a.title}</span>
                <Badge variant={stageTone(a.status) as any}>{stageLabel(a.status)}</Badge>
                <span className="text-sm text-muted-foreground">{providerName(a.provider_id)}</span>
              </div>
              <p className="text-xs text-muted-foreground">
                Starts {when(a.start_date)} · Ends {when(a.end_date)} · {a.notice_days} days notice
              </p>
            </button>
          ))}
          {canManage ? (
            <Button
              variant="outline"
              onClick={() => {
                setSelectedId(null);
                setTerms({ ...emptyTerms });
              }}
            >
              New provider agreement
            </Button>
          ) : (
            <p className="text-xs text-muted-foreground">
              You can view these; changing them needs legal, compliance, finance, client success or
              admin authority.
            </p>
          )}
        </CardContent>
      </Card>

      {terms ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">
              {terms.id ? "Edit agreement" : "New provider agreement"}
            </CardTitle>
            <CardDescription>
              Set out the provider, the work covered, the term and the notice period.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="grid gap-3 md:grid-cols-2">
              <div>
                <Label>Provider</Label>
                <Select
                  value={terms.providerId}
                  onValueChange={(v) => setTerms({ ...terms, providerId: v })}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Choose a provider" />
                  </SelectTrigger>
                  <SelectContent>
                    {providers
                      .filter((p) => !p.retired_at)
                      .map((p) => (
                        <SelectItem key={p.id} value={p.id}>
                          {p.name}
                        </SelectItem>
                      ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Title</Label>
                <Input
                  value={terms.title}
                  onChange={(e) => setTerms({ ...terms, title: e.target.value })}
                  placeholder="Fund administration services"
                />
              </div>
              <div>
                <Label>Reference</Label>
                <Input
                  value={terms.reference}
                  onChange={(e) => setTerms({ ...terms, reference: e.target.value })}
                />
              </div>
              <div>
                <Label>Services covered (comma separated)</Label>
                <Input
                  value={terms.services}
                  onChange={(e) => setTerms({ ...terms, services: e.target.value })}
                  placeholder="fund administration, tax, filings"
                />
              </div>
              <div>
                <Label>Start date</Label>
                <Input
                  type="date"
                  value={terms.startDate}
                  onChange={(e) => setTerms({ ...terms, startDate: e.target.value })}
                />
              </div>
              <div>
                <Label>End date</Label>
                <Input
                  type="date"
                  value={terms.endDate}
                  onChange={(e) => setTerms({ ...terms, endDate: e.target.value })}
                />
              </div>
              <div>
                <Label>Notice period (days)</Label>
                <Input
                  value={terms.noticeDays}
                  onChange={(e) => setTerms({ ...terms, noticeDays: e.target.value })}
                />
              </div>
              <div>
                <Label>Signed document link</Label>
                <Input
                  value={terms.documentUrl}
                  onChange={(e) => setTerms({ ...terms, documentUrl: e.target.value })}
                />
              </div>
            </div>
            <div>
              <Label>Scope summary</Label>
              <Textarea
                rows={3}
                value={terms.scopeSummary}
                onChange={(e) => setTerms({ ...terms, scopeSummary: e.target.value })}
              />
            </div>
            <div className="flex gap-2">
              <Button disabled={saveTerms.isPending} onClick={() => saveTerms.mutate()}>
                {saveTerms.isPending ? "Saving…" : "Save agreement"}
              </Button>
              <Button variant="outline" onClick={() => setTerms(null)}>
                Cancel
              </Button>
            </div>
          </CardContent>
        </Card>
      ) : null}

      {selected ? (
        <>
          <Card>
            <CardHeader>
              <CardTitle className="text-base">{selected.title}</CardTitle>
              <CardDescription>
                {providerName(selected.provider_id)} · {stageLabel(selected.status)}
                {selected.scope_summary ? ` · ${selected.scope_summary}` : ""}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              <p className="text-muted-foreground">
                Signed for the provider by {selected.provider_signer_name ?? "—"} on{" "}
                {when(selected.provider_signed_at)}; for Harmonious by{" "}
                {selected.harmonious_signer_name ?? "—"} on {when(selected.harmonious_signed_at)}.
              </p>
              {selected.termination_reason ? (
                <p className="text-muted-foreground">
                  Closed {when(selected.terminated_at)}: {selected.termination_reason}
                </p>
              ) : null}
              {canManage ? (
                <div className="space-y-3">
                  {selected.status === "in_review" ? (
                    <div className="grid gap-3 md:grid-cols-2">
                      <div>
                        <Label>Provider signer</Label>
                        <Input
                          value={signers.provider}
                          onChange={(e) => setSigners({ ...signers, provider: e.target.value })}
                        />
                      </div>
                      <div>
                        <Label>Provider signer title</Label>
                        <Input
                          value={signers.providerTitle}
                          onChange={(e) => setSigners({ ...signers, providerTitle: e.target.value })}
                        />
                      </div>
                      <div>
                        <Label>Harmonious signer</Label>
                        <Input
                          value={signers.ours}
                          onChange={(e) => setSigners({ ...signers, ours: e.target.value })}
                        />
                      </div>
                      <div>
                        <Label>Harmonious signer title</Label>
                        <Input
                          value={signers.oursTitle}
                          onChange={(e) => setSigners({ ...signers, oursTitle: e.target.value })}
                        />
                      </div>
                    </div>
                  ) : null}
                  {["signed", "active"].includes(selected.status) ? (
                    <div>
                      <Label>Reason (needed to terminate)</Label>
                      <Input value={reason} onChange={(e) => setReason(e.target.value)} />
                    </div>
                  ) : null}
                  <div className="flex flex-wrap gap-2">
                    {selected.status === "draft" ? (
                      <>
                        <Button size="sm" onClick={() => move.mutate("send_for_review")}>
                          Send for review
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() =>
                            setTerms({
                              id: selected.id,
                              providerId: selected.provider_id,
                              title: selected.title ?? "",
                              reference: selected.reference ?? "",
                              scopeSummary: selected.scope_summary ?? "",
                              services: (selected.services ?? []).join(", "),
                              startDate: selected.start_date ?? "",
                              endDate: selected.end_date ?? "",
                              noticeDays: String(selected.notice_days ?? 60),
                              documentUrl: selected.document_url ?? "",
                              note: selected.note ?? "",
                            })
                          }
                        >
                          Edit terms
                        </Button>
                      </>
                    ) : null}
                    {selected.status === "in_review" ? (
                      <>
                        <Button size="sm" onClick={() => move.mutate("sign")}>
                          Record signatures
                        </Button>
                        <Button size="sm" variant="outline" onClick={() => move.mutate("back_to_draft")}>
                          Back to draft
                        </Button>
                      </>
                    ) : null}
                    {selected.status === "signed" ? (
                      <>
                        <Button size="sm" onClick={() => move.mutate("activate")}>
                          Activate
                        </Button>
                        <Button size="sm" variant="outline" onClick={() => move.mutate("terminate")}>
                          Terminate
                        </Button>
                      </>
                    ) : null}
                    {selected.status === "active" ? (
                      <>
                        <Button size="sm" variant="outline" onClick={() => move.mutate("expire")}>
                          Mark expired
                        </Button>
                        <Button size="sm" variant="outline" onClick={() => move.mutate("terminate")}>
                          Terminate
                        </Button>
                      </>
                    ) : null}
                  </div>
                  {selected.status === "signed" ? (
                    <p className="text-xs text-muted-foreground">
                      {outstanding > 0
                        ? `${outstanding} required condition${outstanding === 1 ? "" : "s"} still outstanding — activation is blocked until they are cleared.`
                        : "All required conditions are cleared. At least one agreed price is also needed."}
                    </p>
                  ) : null}
                </div>
              ) : null}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Agreed prices</CardTitle>
              <CardDescription>
                What the provider charges, and whether the cost is passed on to the client.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {rates.length === 0 ? (
                <p className="text-sm text-muted-foreground">No prices agreed yet.</p>
              ) : null}
              {rates.map((r) => (
                <div key={r.id} className="flex flex-wrap items-center justify-between gap-2 rounded-md border p-3">
                  <div>
                    <p className="text-sm font-medium">{r.label}</p>
                    <p className="text-xs text-muted-foreground">
                      {money(r.amount_cents)} ·{" "}
                      {RATE_BASES.find((b) => b.value === r.basis)?.label ?? r.basis} ·{" "}
                      {r.billed_to_client ? "Passed on to the client" : "Absorbed by Harmonious"}
                    </p>
                  </div>
                  {canManage && ["draft", "in_review", "signed"].includes(selected.status) ? (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => simple.mutate(() => dropRate({ data: { id: r.id } }))}
                    >
                      Remove
                    </Button>
                  ) : null}
                </div>
              ))}
              {canManage && ["draft", "in_review", "signed"].includes(selected.status) ? (
                <div className="grid gap-3 md:grid-cols-2">
                  <div>
                    <Label>What is charged</Label>
                    <Input value={rate.label} onChange={(e) => setRate({ ...rate, label: e.target.value })} />
                  </div>
                  <div>
                    <Label>Basis</Label>
                    <Select value={rate.basis} onValueChange={(v) => setRate({ ...rate, basis: v })}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {RATE_BASES.map((b) => (
                          <SelectItem key={b.value} value={b.value}>
                            {b.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label>Amount (USD)</Label>
                    <Input value={rate.amount} onChange={(e) => setRate({ ...rate, amount: e.target.value })} />
                  </div>
                  <div>
                    <Label>Who bears it</Label>
                    <Select
                      value={rate.billed ? "client" : "harmonious"}
                      onValueChange={(v) => setRate({ ...rate, billed: v === "client" })}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="client">Passed on to the client</SelectItem>
                        <SelectItem value="harmonious">Absorbed by Harmonious</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="md:col-span-2">
                    <Button size="sm" disabled={addRate.isPending} onClick={() => addRate.mutate()}>
                      Add price
                    </Button>
                  </div>
                </div>
              ) : null}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Conditions before go-live</CardTitle>
              <CardDescription>
                Insurance, security review, data handling, service levels — required items must be
                cleared before the agreement can be activated.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {conditions.length === 0 ? (
                <p className="text-sm text-muted-foreground">No conditions recorded yet.</p>
              ) : null}
              {conditions.map((c) => (
                <div key={c.id} className="flex flex-wrap items-center justify-between gap-2 rounded-md border p-3">
                  <div>
                    <p className="text-sm font-medium">
                      {c.label}{" "}
                      <Badge variant={c.met ? "default" : c.required ? "destructive" : "outline"}>
                        {c.met ? "Cleared" : c.required ? "Required" : "Optional"}
                      </Badge>
                    </p>
                    {c.detail ? <p className="text-xs text-muted-foreground">{c.detail}</p> : null}
                    {c.confirmed_at ? (
                      <p className="text-xs text-muted-foreground">Cleared {when(c.confirmed_at)}</p>
                    ) : null}
                  </div>
                  {canManage ? (
                    <div className="flex gap-2">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() =>
                          simple.mutate(() => clearCondition({ data: { id: c.id, met: !c.met } }))
                        }
                      >
                        {c.met ? "Reopen" : "Mark cleared"}
                      </Button>
                      {selected.status !== "active" ? (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => simple.mutate(() => dropCondition({ data: { id: c.id } }))}
                        >
                          Remove
                        </Button>
                      ) : null}
                    </div>
                  ) : null}
                </div>
              ))}
              {canManage && selected.status !== "terminated" && selected.status !== "expired" ? (
                <div className="grid gap-3 md:grid-cols-2">
                  <div>
                    <Label>Condition</Label>
                    <Input
                      value={condition.label}
                      onChange={(e) => setCondition({ ...condition, label: e.target.value })}
                      placeholder="Certificate of insurance on file"
                    />
                  </div>
                  <div>
                    <Label>Required?</Label>
                    <Select
                      value={condition.required ? "yes" : "no"}
                      onValueChange={(v) => setCondition({ ...condition, required: v === "yes" })}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="yes">Required before go-live</SelectItem>
                        <SelectItem value="no">Nice to have</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="md:col-span-2">
                    <Label>Detail</Label>
                    <Textarea
                      rows={2}
                      value={condition.detail}
                      onChange={(e) => setCondition({ ...condition, detail: e.target.value })}
                    />
                  </div>
                  <div className="md:col-span-2">
                    <Button size="sm" disabled={addCondition.isPending} onClick={() => addCondition.mutate()}>
                      Add condition
                    </Button>
                  </div>
                </div>
              ) : null}
            </CardContent>
          </Card>
        </>
      ) : null}

      <ActivityPanel
        areas={["provider agreement"]}
        title="Provider agreement history"
        description="Who drafted, priced, signed, activated or closed each provider agreement, and when."
        limit={50}
      />
    </div>
  );
}
