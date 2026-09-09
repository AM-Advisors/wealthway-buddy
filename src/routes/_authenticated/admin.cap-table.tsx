import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import {
  getCapTableEditor,
  listCapTableFunds,
  saveCapPosition,
  type CapTableEditorRow,
} from "@/lib/cap-table.functions";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { Textarea } from "@/components/ui/textarea";

export const Route = createFileRoute("/_authenticated/admin/cap-table")({
  head: () => ({
    meta: [
      { title: "Cap Table — Harmonious Admin" },
      {
        name: "description",
        content:
          "Edit each investor's shares, committed capital and ownership percentage for a fund, with live totals.",
      },
      { property: "og:title", content: "Cap Table — Harmonious Admin" },
      {
        property: "og:description",
        content: "Investor ownership, shares and committed capital for each Harmonious fund.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: CapTablePage,
});

function money(cents?: number | null) {
  if (!cents) return "$0";
  return `$${Math.round(cents / 100).toLocaleString("en-US")}`;
}

function share(value: number) {
  if (!value) return "0%";
  return `${value < 0.01 ? value.toFixed(4) : value.toFixed(2)}%`;
}

function CapTablePage() {
  const loadFunds = useServerFn(listCapTableFunds);
  const loadTable = useServerFn(getCapTableEditor);
  const save = useServerFn(saveCapPosition);
  const queryClient = useQueryClient();

  const [fundId, setFundId] = useState<string>("");
  const [editing, setEditing] = useState<CapTableEditorRow | null>(null);
  const [form, setForm] = useState({
    shares: "",
    share_class: "LP interest",
    ownership_pct_override: "",
    commitment: "",
    notes: "",
  });

  const fundsQuery = useQuery({ queryKey: ["cap-table-funds"], queryFn: () => loadFunds() });
  const funds = fundsQuery.data?.funds ?? [];

  useEffect(() => {
    if (!fundId && funds.length > 0) setFundId(funds[0]!.id as string);
  }, [funds, fundId]);

  const tableQuery = useQuery({
    queryKey: ["cap-table-editor", fundId],
    queryFn: () => loadTable({ data: { offering_id: fundId } }),
    enabled: Boolean(fundId),
    refetchInterval: 60_000,
  });

  const saveMutation = useMutation({
    mutationFn: (input: Parameters<typeof save>[0]["data"]) => save({ data: input }),
    onSuccess: () => {
      toast.success("Cap table updated.");
      setEditing(null);
      void queryClient.invalidateQueries({ queryKey: ["cap-table-editor", fundId] });
    },
    onError: (e: unknown) => toast.error(e instanceof Error ? e.message : "Could not save."),
  });

  function openEditor(row: CapTableEditorRow) {
    setEditing(row);
    setForm({
      shares: row.shares == null ? "" : String(row.shares),
      share_class: row.share_class,
      ownership_pct_override:
        row.ownership_pct_override == null ? "" : String(row.ownership_pct_override),
      commitment: row.commitment_cents ? String(Math.round(row.commitment_cents / 100)) : "",
      notes: row.notes ?? "",
    });
  }

  function submit() {
    if (!editing) return;
    const sharesValue = form.shares.trim() === "" ? null : Number(form.shares);
    const overrideValue =
      form.ownership_pct_override.trim() === "" ? null : Number(form.ownership_pct_override);
    const commitmentValue =
      form.commitment.trim() === "" ? null : Math.round(Number(form.commitment) * 100);

    if (sharesValue != null && (!Number.isFinite(sharesValue) || sharesValue < 0)) {
      toast.error("Shares must be a positive number.");
      return;
    }
    if (
      overrideValue != null &&
      (!Number.isFinite(overrideValue) || overrideValue < 0 || overrideValue > 100)
    ) {
      toast.error("Ownership must be between 0 and 100.");
      return;
    }
    if (commitmentValue != null && (!Number.isFinite(commitmentValue) || commitmentValue < 0)) {
      toast.error("Committed capital must be a positive amount.");
      return;
    }

    saveMutation.mutate({
      application_id: editing.application_id,
      offering_id: fundId,
      shares: sharesValue,
      share_class: form.share_class.trim() || "LP interest",
      ownership_pct_override: overrideValue,
      notes: form.notes.trim() === "" ? null : form.notes.trim(),
      commitment_cents: commitmentValue,
    });
  }

  const data = tableQuery.data;
  const totals = data?.totals;
  const target = data?.offering.target_raise_cents ?? 0;
  const raisedPct = target ? Math.min(100, ((totals?.committed_cents ?? 0) / target) * 100) : 0;

  return (
    <div className="container mx-auto max-w-6xl px-4 py-10">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl">Cap table</h1>
          <p className="text-muted-foreground">
            Shares, committed capital and ownership for every investor in a fund.
          </p>
        </div>
        <Button asChild variant="outline" size="sm">
          <Link to="/admin">Back to admin</Link>
        </Button>
      </div>

      <div className="mt-6 flex flex-wrap items-center gap-2">
        {fundsQuery.isLoading ? <p className="text-sm text-muted-foreground">Loading funds…</p> : null}
        {funds.map((f: any) => (
          <Button
            key={f.id}
            size="sm"
            variant={f.id === fundId ? "default" : "outline"}
            onClick={() => setFundId(f.id)}
          >
            {f.name}
          </Button>
        ))}
        {!fundsQuery.isLoading && funds.length === 0 ? (
          <p className="text-sm text-muted-foreground">No funds are assigned to you yet.</p>
        ) : null}
      </div>

      {fundId ? (
        <Card className="mt-6">
          <CardHeader>
            <CardTitle>{data?.offering.name ?? "Fund"}</CardTitle>
            <CardDescription>
              {tableQuery.isLoading
                ? "Loading…"
                : `${totals?.investors ?? 0} investor${(totals?.investors ?? 0) === 1 ? "" : "s"} · ${money(
                    totals?.committed_cents,
                  )} committed · ${money(totals?.funded_cents)} received${
                    totals?.shares ? ` · ${totals.shares.toLocaleString("en-US")} shares` : ""
                  }`}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-5">
            {target ? (
              <div className="space-y-1">
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Against a {money(target)} target</span>
                  <span className="font-medium">{raisedPct.toFixed(1)}%</span>
                </div>
                <Progress value={raisedPct} />
              </div>
            ) : null}

            {tableQuery.error ? (
              <p className="text-sm text-destructive">
                {tableQuery.error instanceof Error
                  ? tableQuery.error.message
                  : "Could not load this cap table."}
              </p>
            ) : null}

            {(data?.rows.length ?? 0) === 0 && !tableQuery.isLoading ? (
              <p className="text-sm text-muted-foreground">
                No investor positions yet. They appear as investors commit to this fund.
              </p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b text-left text-muted-foreground">
                      <th className="py-2 pr-3 font-medium">Investor</th>
                      <th className="py-2 pr-3 font-medium">Class</th>
                      <th className="py-2 pr-3 font-medium">Shares</th>
                      <th className="py-2 pr-3 font-medium">Committed</th>
                      <th className="py-2 pr-3 font-medium">Received</th>
                      <th className="py-2 pr-3 font-medium">Ownership</th>
                      <th className="py-2 font-medium" />
                    </tr>
                  </thead>
                  <tbody>
                    {(data?.rows ?? []).map((row) => (
                      <tr key={row.application_id} className="border-b last:border-0 align-top">
                        <td className="py-2 pr-3">
                          <p className="font-medium">{row.name}</p>
                          <p className="text-xs text-muted-foreground">{row.email}</p>
                          {row.funding_status === "settled" ? (
                            <Badge variant="secondary" className="mt-1">
                              Funded
                            </Badge>
                          ) : null}
                        </td>
                        <td className="py-2 pr-3">{row.share_class}</td>
                        <td className="py-2 pr-3">
                          {row.shares == null ? "—" : row.shares.toLocaleString("en-US")}
                        </td>
                        <td className="py-2 pr-3">{money(row.commitment_cents)}</td>
                        <td className="py-2 pr-3">{money(row.funded_cents)}</td>
                        <td className="py-2 pr-3">
                          <span className="font-medium">{share(row.ownership_pct)}</span>
                          {row.ownership_pct_override != null ? (
                            <p className="text-xs text-muted-foreground">Set by hand</p>
                          ) : null}
                        </td>
                        <td className="py-2 text-right">
                          <Button size="sm" variant="outline" onClick={() => openEditor(row)}>
                            Edit
                          </Button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  {data && data.rows.length > 0 ? (
                    <tfoot>
                      <tr className="font-medium">
                        <td className="py-2 pr-3">Total</td>
                        <td className="py-2 pr-3" />
                        <td className="py-2 pr-3">
                          {totals?.shares ? totals.shares.toLocaleString("en-US") : "—"}
                        </td>
                        <td className="py-2 pr-3">{money(totals?.committed_cents)}</td>
                        <td className="py-2 pr-3">{money(totals?.funded_cents)}</td>
                        <td className="py-2 pr-3">{share(totals?.ownership_pct ?? 0)}</td>
                        <td />
                      </tr>
                    </tfoot>
                  ) : null}
                </table>
              </div>
            )}
          </CardContent>
        </Card>
      ) : null}

      <Dialog open={Boolean(editing)} onOpenChange={(open) => (open ? null : setEditing(null))}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{editing?.name}</DialogTitle>
            <DialogDescription>
              Leave ownership blank to let it follow shares, or committed capital when no shares are
              recorded.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1">
              <Label htmlFor="shares">Shares / units</Label>
              <Input
                id="shares"
                inputMode="decimal"
                value={form.shares}
                onChange={(e) => setForm((f) => ({ ...f, shares: e.target.value }))}
                placeholder="e.g. 250000"
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="share_class">Class</Label>
              <Input
                id="share_class"
                value={form.share_class}
                onChange={(e) => setForm((f) => ({ ...f, share_class: e.target.value }))}
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="commitment">Committed capital ($)</Label>
              <Input
                id="commitment"
                inputMode="decimal"
                value={form.commitment}
                onChange={(e) => setForm((f) => ({ ...f, commitment: e.target.value }))}
                placeholder="e.g. 250000"
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="ownership">Ownership % (optional)</Label>
              <Input
                id="ownership"
                inputMode="decimal"
                value={form.ownership_pct_override}
                onChange={(e) =>
                  setForm((f) => ({ ...f, ownership_pct_override: e.target.value }))
                }
                placeholder="Leave blank to calculate"
              />
            </div>
            <div className="space-y-1 sm:col-span-2">
              <Label htmlFor="notes">Notes</Label>
              <Textarea
                id="notes"
                rows={3}
                value={form.notes}
                onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditing(null)}>
              Cancel
            </Button>
            <Button onClick={submit} disabled={saveMutation.isPending}>
              {saveMutation.isPending ? "Saving…" : "Save"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
