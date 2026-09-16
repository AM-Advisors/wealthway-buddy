import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";

import {
  getCapMigrations,
  setCapMigrationException,
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

type Data = Awaited<ReturnType<typeof getCapMigrations>>;
type Batch = Data["migrations"][number];
type ClassRow = NonNullable<Batch["summary"]>["classes"][number];
type Exception = {
  status: "open" | "resolved";
  reason: string;
  raisedAt: string;
  resolvedAt?: string | null;
  resolution?: string | null;
};

export function ReconciliationView() {
  return (
    <CapTableSection>
      <ReconciliationBody />
    </CapTableSection>
  );
}

function ReconciliationBody() {
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

  const batches = useMemo(
    () => (data?.migrations ?? []).filter((batch) => batch.status !== "cancelled"),
    [data],
  );

  const openCount = useMemo(
    () =>
      batches.reduce(
        (sum, batch) =>
          sum +
          Object.values(
            ((batch.reconciliation?.exceptions ?? {}) as Record<string, Exception>),
          ).filter((e) => e.status === "open").length,
        0,
      ),
    [batches],
  );

  if (isLoading) {
    return <p className="text-sm text-muted-foreground">Loading your reconciliation…</p>;
  }
  if (error) {
    return (
      <Card role="alert" className="border-destructive/40">
        <CardHeader>
          <CardTitle className="text-base">We could not load your reconciliation</CardTitle>
          <CardDescription>
            {error instanceof Error ? error.message : "Please try again in a moment."}
          </CardDescription>
        </CardHeader>
      </Card>
    );
  }

  const recorded = workspace?.metrics?.outstandingShares ?? 0;

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-lg font-semibold tracking-tight">Reconciliation</h3>
        <p className="text-sm text-muted-foreground">
          Every share class in a file you have uploaded, side by side: authorised, issued,
          outstanding and fully diluted. Flag anything that does not look right — a batch cannot be
          recorded while a flag is still open.
        </p>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <Tally label="Outstanding on your cap table" value={fmtNumber(recorded)} />
        <Tally label="Files awaiting reconciliation" value={fmtNumber(batches.filter((b) => b.status !== "imported").length)} />
        <Tally label="Open flags" value={fmtNumber(openCount)} />
      </div>

      {batches.length === 0 ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Nothing to reconcile yet</CardTitle>
            <CardDescription>
              Upload a cap table file on the Migration tab and the share totals will appear here for
              you to check.
            </CardDescription>
          </CardHeader>
        </Card>
      ) : (
        batches.map((batch) => (
          <BatchReconciliation
            key={batch.id}
            batch={batch}
            canManage={Boolean(data?.canManage)}
            onChanged={refresh}
          />
        ))
      )}
    </div>
  );
}

function Tally({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border bg-card p-3">
      <p className="text-xs uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="text-lg font-semibold">{value}</p>
    </div>
  );
}

function BatchReconciliation({
  batch,
  canManage,
  onChanged,
}: {
  batch: Batch;
  canManage: boolean;
  onChanged: () => void;
}) {
  const summary = batch.summary;
  const exceptions = (batch.reconciliation?.exceptions ?? {}) as Record<string, Exception>;
  const [target, setTarget] = useState<{ row: ClassRow; mode: "raise" | "resolve" } | null>(null);

  if (!summary || summary.classes.length === 0) return null;

  const openFlags = Object.values(exceptions).filter((e) => e.status === "open").length;

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div>
            <CardTitle className="text-base">
              {batch.fileName ?? "Uploaded cap table file"}
            </CardTitle>
            <CardDescription>
              {batch.status === "imported" ? "Recorded" : "Awaiting your acceptance"} ·{" "}
              {fmtNumber(summary.classes.length)} share classes
            </CardDescription>
          </div>
          <div className="flex items-center gap-2">
            {openFlags > 0 ? (
              <Badge variant="destructive">{openFlags} open</Badge>
            ) : (
              <Badge variant="outline">No open flags</Badge>
            )}
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Share class</TableHead>
                <TableHead className="text-right">Authorised</TableHead>
                <TableHead className="text-right">Issued</TableHead>
                <TableHead className="text-right">Outstanding</TableHead>
                <TableHead className="text-right">Reserved</TableHead>
                <TableHead className="text-right">Fully diluted</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Flag</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {summary.classes.map((row) => {
                const flag = exceptions[row.key];
                const fullyDiluted = row.outstanding + row.reserved;
                return (
                  <TableRow key={row.key}>
                    <TableCell className="font-medium">
                      {row.name}
                      {row.isNew ? (
                        <Badge variant="outline" className="ml-2">
                          New
                        </Badge>
                      ) : null}
                    </TableCell>
                    <TableCell className="text-right">
                      {row.authorized ? fmtNumber(row.authorized) : "—"}
                    </TableCell>
                    <TableCell className="text-right">{fmtNumber(row.issued)}</TableCell>
                    <TableCell className="text-right">{fmtNumber(row.outstanding)}</TableCell>
                    <TableCell className="text-right">{fmtNumber(row.reserved)}</TableCell>
                    <TableCell className="text-right">{fmtNumber(fullyDiluted)}</TableCell>
                    <TableCell className="text-sm">
                      {row.overAuthorizedBy > 0 ? (
                        <span className="text-destructive">
                          Over authorised by {fmtNumber(row.overAuthorizedBy)}
                        </span>
                      ) : row.outstandingDifference !== 0 ? (
                        <span className="text-muted-foreground">
                          {row.outstandingDifference > 0 ? "+" : ""}
                          {fmtNumber(row.outstandingDifference)} against the file
                        </span>
                      ) : (
                        <span className="text-muted-foreground">Agrees with the file</span>
                      )}
                      {flag ? (
                        <span className="mt-1 block text-xs">
                          <Badge variant={flag.status === "open" ? "destructive" : "secondary"}>
                            {flag.status === "open" ? "Flagged" : "Settled"}
                          </Badge>{" "}
                          <span className="text-muted-foreground">
                            {flag.reason} · raised {fmtDate(flag.raisedAt)}
                            {flag.resolution ? ` · settled: ${flag.resolution}` : ""}
                          </span>
                        </span>
                      ) : null}
                    </TableCell>
                    <TableCell className="text-right">
                      {canManage ? (
                        flag?.status === "open" ? (
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => setTarget({ row, mode: "resolve" })}
                          >
                            Settle
                          </Button>
                        ) : (
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => setTarget({ row, mode: "raise" })}
                          >
                            Flag
                          </Button>
                        )
                      ) : null}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>

        <div className="grid gap-3 sm:grid-cols-4">
          <Tally label="Issued" value={fmtNumber(summary.totals.issued)} />
          <Tally label="Outstanding" value={fmtNumber(summary.totals.outstanding)} />
          <Tally label="Reserved" value={fmtNumber(summary.totals.reserved)} />
          <Tally label="Fully diluted" value={fmtNumber(summary.totals.fullyDiluted)} />
        </div>

        {summary.totals.overAuthorized > 0 ? (
          <p className="text-sm text-destructive">
            {fmtNumber(summary.totals.overAuthorized)} shares are issued beyond what these classes
            are authorised to have. You will be asked for a reason before this batch is recorded.
          </p>
        ) : null}
        {batch.overageReason ? (
          <p className="text-sm text-muted-foreground">
            Recorded over authorised shares. Reason given: {batch.overageReason}
          </p>
        ) : null}
      </CardContent>

      <ExceptionDialog
        target={target}
        migrationId={batch.id}
        onOpenChange={(open) => (open ? null : setTarget(null))}
        onDone={() => {
          setTarget(null);
          onChanged();
        }}
      />
    </Card>
  );
}

function ExceptionDialog({
  target,
  migrationId,
  onOpenChange,
  onDone,
}: {
  target: { row: ClassRow; mode: "raise" | "resolve" } | null;
  migrationId: string;
  onOpenChange: (open: boolean) => void;
  onDone: () => void;
}) {
  const save = useServerFn(setCapMigrationException);
  const [reason, setReason] = useState("");

  const mutation = useMutation({
    mutationFn: () =>
      save({
        data: {
          migrationId,
          classKey: target!.row.key,
          className: target!.row.name,
          action: target!.mode,
          reason: reason.trim(),
        },
      }),
    onSuccess: () => {
      toast.success(target?.mode === "raise" ? "Flag raised." : "Flag settled.");
      setReason("");
      onDone();
    },
    onError: (err: unknown) =>
      toast.error(err instanceof Error ? err.message : "We could not save that."),
  });

  return (
    <Dialog open={Boolean(target)} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {target?.mode === "raise" ? "Flag this share class" : "Settle this flag"}
          </DialogTitle>
          <DialogDescription>
            {target?.mode === "raise"
              ? `Tell us what does not look right about ${target?.row.name}. This batch cannot be recorded until the flag is settled.`
              : `Say how ${target?.row.name} was settled. Both the flag and your answer stay in the history.`}
          </DialogDescription>
        </DialogHeader>
        <Textarea
          value={reason}
          onChange={(event) => setReason(event.target.value)}
          rows={4}
          placeholder={
            target?.mode === "raise"
              ? "For example: our board approved 2,000,000 authorised shares, not 1,500,000."
              : "For example: confirmed against the signed board consent of 3 March."
          }
        />
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            disabled={mutation.isPending || reason.trim().length < 5}
            onClick={() => mutation.mutate()}
          >
            {target?.mode === "raise" ? "Raise flag" : "Settle flag"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
