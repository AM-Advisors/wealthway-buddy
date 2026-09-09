import { useState } from "react";

import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import { listCapTable, removeCapTableRow, saveCapTableRow } from "@/lib/diligence.functions";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const HOLDER_TYPES = [
  { value: "founder", label: "Founder" },
  { value: "investor", label: "Investor" },
  { value: "lp", label: "Limited partner" },
  { value: "gp", label: "General partner" },
  { value: "employee_pool", label: "Option pool" },
  { value: "other", label: "Other" },
] as const;

type Draft = {
  id?: string;
  holder_name: string;
  holder_type: string;
  security_type: string;
  shares: string;
  ownership_pct: string;
  fully_diluted_pct: string;
  notes: string;
};

const emptyDraft: Draft = {
  holder_name: "",
  holder_type: "investor",
  security_type: "Common",
  shares: "",
  ownership_pct: "",
  fully_diluted_pct: "",
  notes: "",
};

function num(value: string): number | null {
  const cleaned = value.replace(/[, %$]/g, "").trim();
  if (!cleaned) return null;
  const parsed = Number(cleaned);
  return Number.isFinite(parsed) ? parsed : null;
}

function fmt(value: number | null | undefined, suffix = "") {
  if (value === null || value === undefined) return "—";
  return `${Number(value).toLocaleString(undefined, { maximumFractionDigits: 2 })}${suffix}`;
}

function holderLabel(value: string) {
  return HOLDER_TYPES.find((h) => h.value === value)?.label ?? value;
}

/** Live capitalization for a fund or company, read straight from the platform. */
export function CapTableSection({ offeringId }: { offeringId: string }) {
  const queryClient = useQueryClient();
  const list = useServerFn(listCapTable);
  const save = useServerFn(saveCapTableRow);
  const remove = useServerFn(removeCapTableRow);

  const [draft, setDraft] = useState<Draft>(emptyDraft);
  const [editing, setEditing] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ["cap-table", offeringId],
    queryFn: () => list({ data: { offering_id: offeringId } }),
  });

  const rows = (data?.rows ?? []) as any[];
  const canManage = Boolean(data?.canManage);

  function refresh() {
    queryClient.invalidateQueries({ queryKey: ["cap-table", offeringId] });
    queryClient.invalidateQueries({ queryKey: ["diligence-room", offeringId] });
    queryClient.invalidateQueries({ queryKey: ["diligence-activity", offeringId] });
  }

  const saveMutation = useMutation({
    mutationFn: () =>
      save({
        data: {
          offering_id: offeringId,
          ...(draft.id ? { id: draft.id } : {}),
          holder_name: draft.holder_name.trim(),
          holder_type: draft.holder_type as any,
          security_type: draft.security_type.trim() || "Common",
          shares: num(draft.shares),
          ownership_pct: num(draft.ownership_pct),
          fully_diluted_pct: num(draft.fully_diluted_pct),
          notes: draft.notes.trim() || null,
          sort_order: rows.length,
        },
      }),
    onSuccess: () => {
      toast.success("Cap table updated.");
      setDraft(emptyDraft);
      setEditing(false);
      refresh();
    },
    onError: (e: any) => toast.error(e?.message ?? "Could not save that row."),
  });

  const removeMutation = useMutation({
    mutationFn: (id: string) => remove({ data: { offering_id: offeringId, id } }),
    onSuccess: () => {
      toast.success("Holder removed.");
      refresh();
    },
    onError: (e: any) => toast.error(e?.message ?? "Could not remove that row."),
  });

  const totals = (data?.totals ?? { shares: 0, ownership: 0, fully_diluted: 0 }) as any;

  return (
    <div className="space-y-4">
      {isLoading ? (
        <p className="text-sm text-muted-foreground">Loading the cap table…</p>
      ) : rows.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          {canManage
            ? "No holders entered yet. Add them below and investors will see the live cap table here — no spreadsheet needed."
            : "The cap table has not been published yet."}
        </p>
      ) : (
        <div className="overflow-x-auto rounded-md border">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 text-left">
              <tr>
                <th className="p-3 font-medium">Holder</th>
                <th className="p-3 font-medium">Security</th>
                <th className="p-3 text-right font-medium">Units / shares</th>
                <th className="p-3 text-right font-medium">Ownership</th>
                <th className="p-3 text-right font-medium">Fully diluted</th>
                {canManage ? <th className="p-3" /> : null}
              </tr>
            </thead>
            <tbody className="divide-y">
              {rows.map((r) => (
                <tr key={r.id}>
                  <td className="p-3">
                    <span className="font-medium">{r.holder_name}</span>
                    <span className="ml-2 text-xs text-muted-foreground">
                      {holderLabel(r.holder_type)}
                    </span>
                    {r.notes ? (
                      <p className="mt-1 text-xs text-muted-foreground">{r.notes}</p>
                    ) : null}
                  </td>
                  <td className="p-3">{r.security_type}</td>
                  <td className="p-3 text-right tabular-nums">{fmt(r.shares)}</td>
                  <td className="p-3 text-right tabular-nums">{fmt(r.ownership_pct, "%")}</td>
                  <td className="p-3 text-right tabular-nums">{fmt(r.fully_diluted_pct, "%")}</td>
                  {canManage ? (
                    <td className="p-3 text-right">
                      <div className="flex justify-end gap-2">
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => {
                            setEditing(true);
                            setDraft({
                              id: r.id,
                              holder_name: r.holder_name,
                              holder_type: r.holder_type,
                              security_type: r.security_type,
                              shares: r.shares === null ? "" : String(r.shares),
                              ownership_pct: r.ownership_pct === null ? "" : String(r.ownership_pct),
                              fully_diluted_pct:
                                r.fully_diluted_pct === null ? "" : String(r.fully_diluted_pct),
                              notes: r.notes ?? "",
                            });
                          }}
                        >
                          Edit
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          disabled={removeMutation.isPending}
                          onClick={() => removeMutation.mutate(r.id)}
                        >
                          Remove
                        </Button>
                      </div>
                    </td>
                  ) : null}
                </tr>
              ))}
            </tbody>
            <tfoot className="border-t bg-muted/30">
              <tr>
                <td className="p-3 font-medium" colSpan={2}>
                  Total
                </td>
                <td className="p-3 text-right font-medium tabular-nums">{fmt(totals.shares)}</td>
                <td className="p-3 text-right font-medium tabular-nums">
                  {fmt(totals.ownership, "%")}
                </td>
                <td className="p-3 text-right font-medium tabular-nums">
                  {fmt(totals.fully_diluted, "%")}
                </td>
                {canManage ? <td /> : null}
              </tr>
            </tfoot>
          </table>
        </div>
      )}

      {rows.length > 0 && data?.updated_at ? (
        <p className="text-xs text-muted-foreground">
          Last updated {new Date(data.updated_at).toLocaleString()}.
        </p>
      ) : null}

      {canManage ? (
        <div className="rounded-md border p-4">
          <div className="mb-3 flex items-center justify-between gap-3">
            <p className="text-sm font-medium">{editing ? "Edit holder" : "Add a holder"}</p>
            {editing ? (
              <Badge variant="secondary">Editing {draft.holder_name}</Badge>
            ) : null}
          </div>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            <div className="space-y-2">
              <Label htmlFor="cap-name">Holder</Label>
              <Input
                id="cap-name"
                value={draft.holder_name}
                maxLength={200}
                onChange={(e) => setDraft({ ...draft, holder_name: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="cap-type">Type</Label>
              <select
                id="cap-type"
                className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                value={draft.holder_type}
                onChange={(e) => setDraft({ ...draft, holder_type: e.target.value })}
              >
                {HOLDER_TYPES.map((h) => (
                  <option key={h.value} value={h.value}>
                    {h.label}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="cap-security">Security</Label>
              <Input
                id="cap-security"
                value={draft.security_type}
                maxLength={80}
                placeholder="Common, Preferred, LP interest…"
                onChange={(e) => setDraft({ ...draft, security_type: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="cap-shares">Units / shares</Label>
              <Input
                id="cap-shares"
                value={draft.shares}
                inputMode="decimal"
                onChange={(e) => setDraft({ ...draft, shares: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="cap-own">Ownership %</Label>
              <Input
                id="cap-own"
                value={draft.ownership_pct}
                inputMode="decimal"
                onChange={(e) => setDraft({ ...draft, ownership_pct: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="cap-fd">Fully diluted %</Label>
              <Input
                id="cap-fd"
                value={draft.fully_diluted_pct}
                inputMode="decimal"
                onChange={(e) => setDraft({ ...draft, fully_diluted_pct: e.target.value })}
              />
            </div>
            <div className="space-y-2 sm:col-span-2 lg:col-span-3">
              <Label htmlFor="cap-notes">Note (optional)</Label>
              <Input
                id="cap-notes"
                value={draft.notes}
                maxLength={500}
                onChange={(e) => setDraft({ ...draft, notes: e.target.value })}
              />
            </div>
          </div>
          <div className="mt-4 flex flex-wrap gap-2">
            <Button
              size="sm"
              disabled={!draft.holder_name.trim() || saveMutation.isPending}
              onClick={() => saveMutation.mutate()}
            >
              {saveMutation.isPending ? "Saving…" : editing ? "Save changes" : "Add holder"}
            </Button>
            {editing ? (
              <Button
                size="sm"
                variant="outline"
                onClick={() => {
                  setEditing(false);
                  setDraft(emptyDraft);
                }}
              >
                Cancel
              </Button>
            ) : null}
          </div>
        </div>
      ) : null}
    </div>
  );
}
