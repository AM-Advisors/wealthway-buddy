import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";

import {
  acceptCapGrant,
  getMyEquity,
  requestCapExercise,
  withdrawCapExercise,
} from "@/lib/captable-equity.functions";
import { computeVesting, vestingTranches, type VestingSchedule } from "@/lib/vesting";
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
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";

import { fmtDate, fmtMoney, fmtNumber } from "./captable-context";

type Equity = Awaited<ReturnType<typeof getMyEquity>>;
type Holding = Equity["holdings"][number];
type Grant = Holding["grants"][number];

export function MyEquityView() {
  const load = useServerFn(getMyEquity);
  const queryClient = useQueryClient();
  const { data, isLoading, error } = useQuery({
    queryKey: ["my-equity"],
    queryFn: () => load(),
  });

  const refresh = () => queryClient.invalidateQueries({ queryKey: ["my-equity"] });

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  if (error) {
    return (
      <Card role="alert" className="border-destructive/40">
        <CardHeader>
          <CardTitle className="text-base">We could not load your equity</CardTitle>
          <CardDescription>
            {error instanceof Error ? error.message : "Please try again in a moment."}
          </CardDescription>
        </CardHeader>
      </Card>
    );
  }

  const holdings = data?.holdings ?? [];

  if (holdings.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Nothing recorded against your account yet</CardTitle>
          <CardDescription>
            When a company records equity in your name, it appears here. If you expect something,
            ask your company to check the email address on your record.
          </CardDescription>
        </CardHeader>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      {holdings.map((holding) => (
        <HoldingPanel key={holding.stakeholderId} holding={holding} onChanged={refresh} />
      ))}
      <p className="text-xs text-muted-foreground">
        These are recordkeeping figures held by your company. They are not investment advice, a
        valuation, or a tax statement.
      </p>
    </div>
  );
}

function HoldingPanel({ holding, onChanged }: { holding: Holding; onChanged: () => void }) {
  const totals = holding.grants.reduce(
    (acc, grant) => {
      const v = computeVesting(grant.quantity, grant.schedule);
      acc.quantity += grant.quantity;
      acc.vested += v.vested;
      acc.unvested += v.unvested;
      return acc;
    },
    { quantity: 0, vested: 0, unvested: 0 },
  );
  const pendingAcceptance = holding.grants.filter((g) => !g.acceptedAt).length;

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="gap-1">
          <CardTitle className="flex flex-wrap items-center gap-2 text-base">
            {holding.company.name}
            {holding.company.isDemo ? <Badge variant="secondary">Demo data</Badge> : null}
          </CardTitle>
          <CardDescription>
            Recorded as {holding.name}
            {holding.title ? ` · ${holding.title}` : ""}
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-3 sm:grid-cols-3">
          <Stat label="Total granted" value={fmtNumber(totals.quantity)} />
          <Stat label="Vested today" value={fmtNumber(totals.vested)} />
          <Stat label="Still to vest" value={fmtNumber(totals.unvested)} />
        </CardContent>
      </Card>

      {pendingAcceptance > 0 ? (
        <Card className="border-primary/40">
          <CardHeader>
            <CardTitle className="text-base">
              {pendingAcceptance} {pendingAcceptance === 1 ? "grant needs" : "grants need"} your
              acceptance
            </CardTitle>
            <CardDescription>
              Accepting records that you have seen the terms. It does not change the grant.
            </CardDescription>
          </CardHeader>
        </Card>
      ) : null}

      <Tabs defaultValue="grants">
        <TabsList className="w-full justify-start overflow-x-auto">
          <TabsTrigger value="grants">My grants</TabsTrigger>
          {holding.permissions.canViewTransactions ? (
            <TabsTrigger value="history">History</TabsTrigger>
          ) : null}
          <TabsTrigger value="requests">
            Requests{holding.exerciseRequests.length ? ` (${holding.exerciseRequests.length})` : ""}
          </TabsTrigger>
        </TabsList>

        <TabsContent value="grants" className="mt-4 space-y-4">
          {holding.grants.length === 0 ? (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Nothing to show</CardTitle>
                <CardDescription>
                  Your company has not shared holding details with you.
                </CardDescription>
              </CardHeader>
            </Card>
          ) : (
            holding.grants.map((grant) => (
              <GrantCard
                key={grant.id}
                grant={grant}
                canRequestExercise={holding.permissions.canRequestExercise}
                showVesting={holding.permissions.canViewVesting}
                showDocuments={holding.permissions.canViewDocuments}
                onChanged={onChanged}
              />
            ))
          )}
        </TabsContent>

        {holding.permissions.canViewTransactions ? (
          <TabsContent value="history" className="mt-4">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Everything recorded on your equity</CardTitle>
                <CardDescription>Dated changes, newest first.</CardDescription>
              </CardHeader>
              <CardContent>
                {holding.transactions.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No changes recorded yet.</p>
                ) : (
                  <ul className="space-y-2 text-sm">
                    {holding.transactions.map((tx) => (
                      <li key={tx.id} className="flex flex-wrap justify-between gap-2 border-b pb-2 last:border-0">
                        <span className="capitalize">{tx.kind.replace(/_/g, " ")}</span>
                        <span className="text-muted-foreground">
                          {fmtNumber(tx.quantity)} · {fmtDate(tx.effectiveDate)} · {tx.status}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        ) : null}

        <TabsContent value="requests" className="mt-4 space-y-3">
          {holding.exerciseRequests.length === 0 ? (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">No requests yet</CardTitle>
                <CardDescription>
                  Requests you send stay pending until your company records a decision.
                </CardDescription>
              </CardHeader>
            </Card>
          ) : (
            holding.exerciseRequests.map((request) => (
              <RequestCard key={request.id} request={request} onChanged={onChanged} />
            ))
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}

function VestingTable({
  quantity,
  schedule,
}: {
  quantity: number;
  schedule: VestingSchedule;
}) {
  const [showAll, setShowAll] = useState(false);
  const tranches = vestingTranches(quantity, schedule);
  if (tranches.length === 0) return null;
  const firstUpcoming = tranches.findIndex((t) => !t.vested);
  const visible = showAll
    ? tranches
    : tranches.slice(Math.max(firstUpcoming, 0), Math.max(firstUpcoming, 0) + 4);

  return (
    <div className="rounded-lg border">
      <div className="flex items-center justify-between border-b px-3 py-2">
        <p className="text-sm font-medium">
          {showAll ? "Every vesting date" : "What vests next"}
        </p>
        <Button size="sm" variant="ghost" onClick={() => setShowAll((v) => !v)}>
          {showAll ? "Show next few" : `Show all ${tranches.length}`}
        </Button>
      </div>
      <ul className="divide-y text-sm">
        {visible.map((tranche) => (
          <li key={tranche.date} className="flex items-center justify-between gap-3 px-3 py-1.5">
            <span className={tranche.vested ? "text-muted-foreground" : ""}>
              {fmtDate(tranche.date)}
            </span>
            <span className="tabular-nums">
              +{fmtNumber(tranche.quantity)}
              <span className="ml-2 text-xs text-muted-foreground">
                {tranche.vested ? "vested" : "to come"} · {fmtNumber(tranche.cumulative)} total
              </span>
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border bg-muted/30 px-3 py-2">
      <p className="text-xs uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="text-lg font-semibold">{value}</p>
    </div>
  );
}

function GrantCard({
  grant,
  canRequestExercise,
  showVesting,
  showDocuments,
  onChanged,
}: {
  grant: Grant;
  canRequestExercise: boolean;
  showVesting: boolean;
  showDocuments: boolean;
  onChanged: () => void;
}) {
  const vesting = computeVesting(grant.quantity, grant.schedule);
  const [acceptOpen, setAcceptOpen] = useState(false);
  const [exerciseOpen, setExerciseOpen] = useState(false);
  const isOption = grant.securityType.includes("option");

  return (
    <Card>
      <CardHeader className="gap-1">
        <CardTitle className="flex flex-wrap items-center gap-2 text-base capitalize">
          {grant.securityType.replace(/_/g, " ")}
          {grant.label ? <span className="text-muted-foreground">· {grant.label}</span> : null}
          {grant.acceptedAt ? (
            <Badge variant="secondary">Accepted</Badge>
          ) : (
            <Badge variant="outline">Needs acceptance</Badge>
          )}
        </CardTitle>
        <CardDescription>
          {fmtNumber(grant.quantity)} shares · issued {fmtDate(grant.issueDate)}
          {grant.exercisePrice !== null ? ` · exercise price ${fmtMoney(grant.exercisePrice, 4)}` : ""}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {showVesting && grant.schedule ? (
          <div className="space-y-2">
            <Progress value={Math.min(vesting.percent, 100)} />
            <div className="grid gap-3 sm:grid-cols-4">
              <Stat label="Vested" value={fmtNumber(vesting.vested)} />
              <Stat label="Unvested" value={fmtNumber(vesting.unvested)} />
              <Stat label="Next vest" value={vesting.nextVestDate ? fmtDate(vesting.nextVestDate) : "Fully vested"} />
              <Stat
                label="Fully vested"
                value={vesting.fullyVestedDate ? fmtDate(vesting.fullyVestedDate) : "—"}
              />
            </div>
            <p className="text-xs text-muted-foreground">
              {grant.schedule.name}
              {grant.schedule.cliffMonths
                ? ` · ${grant.schedule.cliffMonths}-month cliff${vesting.cliffPassed ? " (passed)" : ""}`
                : ""}
              {` · vests ${grant.schedule.frequency} over ${grant.schedule.durationMonths} months`}
            </p>
            <VestingTable quantity={grant.quantity} schedule={grant.schedule} />
          </div>
        ) : null}

        {showDocuments && grant.documents.length > 0 ? (
          <div className="space-y-1 text-sm">
            <p className="font-medium">Documents</p>
            {grant.documents.map((doc) => (
              <p key={doc.id} className="text-muted-foreground">
                {doc.title} · {doc.status}
              </p>
            ))}
          </div>
        ) : null}

        <div className="flex flex-wrap gap-2">
          {!grant.acceptedAt ? (
            <Button size="sm" onClick={() => setAcceptOpen(true)}>
              Accept this grant
            </Button>
          ) : null}
          {isOption && canRequestExercise && vesting.vested > 0 ? (
            <Button size="sm" variant="outline" onClick={() => setExerciseOpen(true)}>
              Request an exercise
            </Button>
          ) : null}
        </div>
      </CardContent>

      <AcceptDialog
        open={acceptOpen}
        onOpenChange={setAcceptOpen}
        grant={grant}
        onDone={onChanged}
      />
      <ExerciseDialog
        open={exerciseOpen}
        onOpenChange={setExerciseOpen}
        grant={grant}
        maxQuantity={vesting.vested}
        onDone={onChanged}
      />
    </Card>
  );
}

function AcceptDialog({
  open,
  onOpenChange,
  grant,
  onDone,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  grant: Grant;
  onDone: () => void;
}) {
  const accept = useServerFn(acceptCapGrant);
  const [legalName, setLegalName] = useState("");

  const mutation = useMutation({
    mutationFn: () => accept({ data: { securityId: grant.id, legalName } }),
    onSuccess: () => {
      toast.success("Your acceptance has been recorded.");
      onOpenChange(false);
      onDone();
    },
    onError: (error: unknown) =>
      toast.error(error instanceof Error ? error.message : "Could not record your acceptance."),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Accept your grant</DialogTitle>
          <DialogDescription>
            Type your full legal name to record that you have seen and accepted the terms of this
            grant of {fmtNumber(grant.quantity)} shares.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-1.5">
          <Label htmlFor="accept-name">Full legal name</Label>
          <Input
            id="accept-name"
            value={legalName}
            onChange={(event) => setLegalName(event.target.value)}
            placeholder="Your full name"
          />
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            onClick={() => mutation.mutate()}
            disabled={mutation.isPending || legalName.trim().length < 2}
          >
            Accept
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ExerciseDialog({
  open,
  onOpenChange,
  grant,
  maxQuantity,
  onDone,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  grant: Grant;
  maxQuantity: number;
  onDone: () => void;
}) {
  const request = useServerFn(requestCapExercise);
  const [quantity, setQuantity] = useState(String(maxQuantity || ""));
  const [note, setNote] = useState("");

  const parsed = Number(quantity);
  const cost = grant.exercisePrice !== null && Number.isFinite(parsed) ? grant.exercisePrice * parsed : null;

  const mutation = useMutation({
    mutationFn: () =>
      request({
        data: { securityId: grant.id, quantity: parsed, method: "cash", note: note || null },
      }),
    onSuccess: () => {
      toast.success("Request sent. Your company will review it.");
      onOpenChange(false);
      onDone();
    },
    onError: (error: unknown) =>
      toast.error(error instanceof Error ? error.message : "Could not send your request."),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Request an exercise</DialogTitle>
          <DialogDescription>
            You have {fmtNumber(maxQuantity)} vested shares available. Nothing changes until your
            company records the exercise.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="exercise-qty">Shares to exercise</Label>
            <Input
              id="exercise-qty"
              type="number"
              min={1}
              max={maxQuantity}
              value={quantity}
              onChange={(event) => setQuantity(event.target.value)}
            />
            {cost !== null ? (
              <p className="text-xs text-muted-foreground">Estimated cost {fmtMoney(cost)}</p>
            ) : null}
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="exercise-note">Note (optional)</Label>
            <Textarea
              id="exercise-note"
              value={note}
              onChange={(event) => setNote(event.target.value)}
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            onClick={() => mutation.mutate()}
            disabled={mutation.isPending || !(parsed > 0) || parsed > maxQuantity}
          >
            Send request
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function RequestCard({
  request,
  onChanged,
}: {
  request: Holding["exerciseRequests"][number];
  onChanged: () => void;
}) {
  const withdraw = useServerFn(withdrawCapExercise);
  const mutation = useMutation({
    mutationFn: () => withdraw({ data: { id: request.id } }),
    onSuccess: () => {
      toast.success("Request withdrawn.");
      onChanged();
    },
    onError: (error: unknown) =>
      toast.error(error instanceof Error ? error.message : "Could not withdraw the request."),
  });

  return (
    <Card>
      <CardHeader className="gap-1">
        <CardTitle className="flex flex-wrap items-center gap-2 text-base">
          {fmtNumber(request.quantity)} shares
          <Badge variant={request.status === "pending" ? "outline" : "secondary"} className="capitalize">
            {request.status}
          </Badge>
        </CardTitle>
        <CardDescription>
          Sent {fmtDate(request.createdAt)}
          {request.totalCost !== null ? ` · ${fmtMoney(request.totalCost)}` : ""}
          {request.decidedAt ? ` · decided ${fmtDate(request.decidedAt)}` : ""}
        </CardDescription>
      </CardHeader>
      {request.status === "pending" || request.decisionNote ? (
        <CardContent className="space-y-2">
          {request.decisionNote ? (
            <p className="text-sm text-muted-foreground">{request.decisionNote}</p>
          ) : null}
          {request.status === "pending" ? (
            <Button
              size="sm"
              variant="outline"
              onClick={() => mutation.mutate()}
              disabled={mutation.isPending}
            >
              Withdraw
            </Button>
          ) : null}
        </CardContent>
      ) : null}
    </Card>
  );
}
