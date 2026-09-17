import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  ASSET_CLASS_LABELS,
  METHOD_LABELS,
  SOURCE_LABELS,
  VALUATION_METHODS,
  VALUATION_SOURCE_TYPES,
  type ValuationMethod,
  type ValuationSourceType,
} from "@/lib/valuation-model";
import {
  decideAssetValuation,
  getPortfolioAssets,
  getStalePositions,
  getValuationQueue,
  prepareValuationGl,
  proposeAssetValuation,
  respondToAssetValuation,
  submitAssetValuation,
} from "@/lib/valuation.functions";

const money = (cents: number) =>
  `${cents < 0 ? "−" : ""}$${Math.abs(cents / 100).toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;

const STATUS_TONE: Record<string, string> = {
  draft: "bg-muted text-muted-foreground",
  review: "bg-amber-100 text-amber-900",
  approved: "bg-sky-100 text-sky-900",
  effective: "bg-emerald-100 text-emerald-900",
  superseded: "bg-muted text-muted-foreground",
  rejected: "bg-rose-100 text-rose-900",
  returned: "bg-orange-100 text-orange-900",
};

function Stat({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-lg border border-border bg-card p-4">
      <p className="text-xs uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="mt-1 text-2xl font-semibold text-foreground">{value}</p>
    </div>
  );
}

const today = () => new Date().toISOString().slice(0, 10);

export function ValuationBoard({ role }: { role: "harmonious" | "manager" }) {
  const isStaff = role === "harmonious";
  const queryClient = useQueryClient();

  const loadQueue = useServerFn(getValuationQueue);
  const loadAssets = useServerFn(getPortfolioAssets);
  const loadStale = useServerFn(getStalePositions);
  const propose = useServerFn(proposeAssetValuation);
  const submit = useServerFn(submitAssetValuation);
  const decide = useServerFn(decideAssetValuation);
  const respond = useServerFn(respondToAssetValuation);
  const prepareGl = useServerFn(prepareValuationGl);

  const [notes, setNotes] = useState<Record<string, string>>({});
  const [form, setForm] = useState<{
    assetId: string;
    value: string;
    date: string;
    methodology: ValuationMethod;
    sourceType: ValuationSourceType;
    source: string;
    assumptions: string;
  } | null>(null);

  const queue = useQuery({ queryKey: ["valuation-queue"], queryFn: () => loadQueue({ data: {} }) });
  const assets = useQuery({
    queryKey: ["portfolio-assets"],
    queryFn: () => loadAssets({ data: {} }),
  });
  const stale = useQuery({
    queryKey: ["stale-positions"],
    queryFn: () => loadStale({ data: {} }),
  });

  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: ["valuation-queue"] });
    void queryClient.invalidateQueries({ queryKey: ["portfolio-assets"] });
    void queryClient.invalidateQueries({ queryKey: ["stale-positions"] });
  };

  const act = useMutation({
    mutationFn: async (input: { id: string; kind: string }) => {
      const note = notes[input.id]?.trim() ?? "";
      switch (input.kind) {
        case "submit":
          return submit({ data: { id: input.id } });
        case "approve":
          return decide({ data: { id: input.id, action: "approve" } });
        case "make_effective":
          return decide({ data: { id: input.id, action: "make_effective" } });
        case "return":
          return decide({ data: { id: input.id, action: "return", reason: note } });
        case "reject":
          return decide({ data: { id: input.id, action: "reject", reason: note } });
        case "prepare_gl":
          return prepareGl({ data: { id: input.id } });
        case "acknowledge":
          return respond({ data: { id: input.id, response: "acknowledge", ...(note ? { note } : {}) } });
        case "challenge":
          return respond({ data: { id: input.id, response: "challenge", note } });
        default:
          throw new Error("Unknown action");
      }
    },
    onSuccess: () => {
      toast.success("Saved");
      refresh();
    },
    onError: (error: unknown) => toast.error((error as Error).message),
  });

  const save = useMutation({
    mutationFn: async () => {
      if (!form) throw new Error("Nothing to save");
      const dollars = Number(form.value);
      if (!Number.isFinite(dollars)) throw new Error("Enter the value in dollars");
      return propose({
        data: {
          assetId: form.assetId,
          valuationDate: form.date,
          effectiveDate: form.date,
          valueCents: Math.round(dollars * 100),
          methodology: form.methodology,
          sourceType: form.sourceType,
          ...(form.source ? { source: form.source } : {}),
          ...(form.assumptions ? { assumptions: form.assumptions } : {}),
        },
      });
    },
    onSuccess: () => {
      toast.success("Valuation drafted");
      setForm(null);
      refresh();
    },
    onError: (error: unknown) => toast.error((error as Error).message),
  });

  const rows = queue.data ?? [];
  const inReview = rows.filter((r) => r.status === "review" || r.status === "draft").length;

  return (
    <main className="mx-auto w-full max-w-6xl space-y-6 px-4 py-8">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">
          {isStaff ? "Valuation review" : "Fund valuations"}
        </h1>
        <p className="text-muted-foreground text-sm">
          {isStaff
            ? "Every asset value, with its method, evidence and approval history. Nothing reaches the books until Harmonious makes it effective."
            : "Propose what your holdings are worth and respond to the values Harmonious puts in place. Harmonious approves every value."}
        </p>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <Stat label="Assets" value={assets.data?.length ?? 0} />
        <Stat label="Awaiting decision" value={inReview} />
        <Stat label="Values out of date" value={stale.data?.length ?? 0} />
      </div>

      <Tabs defaultValue="queue">
        <TabsList>
          <TabsTrigger value="queue">Valuations</TabsTrigger>
          <TabsTrigger value="assets">Holdings</TabsTrigger>
          <TabsTrigger value="stale">Out of date</TabsTrigger>
        </TabsList>

        <TabsContent value="queue" className="space-y-3 pt-4">
          {queue.isLoading ? (
            <p className="text-muted-foreground text-sm">Loading valuations…</p>
          ) : rows.length === 0 ? (
            <Card>
              <CardContent className="text-muted-foreground py-10 text-center text-sm">
                No valuations yet.
              </CardContent>
            </Card>
          ) : null}

          {rows.map((row) => (
            <Card key={row.id}>
              <CardHeader className="gap-2">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <CardTitle className="text-base">
                    {row.issuerName} — {row.assetName}
                  </CardTitle>
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge className={STATUS_TONE[row.status] ?? ""}>{row.status}</Badge>
                    <Badge variant="outline">v{row.version}</Badge>
                    <Badge variant="outline">{row.fundName}</Badge>
                  </div>
                </div>
                <CardDescription>
                  {money(row.priorValueCents)} → <strong>{money(row.valueCents)}</strong> (
                  {row.changeCents >= 0 ? "+" : ""}
                  {money(row.changeCents)}
                  {row.changePct === null ? "" : `, ${row.changePct.toFixed(1)}%`}) · effective{" "}
                  {row.effectiveDate} · {METHOD_LABELS[row.methodology]} ·{" "}
                  {SOURCE_LABELS[row.sourceType]}
                  {row.source ? ` (${row.source})` : ""} · {row.ageDays} days old
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                {row.conflicts.length > 0 ? (
                  <ul className="rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
                    {row.conflicts.map((c) => (
                      <li key={c}>{c}</li>
                    ))}
                  </ul>
                ) : null}

                <p className="text-muted-foreground text-xs">
                  Evidence:{" "}
                  {row.evidence.length === 0
                    ? "none attached"
                    : row.evidence.map((e) => e.title).join(", ")}
                  {row.preparedByRole ? ` · prepared by ${row.preparedByRole}` : ""}
                  {row.managerAcknowledged ? " · manager acknowledged" : ""}
                  {row.journalEntryId ? " · sent to the books" : ""}
                </p>

                {row.managerChallenge ? (
                  <p className="rounded-md border border-orange-200 bg-orange-50 p-3 text-sm text-orange-900">
                    Manager challenge: {row.managerChallenge}
                  </p>
                ) : null}

                <Input
                  value={notes[row.id] ?? ""}
                  onChange={(e) => setNotes((n) => ({ ...n, [row.id]: e.target.value }))}
                  placeholder="Reason or note"
                />

                <div className="flex flex-wrap gap-2">
                  {row.status === "draft" ? (
                    <Button size="sm" onClick={() => act.mutate({ id: row.id, kind: "submit" })}>
                      Send for review
                    </Button>
                  ) : null}
                  {isStaff ? (
                    <>
                      {row.status === "review" ? (
                        <Button size="sm" onClick={() => act.mutate({ id: row.id, kind: "approve" })}>
                          Approve
                        </Button>
                      ) : null}
                      {row.status === "approved" ? (
                        <Button
                          size="sm"
                          onClick={() => act.mutate({ id: row.id, kind: "make_effective" })}
                        >
                          Make effective
                        </Button>
                      ) : null}
                      {row.status === "effective" && !row.journalEntryId ? (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => act.mutate({ id: row.id, kind: "prepare_gl" })}
                        >
                          Prepare accounting entry
                        </Button>
                      ) : null}
                      {row.status === "review" || row.status === "approved" ? (
                        <>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => act.mutate({ id: row.id, kind: "return" })}
                          >
                            Return for changes
                          </Button>
                          <Button
                            size="sm"
                            variant="destructive"
                            onClick={() => act.mutate({ id: row.id, kind: "reject" })}
                          >
                            Reject
                          </Button>
                        </>
                      ) : null}
                    </>
                  ) : (
                    <>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => act.mutate({ id: row.id, kind: "acknowledge" })}
                      >
                        Acknowledge
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => act.mutate({ id: row.id, kind: "challenge" })}
                      >
                        Challenge this value
                      </Button>
                    </>
                  )}
                </div>
              </CardContent>
            </Card>
          ))}
        </TabsContent>

        <TabsContent value="assets" className="space-y-3 pt-4">
          {(assets.data ?? []).length === 0 ? (
            <Card>
              <CardContent className="text-muted-foreground py-10 text-center text-sm">
                No holdings recorded yet.
              </CardContent>
            </Card>
          ) : null}
          {(assets.data ?? []).map((asset: any) => {
            const draft = form && form.assetId === asset.id ? form : null;
            return (
            <Card key={asset.id}>
              <CardHeader className="gap-1">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <CardTitle className="text-base">
                    {asset.issuer_name} — {asset.asset_name}
                  </CardTitle>
                  <Badge variant="outline">
                    {ASSET_CLASS_LABELS[asset.asset_class as keyof typeof ASSET_CLASS_LABELS] ??
                      asset.asset_class}
                  </Badge>
                </div>
                <CardDescription>
                  Cost {money(Number(asset.cost_basis_cents ?? 0))}
                  {asset.quantity ? ` · ${Number(asset.quantity).toLocaleString("en-US")} units` : ""}
                  {asset.status === "active" ? "" : ` · ${asset.status}`}
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                {draft ? (
                  <div className="grid gap-2 sm:grid-cols-2">
                    <Input
                      value={draft.value}
                      onChange={(e) => setForm((f) => (f ? { ...f, value: e.target.value } : f))}
                      placeholder="Value in dollars"
                    />
                    <Input
                      type="date"
                      value={draft.date}
                      onChange={(e) => setForm((f) => (f ? { ...f, date: e.target.value } : f))}
                    />
                    <select
                      className="h-9 rounded-md border border-input bg-background px-3 text-sm"
                      value={draft.methodology}
                      onChange={(e) =>
                        setForm((f) => (f ? { ...f, methodology: e.target.value as ValuationMethod } : f))
                      }
                    >
                      {VALUATION_METHODS.map((m) => (
                        <option key={m} value={m}>
                          {METHOD_LABELS[m]}
                        </option>
                      ))}
                    </select>
                    <select
                      className="h-9 rounded-md border border-input bg-background px-3 text-sm"
                      value={draft.sourceType}
                      onChange={(e) =>
                        setForm((f) => (f ? { ...f, sourceType: e.target.value as ValuationSourceType } : f))
                      }
                    >
                      {VALUATION_SOURCE_TYPES.map((s) => (
                        <option key={s} value={s}>
                          {SOURCE_LABELS[s]}
                        </option>
                      ))}
                    </select>
                    <Input
                      value={draft.source}
                      onChange={(e) => setForm((f) => (f ? { ...f, source: e.target.value } : f))}
                      placeholder="Where the value came from"
                    />
                    <Textarea
                      className="sm:col-span-2"
                      value={draft.assumptions}
                      onChange={(e) => setForm((f) => (f ? { ...f, assumptions: e.target.value } : f))}
                      placeholder="Assumptions behind the value"
                    />
                    <div className="flex gap-2 sm:col-span-2">
                      <Button size="sm" disabled={save.isPending} onClick={() => save.mutate()}>
                        Save draft valuation
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => setForm(null)}>
                        Cancel
                      </Button>
                    </div>
                  </div>
                ) : (
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() =>
                      setForm({
                        assetId: asset.id,
                        value: "",
                        date: today(),
                        methodology: "third_party",
                        sourceType: "independent_third_party",
                        source: "",
                        assumptions: "",
                      })
                    }
                  >
                    Propose a new value
                  </Button>
                )}
              </CardContent>
            </Card>
            );
          })}
        </TabsContent>

        <TabsContent value="stale" className="space-y-3 pt-4">
          {(stale.data ?? []).length === 0 ? (
            <Card>
              <CardContent className="text-muted-foreground py-10 text-center text-sm">
                Every holding has a current value.
              </CardContent>
            </Card>
          ) : null}
          {(stale.data ?? []).map((item) => (
            <Card key={item.assetId}>
              <CardHeader className="gap-1">
                <CardTitle className="text-base">
                  {item.issuerName} — {item.assetName}
                </CardTitle>
                <CardDescription>
                  {item.lastValuationDate
                    ? `Last valued ${item.lastValuationDate} (${item.ageDays} days ago)`
                    : "Never valued"}
                </CardDescription>
              </CardHeader>
            </Card>
          ))}
        </TabsContent>
      </Tabs>

      <p className="text-muted-foreground text-xs">
        Values become part of the accounting records only after Harmonious makes them effective and
        prepares the entry, which still goes through the normal review and posting steps.
      </p>
    </main>
  );
}
