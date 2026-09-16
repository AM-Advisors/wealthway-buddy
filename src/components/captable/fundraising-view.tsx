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
import { Textarea } from "@/components/ui/textarea";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";

import {
  INSTRUMENTS,
  ROUND_TYPES,
  closeRoundInvestment,
  getCapFundraising,
  saveCapRound,
  saveRoundInvestment,
  setInvestmentStatus,
} from "@/lib/captable-fundraising.functions";

import { fmtDate, fmtMoney, fmtNumber, useCapTable } from "./captable-context";
import { CapTableError, CapTableSection } from "./captable-states";

type Data = Awaited<ReturnType<typeof getCapFundraising>>;
type Investment = Data["investments"][number];

const STATUS_TONE: Record<string, "default" | "secondary" | "outline" | "destructive"> = {
  draft: "outline",
  committed: "secondary",
  signed: "secondary",
  funded: "default",
  closed: "default",
  cancelled: "destructive",
};

const STATUS_LABEL: Record<string, string> = {
  draft: "Draft",
  committed: "Committed",
  signed: "Signed",
  funded: "Funded",
  closed: "On the ledger",
  cancelled: "Cancelled",
};

function num(value: string) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && value.trim() !== "" ? parsed : null;
}

export function FundraisingView() {
  return (
    <CapTableSection>
      <Body />
    </CapTableSection>
  );
}

function Body() {
  const { workspace } = useCapTable();
  const companyId = workspace!.company!.id;
  const load = useServerFn(getCapFundraising);

  const query = useQuery({
    queryKey: ["captable-fundraising", companyId],
    queryFn: () => load({ data: { companyId } }),
  });

  if (query.isLoading) return <Skeleton className="h-96 w-full" />;
  if (query.error) return <CapTableError error={query.error} />;
  const data = query.data!;
  const refetch = () => void query.refetch();

  return (
    <div className="space-y-6">
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Metric label="Committed" value={fmtMoney(data.totals.committed, 0)} hint="All live commitments" />
        <Metric label="Funded" value={fmtMoney(data.totals.funded, 0)} hint="Money received" />
        <Metric
          label="Closed to the ledger"
          value={fmtMoney(data.totals.closed, 0)}
          hint="Securities issued"
        />
        <Metric
          label="Convertibles outstanding"
          value={fmtMoney(data.totals.safePrincipal + data.totals.notePrincipal, 0)}
          hint="SAFEs and notes on record"
        />
      </div>

      {!data.canManage ? (
        <Card className="border-dashed">
          <CardHeader>
            <CardTitle className="text-base">Viewing only</CardTitle>
            <CardDescription>
              {workspace!.company!.isDemo
                ? "This is the demo company. Switch to your own company in Settings to record a financing."
                : "An authorised signatory on your account can record rounds and investments."}
            </CardDescription>
          </CardHeader>
        </Card>
      ) : (
        <div className="flex flex-wrap gap-2">
          <RoundDialog companyId={companyId} onDone={refetch} />
          <InvestmentDialog data={data} companyId={companyId} onDone={refetch} />
        </div>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Rounds</CardTitle>
          <CardDescription>
            Priced rounds, SAFE and note rounds, with what is committed against each
          </CardDescription>
        </CardHeader>
        <CardContent className="pt-0">
          <div className="overflow-x-auto rounded-lg border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Round</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Close date</TableHead>
                  <TableHead className="text-right">Target</TableHead>
                  <TableHead className="text-right">Committed</TableHead>
                  <TableHead className="text-right">Funded</TableHead>
                  <TableHead className="text-right">On ledger</TableHead>
                  <TableHead className="text-right">Price</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.rounds.map((r) => (
                  <TableRow key={r.id}>
                    <TableCell className="font-medium">
                      {r.name}
                      {r.leadInvestor ? (
                        <span className="block text-xs text-muted-foreground">
                          Lead: {r.leadInvestor}
                        </span>
                      ) : null}
                    </TableCell>
                    <TableCell className="capitalize text-muted-foreground">{r.roundType}</TableCell>
                    <TableCell className="capitalize">{r.status}</TableCell>
                    <TableCell>{fmtDate(r.closeDate)}</TableCell>
                    <TableCell className="text-right">{fmtMoney(r.targetAmount, 0)}</TableCell>
                    <TableCell className="text-right">{fmtMoney(r.committed, 0)}</TableCell>
                    <TableCell className="text-right">{fmtMoney(r.funded, 0)}</TableCell>
                    <TableCell className="text-right">{fmtMoney(r.closed, 0)}</TableCell>
                    <TableCell className="text-right">{fmtMoney(r.pricePerShare, 4)}</TableCell>
                  </TableRow>
                ))}
                {data.rounds.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={9} className="py-6 text-center text-muted-foreground">
                      No rounds recorded yet.
                    </TableCell>
                  </TableRow>
                ) : null}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Investments</CardTitle>
          <CardDescription>
            A commitment never changes the cap table on its own. Mark it funded, then close it to the
            ledger to issue the security.
          </CardDescription>
        </CardHeader>
        <CardContent className="pt-0">
          <div className="overflow-x-auto rounded-lg border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Investor</TableHead>
                  <TableHead>Instrument</TableHead>
                  <TableHead>Round</TableHead>
                  <TableHead className="text-right">Amount</TableHead>
                  <TableHead className="text-right">Shares</TableHead>
                  <TableHead>Terms</TableHead>
                  <TableHead>Status</TableHead>
                  {data.canManage ? <TableHead className="text-right">Actions</TableHead> : null}
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.investments.map((i) => (
                  <TableRow key={i.id}>
                    <TableCell className="font-medium">{i.stakeholder}</TableCell>
                    <TableCell>{i.instrumentLabel}</TableCell>
                    <TableCell className="text-muted-foreground">{i.roundName ?? "—"}</TableCell>
                    <TableCell className="text-right">{fmtMoney(i.amount, 0)}</TableCell>
                    <TableCell className="text-right">{fmtNumber(i.shares)}</TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {terms(i) || "—"}
                    </TableCell>
                    <TableCell>
                      <Badge variant={STATUS_TONE[i.status] ?? "secondary"}>
                        {STATUS_LABEL[i.status] ?? i.status}
                      </Badge>
                    </TableCell>
                    {data.canManage ? (
                      <TableCell className="text-right">
                        <RowActions data={data} investment={i} companyId={companyId} onDone={refetch} />
                      </TableCell>
                    ) : null}
                  </TableRow>
                ))}
                {data.investments.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={data.canManage ? 8 : 7} className="py-6 text-center text-muted-foreground">
                      No investments recorded yet.
                    </TableCell>
                  </TableRow>
                ) : null}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function terms(i: Investment) {
  const parts: string[] = [];
  if (i.pricePerShare) parts.push(`${fmtMoney(i.pricePerShare, 4)}/share`);
  if (i.valuationCap) parts.push(`Cap ${fmtMoney(i.valuationCap, 0)}`);
  if (i.discountRate) parts.push(`${i.discountRate}% discount`);
  if (i.interestRate) parts.push(`${i.interestRate}% interest`);
  if (i.maturityDate) parts.push(`Matures ${fmtDate(i.maturityDate)}`);
  return parts.join(" · ");
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

/* ------------------------------------------------------------------ dialogs */

function RoundDialog({ companyId, onDone }: { companyId: string; onDone: () => void }) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [roundType, setRoundType] = useState("priced");
  const [status, setStatus] = useState("open");
  const [closeDate, setCloseDate] = useState("");
  const [preMoney, setPreMoney] = useState("");
  const [pricePerShare, setPricePerShare] = useState("");
  const [targetAmount, setTargetAmount] = useState("");
  const [leadInvestor, setLeadInvestor] = useState("");
  const [notes, setNotes] = useState("");

  const save = useServerFn(saveCapRound);
  const mutation = useMutation({
    mutationFn: () =>
      save({
        data: {
          companyId,
          name,
          roundType,
          status,
          closeDate: closeDate || null,
          preMoney: num(preMoney),
          pricePerShare: num(pricePerShare),
          targetAmount: num(targetAmount),
          leadInvestor: leadInvestor || null,
          notes: notes || null,
        },
      }),
    onSuccess: () => {
      toast.success("Round recorded.");
      setOpen(false);
      setName("");
      setNotes("");
      onDone();
    },
    onError: (e: unknown) => toast.error(e instanceof Error ? e.message : "Could not save the round."),
  });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button>New round</Button>
      </DialogTrigger>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>New financing round</DialogTitle>
          <DialogDescription>
            Creating a round does not change ownership. Investments close to the ledger one by one.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-3">
          <Field label="Round name">
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Series A" />
          </Field>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Type">
              <Select value={roundType} onValueChange={setRoundType}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {ROUND_TYPES.map((t) => (
                    <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
            <Field label="Status">
              <Select value={status} onValueChange={setStatus}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="open">Open</SelectItem>
                  <SelectItem value="closed">Closed</SelectItem>
                  <SelectItem value="cancelled">Cancelled</SelectItem>
                </SelectContent>
              </Select>
            </Field>
            <Field label="Target amount">
              <Input value={targetAmount} onChange={(e) => setTargetAmount(e.target.value)} inputMode="decimal" />
            </Field>
            <Field label="Pre-money valuation">
              <Input value={preMoney} onChange={(e) => setPreMoney(e.target.value)} inputMode="decimal" />
            </Field>
            <Field label="Price per share">
              <Input value={pricePerShare} onChange={(e) => setPricePerShare(e.target.value)} inputMode="decimal" />
            </Field>
            <Field label="Close date">
              <Input type="date" value={closeDate} onChange={(e) => setCloseDate(e.target.value)} />
            </Field>
          </div>
          <Field label="Lead investor">
            <Input value={leadInvestor} onChange={(e) => setLeadInvestor(e.target.value)} />
          </Field>
          <Field label="Notes">
            <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} />
          </Field>
        </div>
        <DialogFooter>
          <Button
            onClick={() => mutation.mutate()}
            disabled={!name.trim() || mutation.isPending}
          >
            {mutation.isPending ? "Saving…" : "Save round"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function InvestmentDialog({
  data,
  companyId,
  onDone,
  investment,
  trigger,
}: {
  data: Data;
  companyId: string;
  onDone: () => void;
  investment?: Investment;
  trigger?: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const [stakeholderId, setStakeholderId] = useState(investment?.stakeholderId ?? "");
  const [roundId, setRoundId] = useState(investment?.roundId ?? "none");
  const [classId, setClassId] = useState(investment?.classId ?? "none");
  const [instrument, setInstrument] = useState(investment?.instrument ?? "priced");
  const [amount, setAmount] = useState(investment ? String(investment.amount) : "");
  const [shares, setShares] = useState(investment?.shares ? String(investment.shares) : "");
  const [pricePerShare, setPricePerShare] = useState(
    investment?.pricePerShare ? String(investment.pricePerShare) : "",
  );
  const [valuationCap, setValuationCap] = useState(
    investment?.valuationCap ? String(investment.valuationCap) : "",
  );
  const [discountRate, setDiscountRate] = useState(
    investment?.discountRate ? String(investment.discountRate) : "",
  );
  const [interestRate, setInterestRate] = useState(
    investment?.interestRate ? String(investment.interestRate) : "",
  );
  const [maturityDate, setMaturityDate] = useState(investment?.maturityDate ?? "");
  const [commitmentDate, setCommitmentDate] = useState(investment?.commitmentDate ?? "");
  const [notes, setNotes] = useState(investment?.notes ?? "");

  const convertible = instrument === "safe" || instrument === "note";
  const save = useServerFn(saveRoundInvestment);

  const mutation = useMutation({
    mutationFn: () =>
      save({
        data: {
          companyId,
          id: investment?.id ?? null,
          roundId: roundId === "none" ? null : roundId,
          stakeholderId,
          classId: classId === "none" ? null : classId,
          instrument,
          amount: num(amount) ?? 0,
          shares: convertible ? null : num(shares),
          pricePerShare: convertible ? null : num(pricePerShare),
          valuationCap: convertible ? num(valuationCap) : null,
          discountRate: convertible ? num(discountRate) : null,
          interestRate: instrument === "note" ? num(interestRate) : null,
          maturityDate: instrument === "note" ? maturityDate || null : null,
          commitmentDate: commitmentDate || null,
          status: investment?.status ?? "committed",
          notes: notes || null,
        },
      }),
    onSuccess: () => {
      toast.success(investment ? "Investment updated." : "Investment recorded.");
      setOpen(false);
      onDone();
    },
    onError: (e: unknown) =>
      toast.error(e instanceof Error ? e.message : "Could not save the investment."),
  });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {trigger ?? <Button variant="outline">Record investment</Button>}
      </DialogTrigger>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{investment ? "Edit investment" : "Record an investment"}</DialogTitle>
          <DialogDescription>
            Commitments, SAFEs, notes and direct investments are held here until they are funded and
            closed to the ledger.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-3">
          <Field label="Investor">
            <Select value={stakeholderId} onValueChange={setStakeholderId}>
              <SelectTrigger><SelectValue placeholder="Choose an investor" /></SelectTrigger>
              <SelectContent>
                {data.stakeholders.map((s) => (
                  <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Instrument">
              <Select value={instrument} onValueChange={setInstrument}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {INSTRUMENTS.map((i) => (
                    <SelectItem key={i.value} value={i.value}>{i.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
            <Field label="Round">
              <Select value={roundId} onValueChange={setRoundId}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">No round</SelectItem>
                  {data.rounds.map((r) => (
                    <SelectItem key={r.id} value={r.id}>{r.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
            <Field label="Amount">
              <Input value={amount} onChange={(e) => setAmount(e.target.value)} inputMode="decimal" />
            </Field>
            <Field label="Commitment date">
              <Input type="date" value={commitmentDate} onChange={(e) => setCommitmentDate(e.target.value)} />
            </Field>
            {convertible ? (
              <>
                <Field label="Valuation cap">
                  <Input value={valuationCap} onChange={(e) => setValuationCap(e.target.value)} inputMode="decimal" />
                </Field>
                <Field label="Discount (%)">
                  <Input value={discountRate} onChange={(e) => setDiscountRate(e.target.value)} inputMode="decimal" />
                </Field>
              </>
            ) : (
              <>
                <Field label="Share class">
                  <Select value={classId} onValueChange={setClassId}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">No class</SelectItem>
                      {data.classes.map((c) => (
                        <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </Field>
                <Field label="Price per share">
                  <Input value={pricePerShare} onChange={(e) => setPricePerShare(e.target.value)} inputMode="decimal" />
                </Field>
                <Field label="Shares">
                  <Input value={shares} onChange={(e) => setShares(e.target.value)} inputMode="decimal" />
                </Field>
              </>
            )}
            {instrument === "note" ? (
              <>
                <Field label="Interest (%)">
                  <Input value={interestRate} onChange={(e) => setInterestRate(e.target.value)} inputMode="decimal" />
                </Field>
                <Field label="Maturity date">
                  <Input type="date" value={maturityDate} onChange={(e) => setMaturityDate(e.target.value)} />
                </Field>
              </>
            ) : null}
          </div>
          <Field label="Notes">
            <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} />
          </Field>
        </div>
        <DialogFooter>
          <Button
            onClick={() => mutation.mutate()}
            disabled={!stakeholderId || !amount.trim() || mutation.isPending}
          >
            {mutation.isPending ? "Saving…" : "Save investment"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function RowActions({
  data,
  investment,
  companyId,
  onDone,
}: {
  data: Data;
  investment: Investment;
  companyId: string;
  onDone: () => void;
}) {
  const setStatus = useServerFn(setInvestmentStatus);
  const statusMutation = useMutation({
    mutationFn: (status: "signed" | "funded" | "cancelled") =>
      setStatus({ data: { companyId, id: investment.id, status } }),
    onSuccess: () => {
      toast.success("Investment updated.");
      onDone();
    },
    onError: (e: unknown) => toast.error(e instanceof Error ? e.message : "Could not update."),
  });

  const next = useMemo(() => {
    if (investment.status === "committed") return "signed" as const;
    if (investment.status === "signed") return "funded" as const;
    return null;
  }, [investment.status]);

  if (investment.status === "closed") {
    return <span className="text-xs text-muted-foreground">Closed {fmtDate(investment.closedAt)}</span>;
  }
  if (investment.status === "cancelled") {
    return <span className="text-xs text-muted-foreground">Cancelled</span>;
  }

  return (
    <div className="flex flex-wrap justify-end gap-2">
      {next ? (
        <Button size="sm" variant="outline" disabled={statusMutation.isPending} onClick={() => statusMutation.mutate(next)}>
          Mark {next}
        </Button>
      ) : null}
      {investment.status === "funded" ? (
        <CloseDialog investment={investment} companyId={companyId} onDone={onDone} />
      ) : null}
      <InvestmentDialog
        data={data}
        companyId={companyId}
        onDone={onDone}
        investment={investment}
        trigger={<Button size="sm" variant="ghost">Edit</Button>}
      />
      <Button
        size="sm"
        variant="ghost"
        disabled={statusMutation.isPending}
        onClick={() => statusMutation.mutate("cancelled")}
      >
        Cancel
      </Button>
    </div>
  );
}

function CloseDialog({
  investment,
  companyId,
  onDone,
}: {
  investment: Investment;
  companyId: string;
  onDone: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [issueDate, setIssueDate] = useState(new Date().toISOString().slice(0, 10));
  const [shares, setShares] = useState(investment.shares ? String(investment.shares) : "");
  const [pricePerShare, setPricePerShare] = useState(
    investment.pricePerShare ? String(investment.pricePerShare) : "",
  );
  const [reason, setReason] = useState("");

  const close = useServerFn(closeRoundInvestment);
  const mutation = useMutation({
    mutationFn: () =>
      close({
        data: {
          companyId,
          id: investment.id,
          issueDate,
          shares: num(shares),
          pricePerShare: num(pricePerShare),
          classId: investment.classId,
          reason,
        },
      }),
    onSuccess: () => {
      toast.success("Security issued and recorded on the cap table.");
      setOpen(false);
      onDone();
    },
    onError: (e: unknown) => toast.error(e instanceof Error ? e.message : "Could not close."),
  });

  const convertible = investment.instrument === "safe" || investment.instrument === "note";

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm">Close to ledger</Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Close to the ledger</DialogTitle>
          <DialogDescription>
            This issues {investment.stakeholder}&apos;s {investment.instrumentLabel.toLowerCase()} and
            records a dated transaction. It cannot be edited afterwards.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-3">
          <Field label="Issue date">
            <Input type="date" value={issueDate} onChange={(e) => setIssueDate(e.target.value)} />
          </Field>
          {convertible ? null : (
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Shares">
                <Input value={shares} onChange={(e) => setShares(e.target.value)} inputMode="decimal" />
              </Field>
              <Field label="Price per share">
                <Input value={pricePerShare} onChange={(e) => setPricePerShare(e.target.value)} inputMode="decimal" />
              </Field>
            </div>
          )}
          <Field label="Reason for the record">
            <Textarea value={reason} onChange={(e) => setReason(e.target.value)} rows={2} placeholder="Series A first close" />
          </Field>
        </div>
        <DialogFooter>
          <Button onClick={() => mutation.mutate()} disabled={reason.trim().length < 3 || mutation.isPending}>
            {mutation.isPending ? "Recording…" : "Issue and record"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
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
