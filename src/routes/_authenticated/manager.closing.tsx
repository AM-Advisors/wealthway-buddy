import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { toast } from "sonner";

import {
  addClosingDocument,
  confirmClosing,
  getClosingDocumentUrl,
  listClosingBoard,
  listClosingDocuments,
  removeClosingDocument,
  reopenClosing,
} from "@/lib/closing.functions";
import { CapitalStatementPanel } from "@/components/capital-statement-panel";
import { supabase } from "@/integrations/supabase/client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

export const Route = createFileRoute("/_authenticated/manager/closing")({
  head: () => ({
    meta: [
      { title: "Closing Desk — Harmonious" },
      {
        name: "description",
        content:
          "Confirm each investor's commitment is fully funded, set the closing date and publish the final documents to their portal.",
      },
      { property: "og:title", content: "Closing Desk — Harmonious" },
      {
        property: "og:description",
        content: "Confirm funding, set closing dates and share final documents with investors.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: ClosingDeskPage,
});

function money(cents: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format((cents ?? 0) / 100);
}

function today() {
  return new Date().toISOString().slice(0, 10);
}

function ClosingDeskPage() {
  const load = useServerFn(listClosingBoard);
  const { data, isLoading, isError } = useQuery({
    queryKey: ["closing-board"],
    queryFn: () => load(),
    retry: false,
  });

  const rows = (data?.rows ?? []) as any[];
  const [tab, setTab] = useState<"open" | "closed">("open");

  const { open, closed, closedTotal } = useMemo(() => {
    const open = rows.filter((r) => !r.closing);
    const closed = rows.filter((r) => r.closing);
    const closedTotal = closed.reduce((sum, r) => sum + (r.closing?.fundedAmountCents ?? 0), 0);
    return { open, closed, closedTotal };
  }, [rows]);

  const list = tab === "open" ? open : closed;

  return (
    <main className="mx-auto w-full max-w-5xl px-4 py-10">
      <header className="mb-6 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Closing desk</h1>
          <p className="text-sm text-muted-foreground">
            Confirm the money has landed in full, set the closing date, and give the investor their
            final documents.
          </p>
        </div>
        <Button asChild size="sm" variant="outline">
          <Link to="/manager">Back to panel</Link>
        </Button>
      </header>

      <div className="mb-6 grid gap-3 sm:grid-cols-3">
        <Card>
          <CardContent className="pt-6">
            <p className="text-xs text-muted-foreground">Waiting to close</p>
            <p className="text-2xl font-semibold">{open.length}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <p className="text-xs text-muted-foreground">Closed</p>
            <p className="text-2xl font-semibold">{closed.length}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <p className="text-xs text-muted-foreground">Closed amount</p>
            <p className="text-2xl font-semibold">{money(closedTotal)}</p>
          </CardContent>
        </Card>
      </div>

      <div className="mb-4 flex gap-2">
        <Button size="sm" variant={tab === "open" ? "default" : "outline"} onClick={() => setTab("open")}>
          Waiting to close ({open.length})
        </Button>
        <Button
          size="sm"
          variant={tab === "closed" ? "default" : "outline"}
          onClick={() => setTab("closed")}
        >
          Closed ({closed.length})
        </Button>
      </div>

      {isLoading ? (
        <p className="text-sm text-muted-foreground">Loading investors…</p>
      ) : isError ? (
        <p className="text-sm text-destructive">You do not have access to a closing desk yet.</p>
      ) : list.length === 0 ? (
        <Card>
          <CardHeader>
            <CardTitle>Nothing here yet</CardTitle>
            <CardDescription>
              {tab === "open"
                ? "Every investor on your funds has been closed."
                : "No investor has been closed yet."}
            </CardDescription>
          </CardHeader>
        </Card>
      ) : (
        <div className="space-y-4">
          {list.map((row) => (
            <InvestorClosing key={row.applicationId} row={row} />
          ))}
        </div>
      )}
    </main>
  );
}

function InvestorClosing({ row }: { row: any }) {
  const queryClient = useQueryClient();
  const close = useServerFn(confirmClosing);
  const reopen = useServerFn(reopenClosing);

  const shortfall = row.commitmentCents - row.receivedCents;
  const [amount, setAmount] = useState(
    String(Math.round((row.closing?.fundedAmountCents ?? row.receivedCents ?? 0) / 100)),
  );
  const [date, setDate] = useState(row.closing?.closingDate ?? today());
  const [note, setNote] = useState(row.closing?.note ?? "");
  const [showDocs, setShowDocs] = useState(false);

  const refresh = () => queryClient.invalidateQueries({ queryKey: ["closing-board"] });

  const confirmMutation = useMutation({
    mutationFn: () =>
      close({
        data: {
          application_id: row.applicationId,
          funded_amount_cents: Math.round(Number(amount) * 100),
          closing_date: date,
          note: note.trim() ? note.trim() : null,
        },
      }),
    onSuccess: () => {
      toast.success("Closed. The investor has been told and can see the date in their portal.");
      setShowDocs(true);
      refresh();
    },
    onError: (e: any) => toast.error(e?.message ?? "Could not confirm the closing."),
  });

  const reopenMutation = useMutation({
    mutationFn: () => reopen({ data: { application_id: row.applicationId } }),
    onSuccess: () => {
      toast.success("Closing reopened.");
      refresh();
    },
    onError: (e: any) => toast.error(e?.message ?? "Could not reopen the closing."),
  });

  const amountValid = Number(amount) > 0;

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <CardTitle className="text-base">{row.investorName}</CardTitle>
            <CardDescription>
              {row.offeringName} · committed {money(row.commitmentCents)} · received{" "}
              {money(row.receivedCents)}
              {row.closing
                ? ` · closed ${new Date(row.closing.closingDate + "T00:00:00").toLocaleDateString()}`
                : shortfall > 0
                  ? ` · ${money(shortfall)} still outstanding`
                  : " · fully funded"}
            </CardDescription>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant={row.closing ? "default" : shortfall <= 0 ? "secondary" : "outline"}>
              {row.closing ? "Closed" : shortfall <= 0 ? "Ready to close" : "Awaiting funds"}
            </Badge>
            {row.closing ? null : (
              <Badge
                variant={
                  row.signoff?.matchesCommitment
                    ? "secondary"
                    : row.signoff
                      ? "destructive"
                      : "outline"
                }
              >
                {row.signoff?.matchesCommitment
                  ? "Investor approved"
                  : row.signoff
                    ? "Approval out of date"
                    : "Awaiting investor approval"}
              </Badge>
            )}
            <Button asChild size="sm" variant="outline">
              <Link to="/manager/$applicationId" params={{ applicationId: row.applicationId }}>
                Investor file
              </Link>
            </Button>
          </div>
        </div>
      </CardHeader>

      <CardContent className="space-y-4">
        {row.closing ? (
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border p-3 text-sm">
            <span>
              {money(row.closing.fundedAmountCents)} confirmed received ·{" "}
              {row.closing.documentCount} final document
              {row.closing.documentCount === 1 ? "" : "s"} shared
            </span>
            <div className="flex gap-2">
              <Button size="sm" variant="outline" onClick={() => setShowDocs((v) => !v)}>
                {showDocs ? "Hide documents" : "Final documents"}
              </Button>
              <Button
                size="sm"
                variant="ghost"
                disabled={reopenMutation.isPending}
                onClick={() => reopenMutation.mutate()}
              >
                Reopen
              </Button>
            </div>
          </div>
        ) : (
          <div className="grid gap-3 sm:grid-cols-3">
            <div className="space-y-1">
              <Label htmlFor={`amt-${row.applicationId}`}>Amount received (USD)</Label>
              <Input
                id={`amt-${row.applicationId}`}
                inputMode="decimal"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor={`date-${row.applicationId}`}>Closing date</Label>
              <Input
                id={`date-${row.applicationId}`}
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
              />
            </div>
            <div className="space-y-1 sm:col-span-3">
              <Label htmlFor={`note-${row.applicationId}`}>Note for the investor (optional)</Label>
              <Textarea
                id={`note-${row.applicationId}`}
                rows={2}
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="Anything they should know about the closing."
              />
            </div>
            <div className="sm:col-span-3">
              <Button
                disabled={
                  !amountValid || confirmMutation.isPending || !row.signoff?.matchesCommitment
                }
                onClick={() => confirmMutation.mutate()}
              >
                {confirmMutation.isPending ? "Confirming…" : "Confirm fully funded and close"}
              </Button>
              {row.signoff?.matchesCommitment ? null : (
                <p className="mt-2 text-xs text-destructive">
                  {row.signoff
                    ? `The investor approved ${money(row.signoff.commitmentCents)}, which no longer matches their commitment. Ask them to approve the new amount in their portal.`
                    : "The investor has not approved their fund and commitment in the portal yet. Capital cannot be recorded until they do."}
                </p>
              )}
              {shortfall > 0 ? (
                <p className="mt-2 text-xs text-muted-foreground">
                  Our records show {money(shortfall)} still outstanding. Close only if the full
                  amount has landed in the bank.
                </p>
              ) : null}
            </div>
          </div>
        )}

        {row.closing ? (
          <CapitalStatementPanel applicationId={row.applicationId} canRegenerate />
        ) : null}

        {showDocs && row.closing ? <ClosingDocuments row={row} /> : null}
      </CardContent>
    </Card>
  );
}

function ClosingDocuments({ row }: { row: any }) {
  const queryClient = useQueryClient();
  const list = useServerFn(listClosingDocuments);
  const add = useServerFn(addClosingDocument);
  const remove = useServerFn(removeClosingDocument);
  const openUrl = useServerFn(getClosingDocumentUrl);

  const { data, isLoading } = useQuery({
    queryKey: ["closing-documents", row.applicationId],
    queryFn: () => list({ data: { application_id: row.applicationId } }),
    retry: false,
  });

  const [title, setTitle] = useState("");
  const [uploading, setUploading] = useState(false);

  function refresh() {
    queryClient.invalidateQueries({ queryKey: ["closing-documents", row.applicationId] });
    queryClient.invalidateQueries({ queryKey: ["closing-board"] });
  }

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 25 * 1024 * 1024) {
      toast.error("Files must be 25 MB or smaller.");
      e.target.value = "";
      return;
    }
    setUploading(true);
    try {
      const safe = file.name.replace(/[^\w.\-]/g, "_");
      const path = `${row.offeringId}/${row.applicationId}/${crypto.randomUUID()}-${safe}`;
      const { error } = await supabase.storage.from("closing-documents").upload(path, file);
      if (error) throw new Error(error.message);
      await add({
        data: {
          application_id: row.applicationId,
          title: title.trim() || file.name.replace(/\.[^.]+$/, ""),
          file_name: file.name,
          storage_path: path,
          size_bytes: file.size,
        },
      });
      setTitle("");
      toast.success("Added to the investor's portal.");
      refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Upload failed.");
    } finally {
      setUploading(false);
      e.target.value = "";
    }
  }

  const removeMutation = useMutation({
    mutationFn: (id: string) => remove({ data: { id } }),
    onSuccess: () => {
      toast.success("Document removed.");
      refresh();
    },
    onError: (e: any) => toast.error(e?.message ?? "Could not remove that document."),
  });

  async function openDoc(id: string) {
    try {
      const res: any = await openUrl({ data: { id } });
      window.open(res.url, "_blank", "noopener");
    } catch (e: any) {
      toast.error(e?.message ?? "Could not open that file.");
    }
  }

  const docs = (data?.documents ?? []) as any[];

  return (
    <div className="space-y-3 rounded-lg border p-3">
      <p className="text-sm font-medium">Final documents</p>
      <p className="text-xs text-muted-foreground">
        Countersigned subscription agreement, closing statement, side letters — the investor sees
        these in their portal straight away.
      </p>

      <div className="grid gap-2 sm:grid-cols-2">
        <div className="space-y-1">
          <Label htmlFor={`title-${row.applicationId}`}>Title (optional)</Label>
          <Input
            id={`title-${row.applicationId}`}
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Countersigned subscription agreement"
          />
        </div>
        <div className="space-y-1">
          <Label htmlFor={`file-${row.applicationId}`}>File</Label>
          <Input
            id={`file-${row.applicationId}`}
            type="file"
            disabled={uploading}
            onChange={onFile}
          />
        </div>
      </div>

      {isLoading ? (
        <p className="text-xs text-muted-foreground">Loading documents…</p>
      ) : docs.length === 0 ? (
        <p className="text-xs text-muted-foreground">Nothing shared yet.</p>
      ) : (
        <ul className="space-y-2">
          {docs.map((d) => (
            <li key={d.id} className="flex flex-wrap items-center justify-between gap-2 text-sm">
              <span className="truncate">
                {d.title}
                <span className="text-muted-foreground">
                  {" "}
                  · {new Date(d.uploaded_at).toLocaleDateString()}
                </span>
              </span>
              <span className="flex gap-2">
                <Button size="sm" variant="outline" onClick={() => openDoc(d.id)}>
                  Open
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  disabled={removeMutation.isPending}
                  onClick={() => removeMutation.mutate(d.id)}
                >
                  Remove
                </Button>
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
