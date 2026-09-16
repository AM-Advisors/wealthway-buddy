import { useMemo, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";

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
  DialogTrigger,
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
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";

import {
  addTransferDocument,
  closeSecondaryTransfer,
  getCapSecondaries,
  recordRofrDecision,
  recordTransferConsent,
  reviewTransferRestrictions,
  saveSecondaryTransfer,
  withdrawSecondaryTransfer,
} from "@/lib/captable-secondaries.functions";

import { fmtDate, fmtMoney, fmtNumber, useCapTable } from "./captable-context";
import { CapTableError, CapTableSection } from "./captable-states";

type Data = Awaited<ReturnType<typeof getCapSecondaries>>;
type Transfer = Data["transfers"][number];

const STAGE_LABEL: Record<string, string> = {
  draft: "Draft",
  submitted: "Submitted",
  restriction_review: "Restriction review",
  rofr: "Right of first refusal",
  consent: "Awaiting company consent",
  approved: "Approved — ready to close",
  closed: "Closed to the ledger",
  rejected: "Rejected",
  withdrawn: "Withdrawn",
};

const STAGE_TONE: Record<string, "default" | "secondary" | "outline" | "destructive"> = {
  draft: "outline",
  submitted: "secondary",
  restriction_review: "secondary",
  rofr: "secondary",
  consent: "secondary",
  approved: "default",
  closed: "default",
  rejected: "destructive",
  withdrawn: "destructive",
};

const RESTRICTION_LABEL: Record<string, string> = {
  not_started: "Not reviewed",
  clear: "Clear",
  conditions: "Permitted with conditions",
  blocked: "Restricted",
};

const ROFR_LABEL: Record<string, string> = {
  not_started: "Not started",
  offered: "Offered — awaiting response",
  waived: "Waived",
  expired: "Expired unexercised",
  exercised: "Exercised by the company",
};

const CONSENT_LABEL: Record<string, string> = {
  pending: "Pending",
  granted: "Granted",
  denied: "Denied",
};

function num(value: string) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && value.trim() !== "" ? parsed : null;
}

function today() {
  return new Date().toISOString().slice(0, 10);
}

export function SecondariesView() {
  return (
    <CapTableSection>
      <Body />
    </CapTableSection>
  );
}

function Body() {
  const { workspace } = useCapTable();
  const companyId = workspace!.company!.id;
  const load = useServerFn(getCapSecondaries);

  const query = useQuery({
    queryKey: ["captable-secondaries", companyId],
    queryFn: () => load({ data: { companyId } }),
  });

  if (query.isLoading) return <Skeleton className="h-96 w-full" />;
  if (query.error) return <CapTableError error={query.error} />;
  const data = query.data!;
  const refetch = () => void query.refetch();

  return (
    <div className="space-y-6">
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Metric label="Open requests" value={String(data.totals.open)} hint="Not yet closed or declined" />
        <Metric label="In right of first refusal" value={String(data.totals.inRofr)} hint="Offer period running" />
        <Metric label="Awaiting consent" value={String(data.totals.awaitingConsent)} hint="Company decision due" />
        <Metric
          label="Shares in flight"
          value={fmtNumber(data.totals.sharesInFlight)}
          hint={`${fmtMoney(data.totals.valueInFlight, 0)} proposed value`}
        />
      </div>

      {!data.canManage ? (
        <Card className="border-dashed">
          <CardHeader>
            <CardTitle className="text-base">Viewing only</CardTitle>
            <CardDescription>
              {workspace!.company!.isDemo
                ? "This is the demo company. Switch to your own company in Settings to record a transfer."
                : "An authorised signatory on your account can record and decide transfer requests."}
            </CardDescription>
          </CardHeader>
        </Card>
      ) : (
        <TransferDialog data={data} companyId={companyId} onDone={refetch} />
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Transfer requests</CardTitle>
          <CardDescription>
            A request never changes ownership on its own. It moves through restriction review, right
            of first refusal and company consent, and only a closing posts it to the cap table.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4 pt-0">
          {data.transfers.length === 0 ? (
            <p className="rounded-lg border border-dashed py-10 text-center text-sm text-muted-foreground">
              No transfer requests recorded yet.
            </p>
          ) : (
            data.transfers.map((t) => (
              <TransferCard key={t.id} transfer={t} data={data} companyId={companyId} onDone={refetch} />
            ))
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function Metric({ label, value, hint }: { label: string; value: string; hint: string }) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardDescription>{label}</CardDescription>
        <CardTitle className="text-2xl">{value}</CardTitle>
      </CardHeader>
      <CardContent className="pt-0 text-xs text-muted-foreground">{hint}</CardContent>
    </Card>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid gap-1.5">
      <Label className="text-xs text-muted-foreground">{label}</Label>
      {children}
    </div>
  );
}

function Stage({ label, value, note }: { label: string; value: string; note?: string | null }) {
  return (
    <div className="rounded-lg border p-3">
      <p className="text-xs uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="text-sm font-medium">{value}</p>
      {note ? <p className="mt-1 text-xs text-muted-foreground">{note}</p> : null}
    </div>
  );
}

function TransferCard({
  transfer,
  data,
  companyId,
  onDone,
}: {
  transfer: Transfer;
  data: Data;
  companyId: string;
  onDone: () => void;
}) {
  const t = transfer;
  const live = !["closed", "rejected", "withdrawn"].includes(t.status);

  return (
    <div className="rounded-xl border p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="font-medium">
            {t.seller} → {t.buyer}
          </p>
          <p className="text-sm text-muted-foreground">
            {fmtNumber(t.quantity)} shares
            {t.pricePerShare ? ` at ${fmtMoney(t.pricePerShare, 4)} per share` : ""}
            {t.amount ? ` · ${fmtMoney(t.amount, 0)} proposed` : ""}
          </p>
          <p className="text-xs text-muted-foreground">
            Requested {fmtDate(t.requestedOn)}
            {t.holdingLabel ? ` · ${t.holdingLabel}` : ""}
          </p>
        </div>
        <Badge variant={STAGE_TONE[t.status] ?? "secondary"}>
          {STAGE_LABEL[t.status] ?? t.status}
        </Badge>
      </div>

      <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Stage
          label="Transfer restrictions"
          value={RESTRICTION_LABEL[t.restrictionStatus] ?? t.restrictionStatus}
          note={t.restrictionNote}
        />
        <Stage
          label="Right of first refusal"
          value={ROFR_LABEL[t.rofrStatus] ?? t.rofrStatus}
          note={t.rofrDeadline ? `Deadline ${fmtDate(t.rofrDeadline)}` : t.rofrNote}
        />
        <Stage
          label="Company consent"
          value={CONSENT_LABEL[t.consentStatus] ?? t.consentStatus}
          note={t.consentNote}
        />
        <Stage
          label="Closing"
          value={t.closedAt ? `Closed ${fmtDate(t.closingDate)}` : "Not closed"}
          note={t.closedAt ? "Posted to the cap table" : "Ownership unchanged until closing"}
        />
      </div>

      <div className="mt-4">
        <p className="text-xs uppercase tracking-wide text-muted-foreground">Documents</p>
        {t.documents.length === 0 ? (
          <p className="text-sm text-muted-foreground">No documents on file yet.</p>
        ) : (
          <ul className="mt-1 space-y-1 text-sm">
            {t.documents.map((d) => (
              <li key={d.id} className="text-muted-foreground">
                {d.title} <span className="text-xs">· {d.docType.replace(/_/g, " ")} · {fmtDate(d.createdAt)}</span>
              </li>
            ))}
          </ul>
        )}
      </div>

      {data.canManage && live ? (
        <div className="mt-4 flex flex-wrap gap-2">
          <RestrictionDialog companyId={companyId} transfer={t} onDone={onDone} />
          <RofrDialog companyId={companyId} transfer={t} onDone={onDone} />
          <ConsentDialog companyId={companyId} transfer={t} onDone={onDone} />
          <DocumentDialog companyId={companyId} transfer={t} onDone={onDone} />
          <CloseDialog companyId={companyId} transfer={t} onDone={onDone} />
          <TransferDialog
            data={data}
            companyId={companyId}
            transfer={t}
            onDone={onDone}
            trigger={<Button variant="ghost" size="sm">Edit</Button>}
          />
          <WithdrawDialog companyId={companyId} transfer={t} onDone={onDone} />
        </div>
      ) : null}
    </div>
  );
}

/* ------------------------------------------------------------------ dialogs */

function TransferDialog({
  data,
  companyId,
  onDone,
  transfer,
  trigger,
}: {
  data: Data;
  companyId: string;
  onDone: () => void;
  transfer?: Transfer;
  trigger?: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const [securityId, setSecurityId] = useState(transfer?.securityId ?? "");
  const [buyerMode, setBuyerMode] = useState(transfer?.buyerId ? "existing" : "new");
  const [buyerStakeholderId, setBuyerStakeholderId] = useState(transfer?.buyerId ?? "");
  const [buyerName, setBuyerName] = useState(transfer?.buyerId ? "" : (transfer?.buyer ?? ""));
  const [buyerEmail, setBuyerEmail] = useState(transfer?.buyerEmail ?? "");
  const [buyerType, setBuyerType] = useState(transfer?.buyerType ?? "investor");
  const [quantity, setQuantity] = useState(transfer ? String(transfer.quantity) : "");
  const [price, setPrice] = useState(transfer?.pricePerShare ? String(transfer.pricePerShare) : "");
  const [requestedOn, setRequestedOn] = useState(transfer?.requestedOn ?? today());
  const [notes, setNotes] = useState(transfer?.notes ?? "");

  const holding = useMemo(
    () => data.holdings.find((h) => h.id === securityId) ?? null,
    [data.holdings, securityId],
  );

  const save = useServerFn(saveSecondaryTransfer);
  const mutation = useMutation({
    mutationFn: () =>
      save({
        data: {
          companyId,
          id: transfer?.id ?? null,
          securityId,
          sellerStakeholderId: holding?.stakeholderId ?? "",
          buyerStakeholderId: buyerMode === "existing" ? buyerStakeholderId || null : null,
          buyerName: buyerMode === "new" ? buyerName : null,
          buyerEmail: buyerMode === "new" ? buyerEmail || null : null,
          buyerType: buyerMode === "new" ? buyerType : null,
          quantity: num(quantity) ?? 0,
          pricePerShare: num(price),
          requestedOn: requestedOn || null,
          notes: notes || null,
        },
      }),
    onSuccess: () => {
      toast.success(transfer ? "Transfer request updated." : "Transfer request recorded.");
      setOpen(false);
      onDone();
    },
    onError: (e: unknown) =>
      toast.error(e instanceof Error ? e.message : "Could not save the transfer request."),
  });

  const proposed = (num(quantity) ?? 0) * (num(price) ?? 0);
  const ready =
    Boolean(securityId) &&
    (num(quantity) ?? 0) > 0 &&
    (buyerMode === "existing" ? Boolean(buyerStakeholderId) : buyerName.trim().length > 1);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{trigger ?? <Button>New transfer request</Button>}</DialogTrigger>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{transfer ? "Edit transfer request" : "New transfer request"}</DialogTitle>
          <DialogDescription>
            Recording a request does not move any shares. It opens the review, right of first refusal
            and consent steps.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-3">
          <Field label="Seller's holding">
            <Select value={securityId} onValueChange={setSecurityId}>
              <SelectTrigger><SelectValue placeholder="Choose the holding being sold" /></SelectTrigger>
              <SelectContent>
                {data.holdings.map((h) => (
                  <SelectItem key={h.id} value={h.id}>
                    {h.stakeholder} · {h.label ?? h.securityType} · {fmtNumber(h.quantity)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          {holding?.restrictions ? (
            <p className="rounded-md bg-muted p-2 text-xs text-muted-foreground">
              Recorded restrictions: {holding.restrictions}
            </p>
          ) : null}

          <Field label="Buyer">
            <Select value={buyerMode} onValueChange={setBuyerMode}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="existing">Existing shareholder</SelectItem>
                <SelectItem value="new">New buyer</SelectItem>
              </SelectContent>
            </Select>
          </Field>

          {buyerMode === "existing" ? (
            <Field label="Choose the buyer">
              <Select value={buyerStakeholderId} onValueChange={setBuyerStakeholderId}>
                <SelectTrigger><SelectValue placeholder="Select shareholder" /></SelectTrigger>
                <SelectContent>
                  {data.stakeholders.map((s) => (
                    <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Buyer name">
                <Input value={buyerName} onChange={(e) => setBuyerName(e.target.value)} />
              </Field>
              <Field label="Buyer email">
                <Input value={buyerEmail} onChange={(e) => setBuyerEmail(e.target.value)} type="email" />
              </Field>
              <Field label="Buyer type">
                <Select value={buyerType} onValueChange={setBuyerType}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="investor">Investor</SelectItem>
                    <SelectItem value="entity">Entity</SelectItem>
                    <SelectItem value="fund">Fund</SelectItem>
                    <SelectItem value="spv">SPV</SelectItem>
                    <SelectItem value="employee">Employee</SelectItem>
                    <SelectItem value="other">Other</SelectItem>
                  </SelectContent>
                </Select>
              </Field>
            </div>
          )}

          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Shares to transfer">
              <Input value={quantity} onChange={(e) => setQuantity(e.target.value)} inputMode="decimal" />
            </Field>
            <Field label="Proposed price per share">
              <Input value={price} onChange={(e) => setPrice(e.target.value)} inputMode="decimal" />
            </Field>
            <Field label="Requested on">
              <Input type="date" value={requestedOn} onChange={(e) => setRequestedOn(e.target.value)} />
            </Field>
            <Field label="Proposed value">
              <Input value={proposed ? fmtMoney(proposed, 0) : "—"} readOnly disabled />
            </Field>
          </div>
          <Field label="Notes">
            <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} />
          </Field>
        </div>
        <DialogFooter>
          <Button onClick={() => mutation.mutate()} disabled={!ready || mutation.isPending}>
            {mutation.isPending ? "Saving…" : "Save request"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function RestrictionDialog({
  companyId,
  transfer,
  onDone,
}: {
  companyId: string;
  transfer: Transfer;
  onDone: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [outcome, setOutcome] = useState<"clear" | "conditions" | "blocked">("clear");
  const [note, setNote] = useState("");

  const run = useServerFn(reviewTransferRestrictions);
  const mutation = useMutation({
    mutationFn: () => run({ data: { companyId, id: transfer.id, outcome, note: note || null } }),
    onSuccess: () => {
      toast.success("Restriction review recorded.");
      setOpen(false);
      onDone();
    },
    onError: (e: unknown) => toast.error(e instanceof Error ? e.message : "Could not record the review."),
  });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">Restriction review</Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Transfer restriction review</DialogTitle>
          <DialogDescription>
            Record whether the company's transfer restrictions allow this sale.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-3">
          <Field label="Outcome">
            <Select value={outcome} onValueChange={(v) => setOutcome(v as typeof outcome)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="clear">No restriction blocks the sale</SelectItem>
                <SelectItem value="conditions">Permitted with conditions</SelectItem>
                <SelectItem value="blocked">Restricted — cannot proceed</SelectItem>
              </SelectContent>
            </Select>
          </Field>
          <Field label="Note">
            <Textarea value={note} onChange={(e) => setNote(e.target.value)} rows={3} />
          </Field>
        </div>
        <DialogFooter>
          <Button onClick={() => mutation.mutate()} disabled={mutation.isPending}>
            {mutation.isPending ? "Saving…" : "Record review"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function RofrDialog({
  companyId,
  transfer,
  onDone,
}: {
  companyId: string;
  transfer: Transfer;
  onDone: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [outcome, setOutcome] = useState<"offered" | "waived" | "expired" | "exercised">("offered");
  const [deadline, setDeadline] = useState(transfer.rofrDeadline ?? "");
  const [note, setNote] = useState("");

  const run = useServerFn(recordRofrDecision);
  const mutation = useMutation({
    mutationFn: () =>
      run({ data: { companyId, id: transfer.id, outcome, deadline: deadline || null, note: note || null } }),
    onSuccess: () => {
      toast.success("Right of first refusal updated.");
      setOpen(false);
      onDone();
    },
    onError: (e: unknown) => toast.error(e instanceof Error ? e.message : "Could not record the decision."),
  });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">Right of first refusal</Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Right of first refusal</DialogTitle>
          <DialogDescription>
            Record the offer to the company and how the period ended.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-3">
          <Field label="Outcome">
            <Select value={outcome} onValueChange={(v) => setOutcome(v as typeof outcome)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="offered">Offered — awaiting response</SelectItem>
                <SelectItem value="waived">Waived</SelectItem>
                <SelectItem value="expired">Expired unexercised</SelectItem>
                <SelectItem value="exercised">Exercised by the company</SelectItem>
              </SelectContent>
            </Select>
          </Field>
          <Field label="Response deadline">
            <Input type="date" value={deadline} onChange={(e) => setDeadline(e.target.value)} />
          </Field>
          <Field label="Note">
            <Textarea value={note} onChange={(e) => setNote(e.target.value)} rows={3} />
          </Field>
        </div>
        <DialogFooter>
          <Button onClick={() => mutation.mutate()} disabled={mutation.isPending}>
            {mutation.isPending ? "Saving…" : "Record outcome"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ConsentDialog({
  companyId,
  transfer,
  onDone,
}: {
  companyId: string;
  transfer: Transfer;
  onDone: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [decision, setDecision] = useState<"granted" | "denied">("granted");
  const [note, setNote] = useState("");

  const run = useServerFn(recordTransferConsent);
  const mutation = useMutation({
    mutationFn: () => run({ data: { companyId, id: transfer.id, decision, note } }),
    onSuccess: () => {
      toast.success("Consent decision recorded.");
      setOpen(false);
      onDone();
    },
    onError: (e: unknown) => toast.error(e instanceof Error ? e.message : "Could not record consent."),
  });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">Company consent</Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Company consent</DialogTitle>
          <DialogDescription>
            Record the company's decision on this transfer, and who authorised it.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-3">
          <Field label="Decision">
            <Select value={decision} onValueChange={(v) => setDecision(v as typeof decision)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="granted">Consent granted</SelectItem>
                <SelectItem value="denied">Consent denied</SelectItem>
              </SelectContent>
            </Select>
          </Field>
          <Field label="Authority and reason">
            <Textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              rows={3}
              placeholder="Board approval dated…"
            />
          </Field>
        </div>
        <DialogFooter>
          <Button onClick={() => mutation.mutate()} disabled={note.trim().length < 3 || mutation.isPending}>
            {mutation.isPending ? "Saving…" : "Record decision"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function DocumentDialog({
  companyId,
  transfer,
  onDone,
}: {
  companyId: string;
  transfer: Transfer;
  onDone: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [docType, setDocType] = useState("transfer_agreement");

  const run = useServerFn(addTransferDocument);
  const mutation = useMutation({
    mutationFn: () => run({ data: { companyId, transferId: transfer.id, title, docType } }),
    onSuccess: () => {
      toast.success("Document recorded against the transfer.");
      setOpen(false);
      setTitle("");
      onDone();
    },
    onError: (e: unknown) => toast.error(e instanceof Error ? e.message : "Could not record the document."),
  });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">Add document</Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Record a transfer document</DialogTitle>
          <DialogDescription>
            Keep the signed paperwork listed against this transfer file.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-3">
          <Field label="Document title">
            <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Stock transfer agreement" />
          </Field>
          <Field label="Type">
            <Select value={docType} onValueChange={setDocType}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="transfer_agreement">Transfer agreement</SelectItem>
                <SelectItem value="rofr_waiver">Right of first refusal waiver</SelectItem>
                <SelectItem value="board_consent">Board consent</SelectItem>
                <SelectItem value="stock_power">Stock power</SelectItem>
                <SelectItem value="other">Other</SelectItem>
              </SelectContent>
            </Select>
          </Field>
        </div>
        <DialogFooter>
          <Button onClick={() => mutation.mutate()} disabled={title.trim().length < 2 || mutation.isPending}>
            {mutation.isPending ? "Saving…" : "Record document"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function CloseDialog({
  companyId,
  transfer,
  onDone,
}: {
  companyId: string;
  transfer: Transfer;
  onDone: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [closingDate, setClosingDate] = useState(today());
  const [reason, setReason] = useState("");

  const run = useServerFn(closeSecondaryTransfer);
  const mutation = useMutation({
    mutationFn: () => run({ data: { companyId, id: transfer.id, closingDate, reason } }),
    onSuccess: () => {
      toast.success("Transfer closed and posted to the cap table.");
      setOpen(false);
      onDone();
    },
    onError: (e: unknown) => toast.error(e instanceof Error ? e.message : "Could not close the transfer."),
  });

  const ready = transfer.status === "approved" && transfer.consentStatus === "granted";

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" disabled={!ready}>Close to the cap table</Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Close the transfer</DialogTitle>
          <DialogDescription>
            This moves {fmtNumber(transfer.quantity)} shares from {transfer.seller} to {transfer.buyer}
            {" "}and updates ownership. It cannot be undone — record a correcting transaction instead.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-3">
          <Field label="Closing date">
            <Input type="date" value={closingDate} onChange={(e) => setClosingDate(e.target.value)} />
          </Field>
          <Field label="Reason for the record">
            <Textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              rows={3}
              placeholder="Secondary sale closed under consent dated…"
            />
          </Field>
        </div>
        <DialogFooter>
          <Button onClick={() => mutation.mutate()} disabled={reason.trim().length < 3 || mutation.isPending}>
            {mutation.isPending ? "Closing…" : "Close and update the cap table"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function WithdrawDialog({
  companyId,
  transfer,
  onDone,
}: {
  companyId: string;
  transfer: Transfer;
  onDone: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");

  const run = useServerFn(withdrawSecondaryTransfer);
  const mutation = useMutation({
    mutationFn: () => run({ data: { companyId, id: transfer.id, reason } }),
    onSuccess: () => {
      toast.success("Transfer request withdrawn.");
      setOpen(false);
      onDone();
    },
    onError: (e: unknown) => toast.error(e instanceof Error ? e.message : "Could not withdraw the request."),
  });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="ghost" size="sm">Withdraw</Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Withdraw this request</DialogTitle>
          <DialogDescription>The request stays on the record, marked withdrawn.</DialogDescription>
        </DialogHeader>
        <Field label="Reason">
          <Textarea value={reason} onChange={(e) => setReason(e.target.value)} rows={3} />
        </Field>
        <DialogFooter>
          <Button
            variant="destructive"
            onClick={() => mutation.mutate()}
            disabled={reason.trim().length < 3 || mutation.isPending}
          >
            {mutation.isPending ? "Saving…" : "Withdraw request"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
