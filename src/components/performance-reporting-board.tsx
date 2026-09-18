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
  amendPerformanceReport,
  decidePerformanceReport,
  getManagerPerformance,
  getPerformanceProvenance,
  getPerformanceQueue,
  getPerformanceReport,
  preparePerformanceReport,
  respondToPerformanceReport,
  setPerformanceReportVisibility,
} from "@/lib/performance-reporting.functions";

const money = (cents: number | null | undefined) =>
  cents === null || cents === undefined
    ? "—"
    : `${Number(cents) < 0 ? "−" : ""}$${Math.abs(Number(cents) / 100).toLocaleString("en-US", {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      })}`;

const pct = (bps: number | null | undefined) =>
  bps === null || bps === undefined ? "—" : `${(Number(bps) / 100).toFixed(2)}%`;

const times = (value: number | string | null | undefined) =>
  value === null || value === undefined ? "—" : `${Number(value).toFixed(2)}×`;

const STATUS_TONE: Record<string, string> = {
  draft: "bg-muted text-muted-foreground",
  prepared: "bg-sky-100 text-sky-900",
  review: "bg-amber-100 text-amber-900",
  approved: "bg-sky-100 text-sky-900",
  published: "bg-emerald-100 text-emerald-900",
  superseded: "bg-muted text-muted-foreground",
};

const SEVERITY_TONE: Record<string, string> = {
  warning: "bg-amber-100 text-amber-900",
  blocking: "bg-rose-100 text-rose-900",
};

const label = (value: string) => String(value ?? "").replaceAll("_", " ");
const today = () => new Date().toISOString().slice(0, 10);

function RunRow({
  run,
  onOpen,
  actions,
}: {
  run: any;
  onOpen: () => void;
  actions?: React.ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border/60 py-3">
      <button type="button" className="text-left" onClick={onOpen}>
        <p className="text-sm font-medium">
          {run.fundName ?? "Fund"} · {run.period_label || `${run.period_start} to ${run.period_end}`}
        </p>
        <p className="text-xs text-muted-foreground">
          v{run.version} · {label(run.period_kind)} · net {pct(run.net_return_bps)} · IRR{" "}
          {run.irr_status === "solved" ? pct(run.irr_bps) : label(run.irr_status)}
        </p>
      </button>
      <div className="flex items-center gap-2">
        <Badge className={STATUS_TONE[run.status] ?? "bg-muted"}>{label(run.status)}</Badge>
        {actions}
      </div>
    </div>
  );
}

function Metric({ title, value, note }: { title: string; value: string; note?: string }) {
  return (
    <div className="rounded-lg border border-border/60 p-3">
      <p className="text-xs text-muted-foreground">{title}</p>
      <p className="text-lg font-semibold">{value}</p>
      {note ? <p className="text-xs text-muted-foreground">{note}</p> : null}
    </div>
  );
}

export function PerformanceReportingBoard({ role }: { role: "harmonious" | "manager" }) {
  const isStaff = role === "harmonious";
  const queryClient = useQueryClient();

  const loadQueue = useServerFn(getPerformanceQueue);
  const loadManager = useServerFn(getManagerPerformance);
  const loadDetail = useServerFn(getPerformanceReport);
  const loadProvenance = useServerFn(getPerformanceProvenance);
  const prepare = useServerFn(preparePerformanceReport);
  const decide = useServerFn(decidePerformanceReport);
  const amend = useServerFn(amendPerformanceReport);
  const respond = useServerFn(respondToPerformanceReport);
  const setVisibility = useServerFn(setPerformanceReportVisibility);

  const [fundId, setFundId] = useState("");
  const [periodKind, setPeriodKind] = useState("quarter");
  const [periodEnd, setPeriodEnd] = useState(today());
  const [periodStart, setPeriodStart] = useState(`${today().slice(0, 4)}-01-01`);
  const [openId, setOpenId] = useState<string | null>(null);
  const [metricKey, setMetricKey] = useState<string | null>(null);
  const [note, setNote] = useState("");

  const board = useQuery({
    queryKey: ["performance-board", role],
    queryFn: async (): Promise<any> => (isStaff ? loadQueue({ data: {} }) : loadManager({ data: {} })),
  });

  const detail = useQuery({
    queryKey: ["performance-detail", openId],
    enabled: Boolean(openId),
    queryFn: async (): Promise<any> => loadDetail({ data: { runId: openId! } }),
  });

  const provenance = useQuery({
    queryKey: ["performance-provenance", openId, metricKey],
    enabled: Boolean(openId && metricKey),
    queryFn: async (): Promise<any> =>
      loadProvenance({ data: { runId: openId!, metricKey: metricKey! } }),
  });

  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: ["performance-board"] });
    queryClient.invalidateQueries({ queryKey: ["performance-detail"] });
  };

  const prepareRun = useMutation({
    mutationFn: async () =>
      prepare({
        data: {
          fundId,
          periodKind: periodKind as any,
          periodEnd,
          ...(periodKind === "custom" ? { periodStart } : {}),
        },
      }),
    onSuccess: (result: any) => {
      toast.success(`Performance prepared for ${result.periodLabel}.`);
      refresh();
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const decideRun = useMutation({
    mutationFn: async (input: { runId: string; to: string }) =>
      decide({ data: { runId: input.runId, to: input.to as any } }),
    onSuccess: () => {
      toast.success("Performance report updated.");
      refresh();
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const amendRun = useMutation({
    mutationFn: async (runId: string) => amend({ data: { runId, reason: note } }),
    onSuccess: () => {
      toast.success("A superseding version has been prepared.");
      setNote("");
      refresh();
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const respondRun = useMutation({
    mutationFn: async (input: { runId: string; response: "acknowledged" | "challenged" }) =>
      respond({ data: { runId: input.runId, response: input.response, note } }),
    onSuccess: () => {
      toast.success("Your response has been recorded.");
      setNote("");
      refresh();
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const shareRun = useMutation({
    mutationFn: async (input: { runId: string; investorVisible: boolean }) =>
      setVisibility({ data: { runId: input.runId, investorVisible: input.investorVisible } }),
    onSuccess: () => {
      toast.success("Sharing updated.");
      refresh();
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const data = board.data ?? {};
  const run = detail.data?.run;
  const lines = detail.data?.lines ?? [];
  const exceptions = (run?.exceptions ?? []) as any[];
  const bridge = (run?.bridge ?? {}) as any;

  const detailCard = run ? (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">
          {run.fundName} — {run.period_label || `${run.period_start} to ${run.period_end}`}
        </CardTitle>
        <CardDescription>
          Version {run.version} · {label(run.status)} · methodology {run.methodology_version} ·{" "}
          {label(run.fund_type)}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Metric title="Beginning value" value={money(run.beginning_value_cents)} />
          <Metric title="Ending value" value={money(run.ending_value_cents)} />
          <Metric title="Gross return" value={pct(run.gross_return_bps)} note="Before fees and carry" />
          <Metric title="Net return" value={pct(run.net_return_bps)} note="After configured deductions" />
          <Metric
            title="IRR"
            value={run.irr_status === "solved" ? pct(run.irr_bps) : "—"}
            note={run.irr_status === "solved" ? "Dated cash flows" : label(run.irr_status)}
          />
          <Metric title="MOIC" value={times(run.moic)} note="Total value / paid-in" />
          <Metric title="TVPI" value={times(run.tvpi)} />
          <Metric title="DPI / RVPI" value={`${times(run.dpi)} / ${times(run.rvpi)}`} />
        </div>

        {Array.isArray(bridge.lines) && bridge.lines.length > 0 ? (
          <div>
            <p className="mb-2 text-sm font-medium">How the value changed</p>
            <div className="rounded-lg border border-border/60">
              {bridge.lines.map((line: any) => (
                <button
                  key={line.key}
                  type="button"
                  onClick={() => setMetricKey(line.key)}
                  className="flex w-full items-center justify-between border-b border-border/40 px-3 py-2 text-left text-sm last:border-b-0 hover:bg-muted/50"
                >
                  <span>
                    {line.sign === -1 ? "− " : line.sign === 1 ? "+ " : ""}
                    {line.label}
                  </span>
                  <span className="tabular-nums">{money(line.amountCents)}</span>
                </button>
              ))}
            </div>
            <p className="mt-2 text-xs text-muted-foreground">
              {bridge.reconciles
                ? "The bridge explains the change in value exactly."
                : `Unexplained difference of ${money(bridge.differenceCents)}.`}
            </p>
          </div>
        ) : null}

        {exceptions.length > 0 ? (
          <div className="space-y-2">
            <p className="text-sm font-medium">Exceptions</p>
            {exceptions.map((e, index) => (
              <div key={`${e.kind}-${index}`} className="flex items-start gap-2 text-sm">
                <Badge className={SEVERITY_TONE[e.severity] ?? "bg-muted"}>{label(e.severity)}</Badge>
                <span>{e.detail}</span>
              </div>
            ))}
          </div>
        ) : null}

        {lines.length > 0 ? (
          <div>
            <p className="mb-2 text-sm font-medium">Investor performance</p>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[640px] text-sm">
                <thead className="text-xs text-muted-foreground">
                  <tr className="border-b border-border/60 text-left">
                    <th className="py-2">Investor</th>
                    <th className="py-2 text-right">Paid in</th>
                    <th className="py-2 text-right">Value</th>
                    <th className="py-2 text-right">Distributions</th>
                    <th className="py-2 text-right">Net</th>
                    <th className="py-2 text-right">IRR</th>
                    <th className="py-2 text-right">MOIC</th>
                  </tr>
                </thead>
                <tbody>
                  {lines.map((line: any) => (
                    <tr key={line.id} className="border-b border-border/40">
                      <td className="py-2">
                        {line.display_name}
                        <span className="ml-2 text-xs text-muted-foreground">{label(line.capacity)}</span>
                      </td>
                      <td className="py-2 text-right tabular-nums">{money(line.paid_in_capital_cents)}</td>
                      <td className="py-2 text-right tabular-nums">{money(line.ending_capital_cents)}</td>
                      <td className="py-2 text-right tabular-nums">{money(line.realized_value_cents)}</td>
                      <td className="py-2 text-right tabular-nums">{pct(line.net_return_bps)}</td>
                      <td className="py-2 text-right tabular-nums">
                        {line.irr_status === "solved" ? pct(line.irr_bps) : label(line.irr_status)}
                      </td>
                      <td className="py-2 text-right tabular-nums">{times(line.moic)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        ) : null}

        {metricKey && provenance.data ? (
          <div className="rounded-lg border border-border/60 p-3 text-xs">
            <p className="mb-1 text-sm font-medium">Where “{label(metricKey)}” came from</p>
            <pre className="max-h-72 overflow-auto whitespace-pre-wrap break-words text-muted-foreground">
              {JSON.stringify(provenance.data, null, 2)}
            </pre>
          </div>
        ) : null}

        <div className="space-y-2">
          <Textarea
            placeholder={
              isStaff
                ? "Reason for an amendment, or a note for the record"
                : "Add a note if something looks wrong"
            }
            value={note}
            onChange={(event) => setNote(event.target.value)}
          />
          <div className="flex flex-wrap gap-2">
            {isStaff ? (
              <>
                {run.status === "published" ? (
                  <>
                    <Button size="sm" variant="outline" onClick={() => amendRun.mutate(run.id)}>
                      Amend with a new version
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() =>
                        shareRun.mutate({ runId: run.id, investorVisible: !run.investor_visible })
                      }
                    >
                      {run.investor_visible ? "Hide from investors" : "Share with investors"}
                    </Button>
                  </>
                ) : null}
              </>
            ) : (
              <>
                <Button
                  size="sm"
                  onClick={() => respondRun.mutate({ runId: run.id, response: "acknowledged" })}
                >
                  Acknowledge
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => respondRun.mutate({ runId: run.id, response: "challenged" })}
                >
                  Challenge
                </Button>
              </>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  ) : null;

  if (!isStaff) {
    return (
      <div className="space-y-4 p-4 sm:p-6">
        <div>
          <h1 className="text-xl font-semibold">Fund performance</h1>
          <p className="text-sm text-muted-foreground">
            Published performance for the funds you manage. Harmonious prepares and publishes these
            figures; you can acknowledge them or raise a challenge.
          </p>
        </div>
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Published periods</CardTitle>
          </CardHeader>
          <CardContent>
            {(data.runs ?? []).length === 0 ? (
              <p className="text-sm text-muted-foreground">Nothing has been published yet.</p>
            ) : (
              (data.runs ?? []).map((item: any) => (
                <RunRow key={item.id} run={item} onOpen={() => setOpenId(item.id)} />
              ))
            )}
          </CardContent>
        </Card>
        {detailCard}
      </div>
    );
  }

  const bucket = (title: string, runs: any[], next?: string, action?: string) => (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">{title}</CardTitle>
      </CardHeader>
      <CardContent>
        {runs.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nothing here.</p>
        ) : (
          runs.map((item: any) => (
            <RunRow
              key={item.id}
              run={item}
              onOpen={() => setOpenId(item.id)}
              actions={
                next ? (
                  <Button
                    size="sm"
                    onClick={() => decideRun.mutate({ runId: item.id, to: next })}
                  >
                    {action}
                  </Button>
                ) : undefined
              }
            />
          ))
        )}
      </CardContent>
    </Card>
  );

  return (
    <div className="space-y-4 p-4 sm:p-6">
      <div>
        <h1 className="text-xl font-semibold">Performance reporting</h1>
        <p className="text-sm text-muted-foreground">
          Return measures calculated from posted accounting, approved fund values and finalised
          investor capital. No figure is typed in by hand.
        </p>
      </div>

      <Tabs defaultValue="queue">
        <TabsList>
          <TabsTrigger value="queue">Work queue</TabsTrigger>
          <TabsTrigger value="published">Published</TabsTrigger>
          <TabsTrigger value="prepare">Prepare a period</TabsTrigger>
        </TabsList>

        <TabsContent value="queue" className="space-y-4 pt-4">
          {bucket("Awaiting review", data.awaitingReview ?? [], "review", "Send to review")}
          {bucket("Awaiting approval", data.awaitingApproval ?? [], "approved", "Approve")}
          {bucket("Ready to publish", data.readyToPublish ?? [], "published", "Publish")}
          {bucket("Manager challenges", data.challenges ?? [])}
          {bucket("Blocked by exceptions", data.exceptions ?? [])}
        </TabsContent>

        <TabsContent value="published" className="space-y-4 pt-4">
          {bucket("Published", data.published ?? [])}
          {bucket("Superseded", data.superseded ?? [])}
        </TabsContent>

        <TabsContent value="prepare" className="space-y-4 pt-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Prepare performance</CardTitle>
              <CardDescription>
                Pick a fund and a period. Everything else is read from the approved records.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex flex-wrap gap-2">
                {(data.funds ?? []).map((fund: any) => (
                  <Button
                    key={fund.id}
                    size="sm"
                    variant={fundId === fund.id ? "default" : "outline"}
                    onClick={() => setFundId(fund.id)}
                  >
                    {fund.name}
                  </Button>
                ))}
              </div>
              <div className="flex flex-wrap gap-2">
                {["month", "quarter", "year", "year_to_date", "inception_to_date", "custom"].map(
                  (kind) => (
                    <Button
                      key={kind}
                      size="sm"
                      variant={periodKind === kind ? "default" : "outline"}
                      onClick={() => setPeriodKind(kind)}
                    >
                      {label(kind)}
                    </Button>
                  ),
                )}
              </div>
              <div className="grid gap-2 sm:grid-cols-2">
                {periodKind === "custom" ? (
                  <Input
                    type="date"
                    value={periodStart}
                    onChange={(event) => setPeriodStart(event.target.value)}
                  />
                ) : null}
                <Input
                  type="date"
                  value={periodEnd}
                  onChange={(event) => setPeriodEnd(event.target.value)}
                />
              </div>
              <Button disabled={!fundId || prepareRun.isPending} onClick={() => prepareRun.mutate()}>
                Prepare performance
              </Button>
            </CardContent>
          </Card>
          {bucket("Prepared, awaiting review", data.awaitingReview ?? [], "review", "Send to review")}
        </TabsContent>
      </Tabs>

      {detailCard}
    </div>
  );
}
