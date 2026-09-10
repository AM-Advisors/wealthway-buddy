import { useMemo, useRef, useState } from "react";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";

import {
  MIGRATION_STATUSES,
  MIGRATION_STEPS,
  deleteMigrationRow,
  getFundMigration,
  importMigrationRows,
  inviteMigratedInvestors,
  saveFundMigration,
  saveMigrationRow,
  setMigrationStep,
  stageMigrationRows,
} from "@/lib/fund-migration.functions";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
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

const money = (cents: number) =>
  `$${((cents ?? 0) / 100).toLocaleString(undefined, { maximumFractionDigits: 2 })}`;

const toCents = (value: unknown) => {
  const n = Number(String(value ?? "").replace(/[^0-9.\-]/g, ""));
  return Number.isFinite(n) ? Math.round(n * 100) : 0;
};

const pick = (row: Record<string, unknown>, keys: string[]) => {
  for (const key of Object.keys(row)) {
    const norm = key.toLowerCase().replace(/[^a-z]/g, "");
    if (keys.includes(norm)) return row[key];
  }
  return undefined;
};

export function FundMigrationBoard({ offeringId }: { offeringId: string }) {
  const fetchMigration = useServerFn(getFundMigration);
  const saveMigration = useServerFn(saveFundMigration);
  const saveStep = useServerFn(setMigrationStep);
  const stageRows = useServerFn(stageMigrationRows);
  const saveRow = useServerFn(saveMigrationRow);
  const removeRow = useServerFn(deleteMigrationRow);
  const runImport = useServerFn(importMigrationRows);
  const invite = useServerFn(inviteMigratedInvestors);

  const qc = useQueryClient();
  const fileRef = useRef<HTMLInputElement>(null);
  const [editing, setEditing] = useState<any | null>(null);

  const key = ["fund-migration", offeringId];
  const { data, isPending } = useQuery({
    queryKey: key,
    queryFn: () => fetchMigration({ data: { offeringId } }),
  });

  const refresh = () => qc.invalidateQueries({ queryKey: key });
  const fail = (e: any) => toast.error(e?.message ?? "That did not go through.");

  const start = useMutation({
    mutationFn: (payload: any) => saveMigration({ data: { offeringId, ...payload } }),
    onSuccess: () => {
      toast.success("Saved.");
      void refresh();
    },
    onError: fail,
  });

  const step = useMutation({
    mutationFn: (payload: { stepKey: string; done: boolean }) =>
      saveStep({ data: { offeringId, ...payload } }),
    onSuccess: () => void refresh(),
    onError: fail,
  });

  const stage = useMutation({
    mutationFn: (rows: any[]) => stageRows({ data: { offeringId, rows } }),
    onSuccess: (r: any) => {
      toast.success(`${r?.staged ?? "Records"} loaded for review.`);
      void refresh();
    },
    onError: fail,
  });

  const rowSave = useMutation({
    mutationFn: (row: any) => saveRow({ data: { offeringId, ...row } }),
    onSuccess: () => {
      setEditing(null);
      toast.success("Saved.");
      void refresh();
    },
    onError: fail,
  });

  const rowDelete = useMutation({
    mutationFn: (id: string) => removeRow({ data: { id } }),
    onSuccess: () => void refresh(),
    onError: fail,
  });

  const doImport = useMutation({
    mutationFn: () => runImport({ data: { offeringId } }),
    onSuccess: (r: any) => {
      toast.success(`${r?.imported ?? 0} record(s) brought across.`);
      void refresh();
    },
    onError: fail,
  });

  const doInvite = useMutation({
    mutationFn: () => invite({ data: { offeringId } }),
    onSuccess: (r: any) => {
      toast.success(`${r?.invited ?? 0} invitation(s) queued.`);
      void refresh();
    },
    onError: fail,
  });

  const rows = (data?.rows ?? []) as any[];
  const migration = (data?.migration ?? null) as any;
  const canManage = Boolean(data?.canManage);

  const totals = useMemo(
    () => ({
      pending: rows.filter((r) => r.row_status !== "imported").length,
      invalid: rows.filter((r) => r.row_status === "error").length,
      imported: rows.filter((r) => r.row_status === "imported").length,
      committed: rows.reduce((sum, r) => sum + (r.commitment_cents ?? 0), 0),
    }),
    [rows],
  );

  async function onFile(file: File) {
    try {
      const XLSX = await import("xlsx");
      const book = XLSX.read(await file.arrayBuffer(), { type: "array" });
      const sheet = book.Sheets[book.SheetNames[0]!];
      const raw = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet!, { defval: "" });

      const parsed = raw
        .map((r) => ({
          full_name: String(pick(r, ["name", "fullname", "investor", "investorname"]) ?? "").trim(),
          email: String(pick(r, ["email", "emailaddress"]) ?? "").trim(),
          investor_type: String(pick(r, ["type", "investortype"]) ?? "") || null,
          commitment_cents: toCents(pick(r, ["commitment", "commitmentamount", "committed"])),
          funded_cents: toCents(pick(r, ["funded", "fundedamount", "received", "paid"])),
          units: Number(pick(r, ["units", "shares"]) ?? 0) || null,
          closing_date: String(pick(r, ["closingdate", "closing", "date"]) ?? "") || null,
          accreditation_status: String(pick(r, ["accreditation", "accreditationstatus"]) ?? "") || null,
          note: String(pick(r, ["note", "notes", "comment"]) ?? "") || null,
        }))
        .filter((r) => r.full_name || r.email);

      if (!parsed.length) {
        toast.error("No investor rows found in that file.");
        return;
      }
      stage.mutate(parsed);
    } catch (e: any) {
      toast.error(e?.message ?? "That file could not be read.");
    }
  }

  if (isPending) return <p className="text-sm text-muted-foreground">Loading…</p>;

  if (!migration) {
    return (
      <Card>
        <CardContent className="space-y-3 pt-6">
          <p className="text-sm text-muted-foreground">
            No transfer has been started for this fund. Starting one records who the records came
            from and tracks each step of the handover.
          </p>
          <Button
            disabled={!canManage || start.isPending}
            onClick={() => start.mutate({ status: "in_progress" })}
          >
            Start transfer
          </Button>
          {!canManage && (
            <p className="text-xs text-muted-foreground">
              Only super admins can start or run a transfer.
            </p>
          )}
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardContent className="grid gap-4 pt-6 sm:grid-cols-3">
          <div className="space-y-1.5">
            <Label>Records came from</Label>
            <Input
              defaultValue={migration.prior_administrator ?? ""}
              disabled={!canManage}
              placeholder="Previous administrator"
              onBlur={(e) => start.mutate({ priorAdministrator: e.target.value })}
            />
          </div>
          <div className="space-y-1.5">
            <Label>Records as of</Label>
            <Input
              type="date"
              defaultValue={migration.records_as_of ?? ""}
              disabled={!canManage}
              onBlur={(e) => start.mutate({ recordsAsOf: e.target.value || null })}
            />
          </div>
          <div className="space-y-1.5">
            <Label>Stage</Label>
            <Select
              value={migration.status}
              disabled={!canManage}
              onValueChange={(v) => start.mutate({ status: v })}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {MIGRATION_STATUSES.map((s: any) => (
                  <SelectItem key={s.key ?? s} value={s.key ?? s}>
                    {s.label ?? s}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="sm:col-span-3 space-y-1.5">
            <Label>Notes</Label>
            <Textarea
              rows={2}
              defaultValue={migration.note ?? ""}
              disabled={!canManage}
              onBlur={(e) => start.mutate({ note: e.target.value })}
            />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="space-y-3 pt-6">
          <p className="font-medium">Handover checklist</p>
          {MIGRATION_STEPS.map((s: any) => {
            const stepKey = s.key ?? s;
            const state = (migration.steps ?? {})[stepKey] ?? {};
            return (
              <div key={stepKey} className="flex items-start gap-3 border-b pb-3 last:border-0">
                <Checkbox
                  checked={Boolean(state.done)}
                  disabled={!canManage || step.isPending}
                  onCheckedChange={(v) => step.mutate({ stepKey, done: v === true })}
                />
                <div className="min-w-0">
                  <p className="text-sm">{s.label ?? stepKey}</p>
                  {state.done && (
                    <p className="text-xs text-muted-foreground">
                      Done by {state.by} on {new Date(state.at).toLocaleDateString()}
                    </p>
                  )}
                </div>
              </div>
            );
          })}
        </CardContent>
      </Card>

      <Card>
        <CardContent className="space-y-4 pt-6">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <p className="font-medium">Investor records</p>
              <p className="text-sm text-muted-foreground">
                {rows.length} loaded · {totals.imported} brought across · {totals.invalid} need a fix
                · {money(totals.committed)} committed
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <input
                ref={fileRef}
                type="file"
                accept=".csv,.xlsx,.xls"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  e.target.value = "";
                  if (f) void onFile(f);
                }}
              />
              <Button
                size="sm"
                variant="outline"
                disabled={!canManage || stage.isPending}
                onClick={() => fileRef.current?.click()}
              >
                {stage.isPending ? "Reading…" : "Upload spreadsheet"}
              </Button>
              <Button
                size="sm"
                variant="outline"
                disabled={!canManage}
                onClick={() =>
                  setEditing({ full_name: "", email: "", commitment_cents: 0, funded_cents: 0 })
                }
              >
                Add one by hand
              </Button>
              <Button
                size="sm"
                disabled={!canManage || doImport.isPending || totals.pending === 0}
                onClick={() => doImport.mutate()}
              >
                {doImport.isPending ? "Working…" : "Bring records across"}
              </Button>
              <Button
                size="sm"
                variant="secondary"
                disabled={!canManage || doInvite.isPending || totals.imported === 0}
                onClick={() => doInvite.mutate()}
              >
                Invite investors
              </Button>
            </div>
          </div>

          {editing && (
            <div className="grid gap-3 rounded-md border p-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label>Full name</Label>
                <Input
                  value={editing.full_name ?? ""}
                  onChange={(e) => setEditing({ ...editing, full_name: e.target.value })}
                />
              </div>
              <div className="space-y-1.5">
                <Label>Email</Label>
                <Input
                  value={editing.email ?? ""}
                  onChange={(e) => setEditing({ ...editing, email: e.target.value })}
                />
              </div>
              <div className="space-y-1.5">
                <Label>Committed (dollars)</Label>
                <Input
                  value={String((editing.commitment_cents ?? 0) / 100)}
                  onChange={(e) =>
                    setEditing({ ...editing, commitment_cents: toCents(e.target.value) })
                  }
                />
              </div>
              <div className="space-y-1.5">
                <Label>Funded (dollars)</Label>
                <Input
                  value={String((editing.funded_cents ?? 0) / 100)}
                  onChange={(e) => setEditing({ ...editing, funded_cents: toCents(e.target.value) })}
                />
              </div>
              <div className="space-y-1.5">
                <Label>Closing date</Label>
                <Input
                  type="date"
                  value={editing.closing_date ?? ""}
                  onChange={(e) => setEditing({ ...editing, closing_date: e.target.value || null })}
                />
              </div>
              <div className="space-y-1.5">
                <Label>Note</Label>
                <Input
                  value={editing.note ?? ""}
                  onChange={(e) => setEditing({ ...editing, note: e.target.value })}
                />
              </div>
              <div className="flex gap-2 sm:col-span-2">
                <Button disabled={rowSave.isPending} onClick={() => rowSave.mutate(editing)}>
                  {rowSave.isPending ? "Saving…" : "Save record"}
                </Button>
                <Button variant="outline" onClick={() => setEditing(null)}>
                  Cancel
                </Button>
              </div>
            </div>
          )}

          <div className="overflow-x-auto rounded-md border">
            <table className="w-full text-sm">
              <thead className="bg-muted/50 text-left">
                <tr>
                  <th className="px-3 py-2 font-medium">Investor</th>
                  <th className="px-3 py-2 font-medium">Committed</th>
                  <th className="px-3 py-2 font-medium">Funded</th>
                  <th className="px-3 py-2 font-medium">State</th>
                  <th className="px-3 py-2" />
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id} className="border-t align-top">
                    <td className="px-3 py-2">
                      <span className="block">{r.full_name || "—"}</span>
                      <span className="block text-xs text-muted-foreground">{r.email || "No email"}</span>
                      {(r.errors ?? []).length > 0 && (
                        <span className="mt-1 block text-xs text-destructive">
                          {(r.errors ?? []).join(" · ")}
                        </span>
                      )}
                    </td>
                    <td className="px-3 py-2">{money(r.commitment_cents)}</td>
                    <td className="px-3 py-2">{money(r.funded_cents)}</td>
                    <td className="px-3 py-2">
                      <Badge variant={r.status === "imported" ? "secondary" : "outline"}>
                        {r.status === "imported" ? "Brought across" : "Waiting"}
                      </Badge>
                    </td>
                    <td className="px-3 py-2 text-right">
                      {canManage && r.status !== "imported" && (
                        <span className="flex justify-end gap-2">
                          <Button size="sm" variant="outline" onClick={() => setEditing(r)}>
                            Edit
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => rowDelete.mutate(r.id)}
                          >
                            Remove
                          </Button>
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
                {!rows.length && (
                  <tr>
                    <td className="px-3 py-6 text-muted-foreground" colSpan={5}>
                      Nothing loaded yet. Upload the previous administrator's investor list, or add
                      records one at a time.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
