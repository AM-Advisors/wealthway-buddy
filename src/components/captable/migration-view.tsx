import { useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";

import { MIGRATION_FIELDS } from "@/lib/captable-migration-fields";
import {
  cancelCapMigration,
  createCapMigration,
  getCapMigrations,
  importCapMigration,
  remapCapMigration,
  setCapMigrationReconciliation,
  setCapMigrationRow,
} from "@/lib/captable-migration.functions";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";

import { ConciergeHandoverDialog, ConciergePanel } from "./concierge-panel";
import { fmtDate, fmtNumber, useCapTable } from "./captable-context";
import { CapTableSection } from "./captable-states";

const NONE = "__none__";

export function MigrationView() {
  return (
    <CapTableSection>
      <MigrationBody />
    </CapTableSection>
  );
}

function MigrationBody() {
  const { workspace, companyId } = useCapTable();
  const load = useServerFn(getCapMigrations);
  const queryClient = useQueryClient();
  const id = companyId!;

  const { data, isLoading, error } = useQuery({
    queryKey: ["cap-migrations", id],
    queryFn: () => load({ data: { companyId: id } }),
  });

  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: ["cap-migrations", id] });
    void queryClient.invalidateQueries({ queryKey: ["captable-workspace"] });
  };

  if (isLoading) return <p className="text-sm text-muted-foreground">Loading your migrations…</p>;
  if (error) {
    return (
      <Card role="alert" className="border-destructive/40">
        <CardHeader>
          <CardTitle className="text-base">We could not load your migrations</CardTitle>
          <CardDescription>
            {error instanceof Error ? error.message : "Please try again in a moment."}
          </CardDescription>
        </CardHeader>
      </Card>
    );
  }

  const migrations = data?.migrations ?? [];
  const recorded = workspace?.metrics?.outstandingShares ?? 0;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h3 className="text-lg font-semibold tracking-tight">Bring your cap table across</h3>
          <p className="text-sm text-muted-foreground">
            Upload an export from Carta, Pulley or your own spreadsheet. We read the columns, flag
            anything that looks wrong, and nothing is recorded until you accept it.
          </p>
        </div>
        {data?.canManage ? <UploadCard companyId={id} onDone={refresh} /> : null}
      </div>

      {data && !data.canManage ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">
              {data.isDemo ? "The demo company is read-only" : "You can view migrations only"}
            </CardTitle>
            <CardDescription>
              {data.isDemo
                ? "Switch to your own company in Settings to import your records."
                : "Ask an authorised signatory at your company to run the import."}
            </CardDescription>
          </CardHeader>
        </Card>
      ) : null}

      {migrations.length === 0 ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">No files uploaded yet</CardTitle>
            <CardDescription>
              Your history comes with you. A CSV or Excel export with one line per holding is all we
              need to get started.
            </CardDescription>
          </CardHeader>
        </Card>
      ) : (
        migrations.map((batch) => (
          <BatchPanel
            key={batch.id}
            batch={batch}
            stakeholders={data!.stakeholders}
            canManage={data!.canManage}
            recordedShares={recorded}
            onChanged={refresh}
          />
        ))
      )}
    </div>
  );
}

type Data = Awaited<ReturnType<typeof getCapMigrations>>;
type Batch = Data["migrations"][number];

/* --------------------------------------------------------------- uploading */

function UploadCard({ companyId, onDone }: { companyId: string; onDone: () => void }) {
  const create = useServerFn(createCapMigration);
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);

  const handleFile = async (file: File) => {
    setBusy(true);
    try {
      const XLSX = await import("xlsx");
      const buffer = await file.arrayBuffer();
      const book = XLSX.read(buffer, { type: "array", cellDates: true });
      const firstSheet = book.SheetNames[0];
      const sheet = firstSheet ? book.Sheets[firstSheet] : undefined;
      if (!sheet) throw new Error("That file has no readable sheet.");
      const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: null, raw: false });
      if (rows.length === 0) throw new Error("That file has no rows under the headings.");
      const headers = Object.keys(rows[0]!);
      const result = await create({
        data: { companyId, fileName: file.name, headers, rows: rows.slice(0, 5000) },
      });
      toast.success(`${rows.length} lines read. Looks like ${result.provider}.`);
      onDone();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "We could not read that file.");
    } finally {
      setBusy(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  };

  return (
    <div className="flex items-center gap-2">
      <input
        ref={inputRef}
        type="file"
        accept=".csv,.xlsx,.xls"
        className="hidden"
        onChange={(event) => {
          const file = event.target.files?.[0];
          if (file) void handleFile(file);
        }}
      />
      <Button onClick={() => inputRef.current?.click()} disabled={busy}>
        {busy ? "Reading your file…" : "Upload a cap table file"}
      </Button>
    </div>
  );
}

/* ------------------------------------------------------------------ a batch */

function BatchPanel({
  batch,
  stakeholders,
  canManage,
  recordedShares,
  onChanged,
}: {
  batch: Batch;
  stakeholders: Data["stakeholders"];
  canManage: boolean;
  recordedShares: number;
  onChanged: () => void;
}) {
  const [showMapping, setShowMapping] = useState(false);
  const [concierge, setConcierge] = useState(false);
  const [acceptOpen, setAcceptOpen] = useState(false);
  const [overageReason, setOverageReason] = useState("");
  const overAuthorized = batch.summary?.totals?.overAuthorized ?? 0;

  const totals = useMemo(() => {
    const shares = batch.rows.reduce(
      (sum, row) => sum + (Number((row.mapped as any)?.quantity) || 0),
      0,
    );
    const newHolders = new Set(
      batch.rows
        .filter((row) => !row.matchStakeholderId && (row.mapped as any)?.holderName)
        .map((row) => String((row.mapped as any).holderName).toLowerCase()),
    ).size;
    return { shares, newHolders };
  }, [batch.rows]);

  const importBatch = useServerFn(importCapMigration);
  const cancelBatch = useServerFn(cancelCapMigration);

  const importer = useMutation({
    mutationFn: (reason?: string | null) =>
      importBatch({ data: { migrationId: batch.id, overageReason: reason ?? null } }),
    onSuccess: (result) => {
      toast.success(
        `${result.lines} lines accepted · ${result.stakeholdersCreated} new shareholders, ${result.securitiesCreated} holdings recorded.`,
      );
      setAcceptOpen(false);
      onChanged();
    },
    onError: (err: unknown) =>
      toast.error(err instanceof Error ? err.message : "We could not accept this batch."),
  });

  const canceller = useMutation({
    mutationFn: () => cancelBatch({ data: { migrationId: batch.id } }),
    onSuccess: () => {
      toast.success("Batch cancelled. Nothing was recorded.");
      onChanged();
    },
    onError: (err: unknown) =>
      toast.error(err instanceof Error ? err.message : "We could not cancel this batch."),
  });

  const done = batch.status === "imported" || batch.status === "cancelled";

  return (
    <Card>
      <CardHeader className="gap-2">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <CardTitle className="flex flex-wrap items-center gap-2 text-base">
              {batch.fileName ?? "Uploaded file"}
              <Badge variant="secondary">{batch.detectedProvider ?? "Spreadsheet"}</Badge>
              <Badge variant={batch.status === "imported" ? "secondary" : "outline"} className="capitalize">
                {batch.status.replace(/_/g, " ")}
              </Badge>
            </CardTitle>
            <CardDescription>
              Uploaded {fmtDate(batch.createdAt)} · {fmtNumber(batch.counts.total)} lines
              {batch.importedAt ? ` · accepted ${fmtDate(batch.importedAt)}` : ""}
            </CardDescription>
          </div>
          {canManage && !done ? (
            <div className="flex flex-wrap gap-2">
              <Button size="sm" variant="outline" onClick={() => setShowMapping(true)}>
                Change column mapping
              </Button>
              <Button size="sm" variant="outline" onClick={() => setConcierge(true)}>
                Have Harmonious do it for me
              </Button>
              <Button
                size="sm"
                onClick={() => (overAuthorized > 0 ? setAcceptOpen(true) : importer.mutate(null))}
                disabled={importer.isPending || batch.counts.ready === 0}
              >
                Accept {fmtNumber(batch.counts.ready)} lines
              </Button>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => canceller.mutate()}
                disabled={canceller.isPending}
              >
                Cancel
              </Button>
            </div>
          ) : null}
        </div>
      </CardHeader>

      <CardContent className="space-y-4">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Tally label="Ready to accept" value={fmtNumber(batch.counts.ready)} />
          <Tally label="Need attention" value={fmtNumber(batch.counts.error)} />
          <Tally label="Matched to existing holders" value={fmtNumber(batch.counts.matched)} />
          <Tally label="New shareholders" value={fmtNumber(totals.newHolders)} />
        </div>

        <div className="rounded-lg border bg-muted/30 p-3 text-sm">
          <p className="font-medium">Reconciliation</p>
          <p className="text-muted-foreground">
            This file carries {fmtNumber(totals.shares)} shares. Your cap table currently records{" "}
            {fmtNumber(recordedShares)}. After accepting, outstanding shares would be{" "}
            {fmtNumber(recordedShares + totals.shares)}
            {batch.status === "imported" ? " (already included)" : ""}.
          </p>
        </div>

        <ComingAcross batch={batch} />
        <ReconcilePanel batch={batch} editable={canManage && !done} onChanged={onChanged} />

        <ConciergePanel migrationId={batch.id} onChanged={onChanged} />

        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-12">#</TableHead>
                <TableHead>Shareholder</TableHead>
                <TableHead>Security</TableHead>
                <TableHead className="text-right">Quantity</TableHead>
                <TableHead>Issued</TableHead>
                <TableHead>Match</TableHead>
                <TableHead>Status</TableHead>
                {canManage && !done ? <TableHead className="text-right">Action</TableHead> : null}
              </TableRow>
            </TableHeader>
            <TableBody>
              {batch.rows.slice(0, 200).map((row) => (
                <RowLine
                  key={row.id}
                  row={row}
                  stakeholders={stakeholders}
                  editable={canManage && !done}
                  onChanged={onChanged}
                />
              ))}
            </TableBody>
          </Table>
          {batch.rows.length > 200 ? (
            <p className="p-2 text-xs text-muted-foreground">
              Showing the first 200 of {fmtNumber(batch.rows.length)} lines. All lines are accepted
              together.
            </p>
          ) : null}
        </div>
      </CardContent>

      <MappingDialog
        open={showMapping}
        onOpenChange={setShowMapping}
        batch={batch}
        onDone={onChanged}
      />
      <ConciergeHandoverDialog
        open={concierge}
        onOpenChange={setConcierge}
        migrationId={batch.id}
        onDone={onChanged}
      />

      <Dialog open={acceptOpen} onOpenChange={setAcceptOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>More shares issued than authorised</DialogTitle>
            <DialogDescription>
              This file leaves {fmtNumber(overAuthorized)} shares issued beyond what those share
              classes are authorised to have. You can still record it, but please say why. Your
              reason is kept with the batch in the history.
            </DialogDescription>
          </DialogHeader>
          <Textarea
            value={overageReason}
            onChange={(event) => setOverageReason(event.target.value)}
            placeholder="For example: the board approved an increase in authorised shares on 3 March; the filing is being updated."
            rows={4}
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => setAcceptOpen(false)}>
              Cancel
            </Button>
            <Button
              disabled={importer.isPending || overageReason.trim().length < 5}
              onClick={() => importer.mutate(overageReason.trim())}
            >
              Record anyway
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}

/* ----------------------------------------------- classes, rounds, totals */

function ComingAcross({ batch }: { batch: Batch }) {
  const summary = batch.summary;
  if (!summary) return null;
  const classes = summary.classes.filter((c) => c.name !== "No share class given" || c.issued > 0);
  if (classes.length === 0 && summary.rounds.length === 0) return null;

  return (
    <div className="grid gap-3 md:grid-cols-2">
      <div className="rounded-lg border p-3">
        <p className="text-sm font-medium">Share classes in this file</p>
        <ul className="mt-2 space-y-1 text-sm text-muted-foreground">
          {classes.length === 0 ? <li>No share class named.</li> : null}
          {classes.map((c) => (
            <li key={c.key} className="flex flex-wrap items-center gap-2">
              <span className="text-foreground">{c.name}</span>
              {c.isNew ? <Badge variant="outline">New</Badge> : null}
              <span>
                {fmtNumber(c.fileIssued)} shares
                {c.reserved ? ` · ${fmtNumber(c.reserved)} reserved` : ""}
                {c.authorized ? ` · ${fmtNumber(c.authorized)} authorised` : ""}
              </span>
            </li>
          ))}
        </ul>
      </div>
      <div className="rounded-lg border p-3">
        <p className="text-sm font-medium">Funding rounds in this file</p>
        <ul className="mt-2 space-y-1 text-sm text-muted-foreground">
          {summary.rounds.length === 0 ? <li>No round named in this file.</li> : null}
          {summary.rounds.map((r) => (
            <li key={r.key} className="flex flex-wrap items-center gap-2">
              <span className="text-foreground">{r.name}</span>
              {r.isNew ? <Badge variant="outline">New</Badge> : null}
              <span>
                {r.date ? `${fmtDate(r.date)} · ` : ""}
                {fmtNumber(r.lines)} lines
                {r.pricePerShare ? ` · ${r.pricePerShare} per share` : ""}
              </span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

function ReconcilePanel({
  batch,
  editable,
  onChanged,
}: {
  batch: Batch;
  editable: boolean;
  onChanged: () => void;
}) {
  const summary = batch.summary;
  const save = useServerFn(setCapMigrationReconciliation);
  const [draft, setDraft] = useState<Record<string, { authorized: string; issued: string; outstanding: string }>>(
    () => {
      const overrides = (batch.reconciliation?.overrides ?? {}) as Record<string, any>;
      const seed: Record<string, { authorized: string; issued: string; outstanding: string }> = {};
      for (const row of summary?.classes ?? []) {
        const o = overrides[row.key] ?? {};
        seed[row.key] = {
          authorized: o.authorized != null ? String(o.authorized) : row.authorized != null ? String(row.authorized) : "",
          issued: o.issued != null ? String(o.issued) : String(row.fileIssued),
          outstanding: o.outstanding != null ? String(o.outstanding) : String(row.alreadyRecorded + row.fileIssued),
        };
      }
      return seed;
    },
  );

  const mutation = useMutation({
    mutationFn: () => {
      const overrides: Record<string, { authorized: number | null; issued: number | null; outstanding: number | null }> = {};
      for (const [key, value] of Object.entries(draft)) {
        const parse = (v: string) => (v.trim() === "" ? null : Number(v.replace(/[,\s]/g, "")));
        overrides[key] = {
          authorized: parse(value.authorized),
          issued: parse(value.issued),
          outstanding: parse(value.outstanding),
        };
      }
      return save({ data: { migrationId: batch.id, overrides } });
    },
    onSuccess: () => {
      toast.success("Your totals are saved against this batch.");
      onChanged();
    },
    onError: (err: unknown) =>
      toast.error(err instanceof Error ? err.message : "We could not save those totals."),
  });

  if (!summary || summary.classes.length === 0) return null;

  return (
    <div className="space-y-3 rounded-lg border p-3">
      <div>
        <p className="text-sm font-medium">Authorised, issued and outstanding</p>
        <p className="text-sm text-muted-foreground">
          We read what we can from your file. Correct any number to match your current provider —
          we show the difference so nothing goes across unnoticed.
        </p>
      </div>
      <div className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Share class</TableHead>
              <TableHead className="text-right">In the file</TableHead>
              <TableHead className="text-right">Authorised</TableHead>
              <TableHead className="text-right">Issued</TableHead>
              <TableHead className="text-right">Outstanding</TableHead>
              <TableHead className="text-right">Difference</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {summary.classes.map((row) => {
              const value = draft[row.key] ?? { authorized: "", issued: "", outstanding: "" };
              const set = (field: "authorized" | "issued" | "outstanding", v: string) =>
                setDraft((prev) => ({ ...prev, [row.key]: { ...value, [field]: v } }));
              return (
                <TableRow key={row.key}>
                  <TableCell>
                    <span className="font-medium">{row.name}</span>
                    {row.reserved ? (
                      <span className="block text-xs text-muted-foreground">
                        {fmtNumber(row.reserved)} reserved for options, RSUs or warrants
                      </span>
                    ) : null}
                  </TableCell>
                  <TableCell className="text-right">{fmtNumber(row.fileIssued)}</TableCell>
                  {(["authorized", "issued", "outstanding"] as const).map((field) => (
                    <TableCell key={field} className="text-right">
                      {editable ? (
                        <Input
                          inputMode="numeric"
                          className="h-8 w-32 text-right"
                          value={value[field]}
                          onChange={(event) => set(field, event.target.value)}
                        />
                      ) : (
                        fmtNumber(Number(value[field]) || 0)
                      )}
                    </TableCell>
                  ))}
                  <TableCell className="text-right">
                    {row.overAuthorizedBy > 0 ? (
                      <span className="text-destructive">
                        over by {fmtNumber(row.overAuthorizedBy)}
                      </span>
                    ) : row.issuedDifference !== 0 ? (
                      <span className="text-muted-foreground">
                        {row.issuedDifference > 0 ? "+" : ""}
                        {fmtNumber(row.issuedDifference)} vs file
                      </span>
                    ) : (
                      <span className="text-muted-foreground">0</span>
                    )}
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>
      <p className="text-sm text-muted-foreground">
        Fully diluted after this batch: {fmtNumber(summary.totals.fullyDiluted)} shares
        ({fmtNumber(summary.totals.outstanding)} outstanding plus {fmtNumber(summary.totals.reserved)} reserved).
      </p>
      {batch.overageReason ? (
        <p className="text-sm text-muted-foreground">
          Recorded over authorised shares. Reason given: {batch.overageReason}
        </p>
      ) : null}
      {editable ? (
        <Button size="sm" variant="outline" onClick={() => mutation.mutate()} disabled={mutation.isPending}>
          Save these totals
        </Button>
      ) : null}
    </div>
  );
}

function Tally({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border bg-card p-3">
      <p className="text-xs uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="text-xl font-semibold">{value}</p>
    </div>
  );
}

function RowLine({
  row,
  stakeholders,
  editable,
  onChanged,
}: {
  row: Batch["rows"][number];
  stakeholders: Data["stakeholders"];
  editable: boolean;
  onChanged: () => void;
}) {
  const save = useServerFn(setCapMigrationRow);
  const mutation = useMutation({
    mutationFn: (input: { status?: "ready" | "skipped"; matchStakeholderId?: string | null }) =>
      save({ data: { rowId: row.id, ...input } }),
    onSuccess: onChanged,
    onError: (err: unknown) =>
      toast.error(err instanceof Error ? err.message : "We could not update that line."),
  });

  const mapped = row.mapped as any;
  const issues = row.issues ?? [];

  return (
    <TableRow>
      <TableCell className="text-muted-foreground">{row.rowNumber}</TableCell>
      <TableCell>
        <p className="font-medium">{mapped?.holderName ?? "—"}</p>
        <p className="text-xs text-muted-foreground">{mapped?.holderEmail ?? mapped?.holderType}</p>
        {issues.length ? (
          <p className="text-xs text-destructive">{issues.join(" ")}</p>
        ) : null}
      </TableCell>
      <TableCell className="capitalize">
        {String(mapped?.securityType ?? "—").replace(/_/g, " ")}
        {mapped?.securityClass ? (
          <span className="block text-xs text-muted-foreground">{mapped.securityClass}</span>
        ) : null}
      </TableCell>
      <TableCell className="text-right">{fmtNumber(Number(mapped?.quantity) || 0)}</TableCell>
      <TableCell>{fmtDate(mapped?.issueDate)}</TableCell>
      <TableCell>
        {editable ? (
          <Select
            value={row.matchStakeholderId ?? NONE}
            onValueChange={(value) =>
              mutation.mutate({ matchStakeholderId: value === NONE ? null : value })
            }
          >
            <SelectTrigger className="h-8 w-[180px]">
              <SelectValue placeholder="New shareholder" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={NONE}>Create a new shareholder</SelectItem>
              {stakeholders.map((s: Data["stakeholders"][number]) => (
                <SelectItem key={s.id} value={s.id}>
                  {s.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        ) : (
          <span className="text-sm text-muted-foreground">
            {stakeholders.find((s: Data["stakeholders"][number]) => s.id === row.matchStakeholderId)?.name ?? "New shareholder"}
          </span>
        )}
      </TableCell>
      <TableCell>
        <Badge
          variant={
            row.status === "imported" || row.status === "ready"
              ? "secondary"
              : row.status === "error"
                ? "destructive"
                : "outline"
          }
          className="capitalize"
        >
          {row.status}
        </Badge>
      </TableCell>
      {editable ? (
        <TableCell className="text-right">
          <Button
            size="sm"
            variant="ghost"
            disabled={mutation.isPending}
            onClick={() =>
              mutation.mutate({ status: row.status === "skipped" ? "ready" : "skipped" })
            }
          >
            {row.status === "skipped" ? "Include" : "Skip"}
          </Button>
        </TableCell>
      ) : null}
    </TableRow>
  );
}

function MappingDialog({
  open,
  onOpenChange,
  batch,
  onDone,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  batch: Batch;
  onDone: () => void;
}) {
  const remap = useServerFn(remapCapMigration);
  const [mapping, setMapping] = useState<Record<string, string | null>>(batch.mapping ?? {});

  const mutation = useMutation({
    mutationFn: () => remap({ data: { migrationId: batch.id, mapping } }),
    onSuccess: () => {
      toast.success("Columns re-read with your mapping.");
      onOpenChange(false);
      onDone();
    },
    onError: (err: unknown) =>
      toast.error(err instanceof Error ? err.message : "We could not apply that mapping."),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Match your columns</DialogTitle>
          <DialogDescription>
            Tell us which column in your file holds each piece of information. Lines are checked
            again after you save.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          {MIGRATION_FIELDS.map((field) => (
            <div key={field.key} className="grid gap-1.5">
              <Label htmlFor={`map-${field.key}`}>
                {field.label}
                {"required" in field && field.required ? " *" : ""}
              </Label>
              <Select
                value={mapping[field.key] ?? NONE}
                onValueChange={(value) =>
                  setMapping((prev) => ({ ...prev, [field.key]: value === NONE ? null : value }))
                }
              >
                <SelectTrigger id={`map-${field.key}`}>
                  <SelectValue placeholder="Not in my file" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NONE}>Not in my file</SelectItem>
                  {batch.headers.map((header: string) => (
                    <SelectItem key={header} value={header}>
                      {header}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          ))}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={() => mutation.mutate()} disabled={mutation.isPending}>
            Save mapping
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

