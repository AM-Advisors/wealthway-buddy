import { useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";

import {
  MIGRATION_FIELDS,
  cancelCapMigration,
  createCapMigration,
  getCapMigrations,
  importCapMigration,
  remapCapMigration,
  requestCapConcierge,
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
      const sheet = book.Sheets[book.SheetNames[0]];
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
    mutationFn: () => importBatch({ data: { migrationId: batch.id } }),
    onSuccess: (result) => {
      toast.success(
        `${result.lines} lines accepted · ${result.stakeholdersCreated} new shareholders, ${result.securitiesCreated} holdings recorded.`,
      );
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
                Ask us to review it
              </Button>
              <Button
                size="sm"
                onClick={() => importer.mutate()}
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

        {batch.conciergeRequestedAt ? (
          <p className="text-sm text-muted-foreground">
            Concierge review requested {fmtDate(batch.conciergeRequestedAt)}
            {batch.conciergeNote ? ` — “${batch.conciergeNote}”` : ""}
          </p>
        ) : null}

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
      <ConciergeDialog
        open={concierge}
        onOpenChange={setConcierge}
        migrationId={batch.id}
        onDone={onChanged}
      />
    </Card>
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
              {stakeholders.map((s) => (
                <SelectItem key={s.id} value={s.id}>
                  {s.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        ) : (
          <span className="text-sm text-muted-foreground">
            {stakeholders.find((s) => s.id === row.matchStakeholderId)?.name ?? "New shareholder"}
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
                  {batch.headers.map((header) => (
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

function ConciergeDialog({
  open,
  onOpenChange,
  migrationId,
  onDone,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  migrationId: string;
  onDone: () => void;
}) {
  const request = useServerFn(requestCapConcierge);
  const [note, setNote] = useState("");

  const mutation = useMutation({
    mutationFn: () => request({ data: { migrationId, note: note || null } }),
    onSuccess: () => {
      toast.success("Sent. Our team will review the file with you.");
      onOpenChange(false);
      onDone();
    },
    onError: (err: unknown) =>
      toast.error(err instanceof Error ? err.message : "We could not send that request."),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Ask us to review the file</DialogTitle>
          <DialogDescription>
            We check the mapping, the totals and anything flagged, then come back to you before
            anything is recorded.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-1.5">
          <Label htmlFor="concierge-note">Anything we should know? (optional)</Label>
          <Textarea
            id="concierge-note"
            value={note}
            onChange={(event) => setNote(event.target.value)}
            placeholder="For example: the option grants are on a second tab"
          />
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={() => mutation.mutate()} disabled={mutation.isPending}>
            Request review
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
