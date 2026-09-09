import { Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";

import {
  getCapTableBoard,
  saveCapPosition,
  type CapPositionInput,
  type CapTableEditorRow,
} from "@/lib/cap-table.functions";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";

function money(cents?: number | null) {
  if (!cents) return "$0";
  return `$${Math.round(cents / 100).toLocaleString("en-US")}`;
}

function share(value: number) {
  if (!value) return "0%";
  return `${value < 0.01 ? value.toFixed(4) : value.toFixed(2)}%`;
}

type Draft = { commitment: string; shares: string; ownership: string; fee: string };

function draftFrom(row: CapTableEditorRow): Draft {
  return {
    commitment: row.commitment_cents ? String(Math.round(row.commitment_cents / 100)) : "",
    shares: row.shares == null ? "" : String(row.shares),
    ownership: row.ownership_pct_override == null ? "" : String(row.ownership_pct_override),
    fee:
      row.wire_fee_override_cents == null ? "" : String(row.wire_fee_override_cents / 100),
  };
}

export function CapTableBoard({ backTo }: { backTo: "/admin" | "/manager" }) {
  const loadBoard = useServerFn(getCapTableBoard);
  const save = useServerFn(saveCapPosition);
  const queryClient = useQueryClient();

  const [drafts, setDrafts] = useState<Record<string, Draft>>({});
  const [savingId, setSavingId] = useState<string | null>(null);
  const [search, setSearch] = useState("");

  const boardQuery = useQuery({
    queryKey: ["cap-table-board"],
    queryFn: () => loadBoard(),
    refetchInterval: 60_000,
  });

  const saveMutation = useMutation({
    mutationFn: (input: CapPositionInput) => save({ data: input }),
    onSuccess: (_r, input) => {
      toast.success("Cap table updated.");
      setDrafts((d) => {
        const next = { ...d };
        delete next[input.application_id];
        return next;
      });
      void queryClient.invalidateQueries({ queryKey: ["cap-table-board"] });
      void queryClient.invalidateQueries({ queryKey: ["cap-table-editor"] });
    },
    onError: (e: unknown) => toast.error(e instanceof Error ? e.message : "Could not save."),
    onSettled: () => setSavingId(null),
  });

  function setField(row: CapTableEditorRow, field: keyof Draft, value: string) {
    setDrafts((d) => ({
      ...d,
      [row.application_id]: { ...(d[row.application_id] ?? draftFrom(row)), [field]: value },
    }));
  }

  function submit(row: CapTableEditorRow, offeringId: string) {
    const draft = drafts[row.application_id];
    if (!draft) return;
    const shares = draft.shares.trim() === "" ? null : Number(draft.shares);
    const ownership = draft.ownership.trim() === "" ? null : Number(draft.ownership);
    const commitment =
      draft.commitment.trim() === "" ? null : Math.round(Number(draft.commitment) * 100);

    if (shares != null && (!Number.isFinite(shares) || shares < 0)) {
      toast.error("Shares must be a positive number.");
      return;
    }
    if (ownership != null && (!Number.isFinite(ownership) || ownership < 0 || ownership > 100)) {
      toast.error("Ownership must be between 0 and 100.");
      return;
    }
    if (commitment != null && (!Number.isFinite(commitment) || commitment < 0)) {
      toast.error("Committed amount must be a positive number.");
      return;
    }
    const fee = draft.fee.trim() === "" ? null : Math.round(Number(draft.fee) * 100);
    if (fee != null && (!Number.isFinite(fee) || fee < 0)) {
      toast.error("The wire fee must be a positive number.");
      return;
    }

    setSavingId(row.application_id);
    saveMutation.mutate({
      application_id: row.application_id,
      offering_id: offeringId,
      shares,
      share_class: row.share_class || "LP interest",
      ownership_pct_override: ownership,
      notes: row.notes,
      commitment_cents: commitment ?? 0,
      wire_fee_cents: fee,
    });
  }

  const funds = boardQuery.data?.funds ?? [];
  const term = search.trim().toLowerCase();
  const grand = funds.reduce(
    (acc, f) => ({
      committed: acc.committed + f.totals.committed_cents,
      funded: acc.funded + f.totals.funded_cents,
      investors: acc.investors + f.totals.investors,
    }),
    { committed: 0, funded: 0, investors: 0 },
  );

  return (
    <main className="mx-auto w-full max-w-6xl space-y-6 px-4 py-8">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Cap table board</h1>
          <p className="text-muted-foreground text-sm">
            Every fund, every investor: committed, received and share of the fund. Edit any number
            in place.
          </p>
        </div>
        <Button asChild variant="outline" size="sm">
          <Link to={backTo}>Back</Link>
        </Button>
      </div>

      <div className="grid gap-3 sm:grid-cols-4">
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Funds</CardDescription>
            <CardTitle className="text-2xl">{funds.length}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Investors</CardDescription>
            <CardTitle className="text-2xl">{grand.investors}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Committed</CardDescription>
            <CardTitle className="text-2xl">{money(grand.committed)}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Received</CardDescription>
            <CardTitle className="text-2xl">{money(grand.funded)}</CardTitle>
          </CardHeader>
        </Card>
      </div>

      <Input
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        placeholder="Search an investor or fund"
        className="max-w-sm"
      />

      {boardQuery.isLoading ? (
        <p className="text-muted-foreground text-sm">Loading the cap tables…</p>
      ) : funds.length === 0 ? (
        <Card>
          <CardContent className="py-10 text-center text-sm text-muted-foreground">
            No funds are assigned to you yet.
          </CardContent>
        </Card>
      ) : null}

      {funds
        .filter(
          (fund) =>
            !term ||
            fund.offering.name.toLowerCase().includes(term) ||
            fund.rows.some(
              (r) =>
                r.name.toLowerCase().includes(term) ||
                (r.email ?? "").toLowerCase().includes(term),
            ),
        )
        .map((fund) => {
          const rows = fund.rows.filter(
            (r) =>
              !term ||
              fund.offering.name.toLowerCase().includes(term) ||
              r.name.toLowerCase().includes(term) ||
              (r.email ?? "").toLowerCase().includes(term),
          );
          const target = fund.offering.target_raise_cents ?? 0;
          const progress = target > 0 ? Math.min(100, (fund.totals.funded_cents / target) * 100) : 0;

          return (
            <Card key={fund.offering.id}>
              <CardHeader className="gap-2">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <CardTitle className="text-lg">{fund.offering.name}</CardTitle>
                  <div className="flex items-center gap-2">
                    {fund.offering.reg_type ? (
                      <Badge variant="secondary">Reg D {fund.offering.reg_type}</Badge>
                    ) : null}
                    <Badge variant="outline">{fund.totals.investors} investors</Badge>
                  </div>
                </div>
                <CardDescription>
                  {money(fund.totals.committed_cents)} committed · {money(fund.totals.funded_cents)}{" "}
                  received
                  {target > 0 ? ` · target ${money(target)}` : ""}
                </CardDescription>
                {target > 0 ? <Progress value={progress} className="h-2" /> : null}
              </CardHeader>
              <CardContent className="overflow-x-auto">
                {rows.length === 0 ? (
                  <p className="text-muted-foreground text-sm">No investors in this fund yet.</p>
                ) : (
                  <table className="w-full min-w-[1040px] text-sm">
                    <thead>
                      <tr className="text-muted-foreground border-b text-left">
                        <th className="py-2 pr-3 font-medium">Investor</th>
                        <th className="py-2 pr-3 font-medium">Committed ($)</th>
                        <th className="py-2 pr-3 font-medium">Received</th>
                        <th className="py-2 pr-3 font-medium">Wire fee ($)</th>
                        <th className="py-2 pr-3 font-medium">Net received</th>
                        <th className="py-2 pr-3 font-medium">Shares</th>
                        <th className="py-2 pr-3 font-medium">Share %</th>
                        <th className="py-2 pr-3 font-medium text-right">Save</th>
                      </tr>
                    </thead>
                    <tbody>
                      {rows.map((row) => {
                        const draft = drafts[row.application_id];
                        const current = draft ?? draftFrom(row);
                        const dirty = Boolean(draft);
                        return (
                          <tr key={row.application_id} className="border-b last:border-0">
                            <td className="py-2 pr-3">
                              <div className="font-medium">{row.name}</div>
                              <div className="text-muted-foreground text-xs">
                                {row.email ?? "No email"} · {row.status.replace(/_/g, " ")}
                              </div>
                            </td>
                            <td className="py-2 pr-3">
                              <Input
                                value={current.commitment}
                                inputMode="decimal"
                                onChange={(e) => setField(row, "commitment", e.target.value)}
                                className="h-8 w-28"
                              />
                            </td>
                            <td className="py-2 pr-3 whitespace-nowrap">
                              {money(row.funded_cents)}
                            </td>
                            <td className="py-2 pr-3">
                              <Input
                                value={current.fee}
                                inputMode="decimal"
                                placeholder={String(
                                  Math.round((fund.offering.wire_fee_cents ?? 0) / 100),
                                )}
                                onChange={(e) => setField(row, "fee", e.target.value)}
                                className="h-8 w-24"
                              />
                              <div className="text-muted-foreground mt-1 text-xs">
                                {row.wire_fee_override_cents == null
                                  ? "Fund rate"
                                  : `Own rate ${money(row.wire_fee_cents)}`}
                              </div>
                            </td>
                            <td className="py-2 pr-3 whitespace-nowrap">
                              {money(row.net_received_cents)}
                            </td>
                            <td className="py-2 pr-3">
                              <Input
                                value={current.shares}
                                inputMode="decimal"
                                placeholder="—"
                                onChange={(e) => setField(row, "shares", e.target.value)}
                                className="h-8 w-24"
                              />
                            </td>
                            <td className="py-2 pr-3">
                              <div className="flex items-center gap-2">
                                <Input
                                  value={current.ownership}
                                  inputMode="decimal"
                                  placeholder={share(row.ownership_pct)}
                                  onChange={(e) => setField(row, "ownership", e.target.value)}
                                  className="h-8 w-24"
                                />
                                <span className="text-muted-foreground text-xs whitespace-nowrap">
                                  now {share(row.ownership_pct)}
                                </span>
                              </div>
                            </td>
                            <td className="py-2 pr-3 text-right">
                              <Button
                                size="sm"
                                variant={dirty ? "default" : "outline"}
                                disabled={!dirty || savingId === row.application_id}
                                onClick={() => submit(row, fund.offering.id)}
                              >
                                {savingId === row.application_id ? "Saving…" : "Save"}
                              </Button>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                    <tfoot>
                      <tr className="font-medium">
                        <td className="py-2 pr-3">Totals</td>
                        <td className="py-2 pr-3">{money(fund.totals.committed_cents)}</td>
                        <td className="py-2 pr-3">{money(fund.totals.funded_cents)}</td>
                        <td className="py-2 pr-3">{money(fund.totals.wire_fees_cents)}</td>
                        <td className="py-2 pr-3">{money(fund.totals.net_received_cents)}</td>
                        <td className="py-2 pr-3">{fund.totals.shares || "—"}</td>
                        <td className="py-2 pr-3">{share(fund.totals.ownership_pct)}</td>
                        <td />
                      </tr>
                    </tfoot>
                  </table>
                )}
              </CardContent>
            </Card>
          );
        })}
    </main>
  );
}
