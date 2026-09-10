import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";

import { RetentionList } from "@/components/retention-list";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  closeOffboardingCase,
  exportClientData,
  getOffboardingCase,
  recordExportDelivery,
  saveSettlementLine,
  seedSettlementLines,
  updateOffboardingCase,
} from "@/lib/offboarding.functions";

const STAGE_OPTIONS = [
  { value: "open", label: "Notice received" },
  { value: "winding_down", label: "Winding down" },
  { value: "settlement", label: "Final settlement" },
  { value: "data_delivered", label: "Data delivered" },
];

const STATE_OPTIONS = [
  { value: "open", label: "Still open" },
  { value: "settled", label: "Settled" },
  { value: "waived", label: "Waived" },
  { value: "disputed", label: "Disputed" },
];

const money = (cents: number | null) =>
  cents === null || cents === undefined
    ? "—"
    : (cents / 100).toLocaleString("en-US", { style: "currency", currency: "USD" });

function saveCsv(name: string, content: string) {
  const blob = new Blob([content], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = name;
  link.click();
  URL.revokeObjectURL(url);
}

/** One client's termination: dates, amounts, export and retained records. */
export function OffboardingCase({ caseId }: { caseId: string }) {
  const queryClient = useQueryClient();
  const load = useServerFn(getOffboardingCase);
  const update = useServerFn(updateOffboardingCase);
  const seed = useServerFn(seedSettlementLines);
  const saveLine = useServerFn(saveSettlementLine);
  const recordExport = useServerFn(recordExportDelivery);
  const runExport = useServerFn(exportClientData);
  const close = useServerFn(closeOffboardingCase);

  const { data, isLoading, error } = useQuery({
    queryKey: ["offboarding-case", caseId],
    queryFn: () => load({ data: { id: caseId } }),
    retry: false,
  });

  const [endDate, setEndDate] = useState("");
  const [endReason, setEndReason] = useState("");
  const [deliveredOn, setDeliveredOn] = useState(new Date().toISOString().slice(0, 10));
  const [method, setMethod] = useState("Secure download link");
  const [recipient, setRecipient] = useState("");
  const [contents, setContents] = useState("");

  const refresh = () => queryClient.invalidateQueries({ queryKey: ["offboarding-case", caseId] });
  const fail = (e: any) => toast.error(e?.message ?? "That could not be saved.");

  const stage = useMutation({
    mutationFn: (status: string) => update({ data: { id: caseId, status: status as any } }),
    onSuccess: () => {
      toast.success("Stage updated.");
      refresh();
    },
    onError: fail,
  });

  const changeEnd = useMutation({
    mutationFn: () =>
      update({ data: { id: caseId, effectiveEndDate: endDate, endDateReason: endReason } }),
    onSuccess: () => {
      toast.success("End date updated.");
      setEndReason("");
      refresh();
    },
    onError: fail,
  });

  const buildList = useMutation({
    mutationFn: () => seed({ data: { id: caseId } }),
    onSuccess: () => {
      toast.success("Settlement list built from the client's agreed rates.");
      refresh();
    },
    onError: fail,
  });

  const decide = useMutation({
    mutationFn: (input: { key: string; state: string; note: string }) =>
      saveLine({
        data: { id: caseId, key: input.key, state: input.state as any, note: input.note || undefined },
      }),
    onSuccess: () => {
      toast.success("Recorded.");
      refresh();
    },
    onError: fail,
  });

  const deliver = useMutation({
    mutationFn: () =>
      recordExport({ data: { id: caseId, deliveredOn, method, recipient, contents: contents || undefined } }),
    onSuccess: () => {
      toast.success("Delivery recorded.");
      refresh();
    },
    onError: fail,
  });

  const download = useMutation({
    mutationFn: () => runExport({ data: { clientId: data!.case.clientId } }),
    onSuccess: (result: any) => {
      const slug = String(result.clientName).toLowerCase().replace(/[^a-z0-9]+/g, "-");
      for (const file of result.files) saveCsv(`${slug}-${file.name}`, file.content);
      toast.success("Export downloaded.");
    },
    onError: fail,
  });

  const finish = useMutation({
    mutationFn: () => close({ data: { id: caseId } }),
    onSuccess: () => {
      toast.success("Termination closed.");
      refresh();
    },
    onError: fail,
  });

  if (isLoading) return <p className="text-sm text-muted-foreground">Loading…</p>;
  if (error || !data)
    return (
      <p className="text-sm text-muted-foreground">
        {(error as any)?.message ?? "That termination record is not available."}
      </p>
    );

  const c = data.case;
  const canManage = data.canManage && c.status !== "closed";
  const openTotal = c.settlement
    .filter((l) => l.state === "open")
    .reduce((sum, l) => sum + (l.amountCents ?? 0), 0);

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-center gap-2">
            <CardTitle>{c.clientName}</CardTitle>
            <Badge variant={c.status === "closed" ? "secondary" : "default"}>
              {STAGE_OPTIONS.find((s) => s.value === c.status)?.label ?? "Closed"}
            </Badge>
            <Badge variant="outline">
              Notice from {c.initiatedBy === "harmonious" ? "Harmonious" : "the client"}
            </Badge>
          </div>
          <CardDescription>
            {c.sow
              ? `${c.sow.title} · ${c.sow.sowType} · ${c.sow.noticeDays}-day notice${
                  c.sow.effectiveDate ? ` · effective ${c.sow.effectiveDate}` : ""
                }`
              : "Whole engagement — no single statement of work identified."}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-3">
            <div>
              <p className="text-xs text-muted-foreground">Notice received</p>
              <p className="font-medium">{c.noticeReceivedOn ?? "—"}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Services end</p>
              <p className="font-medium">{c.effectiveEndDate ?? "—"}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Notice period</p>
              <p className="font-medium">{c.noticeDays} days</p>
            </div>
          </div>

          {c.status !== "closed" && c.daysRemaining !== null ? (
            <div className="rounded-lg border p-3 text-sm">
              {c.daysRemaining >= 0
                ? `${c.daysRemaining} days remain in the notice period.`
                : `The notice period ended ${Math.abs(c.daysRemaining)} days ago. Close out the remaining steps.`}
            </div>
          ) : null}
          {c.endDateReason ? (
            <p className="text-sm text-muted-foreground">End date changed: {c.endDateReason}</p>
          ) : null}
          {c.note ? <p className="text-sm text-muted-foreground">{c.note}</p> : null}

          {canManage ? (
            <div className="grid gap-3 md:grid-cols-4">
              <div className="space-y-1">
                <Label>Stage</Label>
                <Select value={c.status} onValueChange={(v) => stage.mutate(v)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {STAGE_OPTIONS.map((s) => (
                      <SelectItem key={s.value} value={s.value}>
                        {s.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label>New end date</Label>
                <Input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
              </div>
              <div className="space-y-1 md:col-span-2">
                <Label>Reason for the change</Label>
                <div className="flex gap-2">
                  <Input value={endReason} onChange={(e) => setEndReason(e.target.value)} />
                  <Button
                    variant="secondary"
                    disabled={!endDate || !endReason.trim() || changeEnd.isPending}
                    onClick={() => changeEnd.mutate()}
                  >
                    Save
                  </Button>
                </div>
              </div>
            </div>
          ) : null}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <CardTitle>Outstanding amounts</CardTitle>
              <CardDescription>
                Built from the client's agreed rates. Recording a decision here settles the record
                of what the team confirmed; nothing is invoiced or charged from this page.
              </CardDescription>
            </div>
            {canManage ? (
              <Button variant="outline" disabled={buildList.isPending} onClick={() => buildList.mutate()}>
                {c.settlement.length ? "Refresh from rates" : "Build from agreed rates"}
              </Button>
            ) : null}
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          {c.settlement.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              {data.rates.length
                ? "No lines yet — build the list from the client's agreed rates."
                : "This client has no agreed rates recorded, so there is nothing to settle."}
            </p>
          ) : null}
          {c.settlement.map((line) => (
            <SettlementRow
              key={line.key}
              line={line}
              canManage={canManage}
              pending={decide.isPending}
              onSave={(state, note) => decide.mutate({ key: line.key, state, note })}
            />
          ))}
          {c.settlement.length ? (
            <p className="text-sm font-medium">Still open: {money(openTotal)}</p>
          ) : null}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Data export</CardTitle>
          <CardDescription>
            Download the client's records, then record how and when the package was delivered.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <Button variant="outline" disabled={download.isPending} onClick={() => download.mutate()}>
            Download the client's records
          </Button>

          {c.exportDelivery ? (
            <div className="rounded-lg border p-3 text-sm">
              Delivered {c.exportDelivery.deliveredOn} by {c.exportDelivery.method} to{" "}
              {c.exportDelivery.recipient}.
              {c.exportDelivery.contents ? ` ${c.exportDelivery.contents}` : ""}
            </div>
          ) : null}

          {canManage ? (
            <div className="grid gap-3 md:grid-cols-2">
              <div className="space-y-1">
                <Label>Delivered on</Label>
                <Input
                  type="date"
                  value={deliveredOn}
                  onChange={(e) => setDeliveredOn(e.target.value)}
                />
              </div>
              <div className="space-y-1">
                <Label>How it was sent</Label>
                <Input value={method} onChange={(e) => setMethod(e.target.value)} />
              </div>
              <div className="space-y-1">
                <Label>Sent to</Label>
                <Input
                  value={recipient}
                  onChange={(e) => setRecipient(e.target.value)}
                  placeholder="Name and email"
                />
              </div>
              <div className="space-y-1">
                <Label>What was included</Label>
                <Textarea value={contents} onChange={(e) => setContents(e.target.value)} rows={2} />
              </div>
              <div>
                <Button
                  disabled={!recipient.trim() || !method.trim() || deliver.isPending}
                  onClick={() => deliver.mutate()}
                >
                  Record delivery
                </Button>
              </div>
            </div>
          ) : null}
        </CardContent>
      </Card>

      <RetentionList
        caseId={caseId}
        clientId={c.clientId}
        records={c.retention}
        reviewedAt={c.retentionReviewedAt}
        canManage={canManage}
      />

      <Card>
        <CardHeader>
          <CardTitle>Close out</CardTitle>
          <CardDescription>
            A termination closes once amounts are settled, the export delivery is recorded and the
            retained-records list is confirmed.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {c.status === "closed" ? (
            <p className="text-sm">
              Closed{c.closedAt ? ` on ${new Date(c.closedAt).toLocaleDateString("en-US")}` : ""}.
            </p>
          ) : (
            <>
              {c.blockers.length ? (
                <ul className="list-disc pl-5 text-sm text-muted-foreground">
                  {c.blockers.map((b) => (
                    <li key={b}>{b}</li>
                  ))}
                </ul>
              ) : (
                <p className="text-sm text-muted-foreground">Everything is ready.</p>
              )}
              {data.canManage ? (
                <Button
                  disabled={c.blockers.length > 0 || finish.isPending}
                  onClick={() => finish.mutate()}
                >
                  Close this termination
                </Button>
              ) : null}
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function SettlementRow({
  line,
  canManage,
  pending,
  onSave,
}: {
  line: { key: string; label: string; basis: string | null; amountCents: number | null; state: string; note: string | null };
  canManage: boolean;
  pending: boolean;
  onSave: (state: string, note: string) => void;
}) {
  const [state, setState] = useState(line.state);
  const [note, setNote] = useState(line.note ?? "");

  return (
    <div className="rounded-lg border p-3 space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-medium">{line.label}</span>
        {line.basis ? <Badge variant="outline">{line.basis.replace(/_/g, " ")}</Badge> : null}
        <Badge variant={line.state === "open" ? "default" : "secondary"}>
          {STATE_OPTIONS.find((s) => s.value === line.state)?.label ?? line.state}
        </Badge>
        <span className="ml-auto font-medium">{money(line.amountCents)}</span>
      </div>
      {line.note ? <p className="text-sm text-muted-foreground">{line.note}</p> : null}
      {canManage ? (
        <div className="flex flex-wrap items-end gap-2">
          <Select value={state} onValueChange={setState}>
            <SelectTrigger className="w-44">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {STATE_OPTIONS.map((s) => (
                <SelectItem key={s.value} value={s.value}>
                  {s.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Input
            className="flex-1 min-w-48"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Note (required to waive or dispute)"
          />
          <Button variant="secondary" disabled={pending} onClick={() => onSave(state, note)}>
            Save
          </Button>
        </div>
      ) : null}
    </div>
  );
}
