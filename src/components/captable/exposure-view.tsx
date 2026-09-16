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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";

import {
  createClaimInvite,
  getCapExposure,
  openActivityCase,
  reviewExposureClaim,
  revokeClaimInvite,
  saveCapIssuer,
} from "@/lib/captable-exposure.functions";

import { fmtDate, fmtNumber, useCapTable } from "./captable-context";
import { CapTableError, CapTableSection } from "./captable-states";
import { CasesPanel } from "./cases-view";

type Data = Awaited<ReturnType<typeof getCapExposure>>;
type Claim = Data["claims"][number];

const STATUS_LABEL: Record<string, string> = {
  submitted: "Submitted",
  under_review: "Under review",
  info_requested: "More information requested",
  verified: "Verified",
  partially_verified: "Partially verified",
  disputed: "Disputed",
  withdrawn: "Withdrawn",
};

const STATUS_TONE: Record<string, "default" | "secondary" | "outline" | "destructive"> = {
  submitted: "secondary",
  under_review: "secondary",
  info_requested: "outline",
  verified: "default",
  partially_verified: "default",
  disputed: "destructive",
  withdrawn: "outline",
};

const ROUTE_LABEL: Record<string, string> = {
  direct: "Direct purchase",
  secondary: "Secondary purchase",
  spv_interest: "Interest in an SPV",
  fund_position: "Held through a fund",
  other: "Other",
};

export function ExposureView() {
  return (
    <CapTableSection>
      <Body />
    </CapTableSection>
  );
}

function Body() {
  const { workspace } = useCapTable();
  const companyId = workspace!.company!.id;
  const canManage = Boolean((workspace as any)?.canManage);
  const load = useServerFn(getCapExposure);

  const query = useQuery({
    queryKey: ["captable-exposure", companyId],
    queryFn: () => load({ data: { companyId } }),
  });

  if (query.isLoading) return <Skeleton className="h-96 w-full" />;
  if (query.error) return <CapTableError error={query.error} />;

  const data = query.data;
  if (!data?.company) return null;
  const refresh = () => void query.refetch();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">Exposure and verification</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Funds, SPVs and advisers declare what they believe they hold in {data.company.name}. Confirming a claim
          records the company's answer — it never issues or moves shares.
        </p>
      </div>

      <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-6">
        <Stat label="Claims" value={fmtNumber(data.summary.total)} />
        <Stat label="Awaiting review" value={fmtNumber(data.summary.awaiting)} />
        <Stat label="Verified" value={fmtNumber(data.summary.verified)} />
        <Stat label="Disputed" value={fmtNumber(data.summary.disputed)} />
        <Stat label="No matching holder" value={fmtNumber(data.summary.unmatched)} />
        <Stat label="Open cases" value={fmtNumber(data.summary.openCases)} />
      </div>

      <Tabs defaultValue="claims">
        <TabsList className="flex-wrap">
          <TabsTrigger value="claims">Claims</TabsTrigger>
          <TabsTrigger value="issuers">Issuer registry</TabsTrigger>
          <TabsTrigger value="cases">Cases</TabsTrigger>
          <TabsTrigger value="invites">Invite links</TabsTrigger>
        </TabsList>

        <TabsContent value="claims" className="mt-4 space-y-4">
          {data.claims.length === 0 ? (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">No claims yet</CardTitle>
                <CardDescription>
                  Send a fund or adviser an invite link, or let them submit from their own portal account.
                </CardDescription>
              </CardHeader>
            </Card>
          ) : (
            data.claims.map((claim) => (
              <ClaimCard
                key={claim.id}
                companyId={companyId}
                claim={claim}
                canManage={canManage}
                onChanged={refresh}
              />
            ))
          )}
        </TabsContent>

        <TabsContent value="issuers" className="mt-4 space-y-4">
          <IssuerPanel companyId={companyId} data={data} canManage={canManage} onChanged={refresh} />
        </TabsContent>

        <TabsContent value="cases" className="mt-4">
          <CasesPanel companyId={companyId} cases={data.cases} canManage={canManage} onChanged={refresh} />
        </TabsContent>

        <TabsContent value="invites" className="mt-4 space-y-4">
          <InvitePanel companyId={companyId} data={data} canManage={canManage} onChanged={refresh} />
        </TabsContent>
      </Tabs>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <Card>
      <CardContent className="p-4">
        <p className="text-xs uppercase tracking-wide text-muted-foreground">{label}</p>
        <p className="mt-1 text-xl font-semibold">{value}</p>
      </CardContent>
    </Card>
  );
}

function ClaimCard({
  companyId,
  claim,
  canManage,
  onChanged,
}: {
  companyId: string;
  claim: Claim;
  canManage: boolean;
  onChanged: () => void;
}) {
  const review = useServerFn(reviewExposureClaim);
  const openCase = useServerFn(openActivityCase);
  const [note, setNote] = useState("");
  const [adjusted, setAdjusted] = useState("");
  const [caseOpen, setCaseOpen] = useState(false);
  const [caseTitle, setCaseTitle] = useState(`Unverified claim — ${claim.claimantName}`);
  const [caseSummary, setCaseSummary] = useState("");
  const [severity, setSeverity] = useState("medium");

  const decide = useMutation({
    mutationFn: (decision: "under_review" | "verify" | "verify_adjusted" | "info" | "dispute") =>
      review({
        data: {
          companyId,
          claimId: claim.id,
          decision,
          verifiedQuantity: decision === "verify_adjusted" ? Number(adjusted) : null,
          note: note || null,
        },
      }),
    onSuccess: () => {
      setNote("");
      setAdjusted("");
      toast.success("Claim updated.");
      onChanged();
    },
    onError: (error: unknown) =>
      toast.error(error instanceof Error ? error.message : "We could not record that decision."),
  });

  const raise = useMutation({
    mutationFn: () =>
      openCase({
        data: {
          companyId,
          claimId: claim.id,
          title: caseTitle,
          summary: caseSummary || null,
          severity: severity as any,
          claimedQuantity: claim.claimedQuantity,
          recordQuantity: claim.recordQuantity,
        },
      }),
    onSuccess: () => {
      setCaseOpen(false);
      toast.success("Case opened.");
      onChanged();
    },
    onError: (error: unknown) =>
      toast.error(error instanceof Error ? error.message : "We could not open that case."),
  });

  return (
    <Card>
      <CardHeader className="gap-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <CardTitle className="text-base">{claim.claimantName}</CardTitle>
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="outline">{claim.claimantType}</Badge>
            <Badge variant={STATUS_TONE[claim.status] ?? "secondary"}>
              {STATUS_LABEL[claim.status] ?? claim.status}
            </Badge>
          </div>
        </div>
        <CardDescription>
          {ROUTE_LABEL[claim.holdingRoute] ?? claim.holdingRoute} · submitted {fmtDate(claim.submittedAt)} via{" "}
          {claim.source}
          {claim.asOfDate ? ` · as at ${fmtDate(claim.asOfDate)}` : ""}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-3 sm:grid-cols-3">
          <Figure label="Claimed" value={fmtNumber(claim.claimedQuantity)} />
          <Figure label="On our register" value={fmtNumber(claim.recordQuantity)} />
          <Figure
            label="Difference"
            value={claim.matches ? "Matches" : fmtNumber(claim.difference)}
            tone={claim.matches ? "ok" : "warn"}
          />
        </div>

        <p className="text-sm text-muted-foreground">
          {claim.matchedStakeholder
            ? `Matched to ${claim.matchedStakeholder} on the register.`
            : "No holder on the register matches this claimant."}
        </p>

        <div className="rounded-md border p-3 text-sm">
          <p className="font-medium">Ownership chain</p>
          <p className="mt-1 text-muted-foreground">{claim.chain.join("  →  ")}</p>
        </div>

        {claim.claimantNote ? (
          <p className="text-sm">
            <span className="font-medium">From the claimant: </span>
            {claim.claimantNote}
          </p>
        ) : null}
        {claim.infoRequest ? (
          <p className="text-sm">
            <span className="font-medium">We asked for: </span>
            {claim.infoRequest}
          </p>
        ) : null}
        {claim.reviewerNote ? (
          <p className="text-sm">
            <span className="font-medium">Our note: </span>
            {claim.reviewerNote}
          </p>
        ) : null}
        {claim.verifiedQuantity !== null ? (
          <p className="text-sm">
            <span className="font-medium">Confirmed quantity: </span>
            {fmtNumber(claim.verifiedQuantity)}
          </p>
        ) : null}

        {claim.documents.length ? (
          <ul className="text-sm text-muted-foreground">
            {claim.documents.map((doc) => (
              <li key={doc.id}>
                {doc.title} — {doc.reference}
              </li>
            ))}
          </ul>
        ) : null}

        {canManage && claim.status !== "withdrawn" ? (
          <div className="grid gap-3 border-t pt-4">
            <div className="grid gap-2">
              <Label htmlFor={`note-${claim.id}`}>Note (required to query or dispute)</Label>
              <Textarea
                id={`note-${claim.id}`}
                rows={2}
                value={note}
                onChange={(e) => setNote(e.target.value)}
              />
            </div>
            <div className="flex flex-wrap items-end gap-2">
              <Button size="sm" disabled={decide.isPending} onClick={() => decide.mutate("verify")}>
                Verify as claimed
              </Button>
              <div className="flex items-end gap-2">
                <div className="grid gap-1">
                  <Label htmlFor={`adj-${claim.id}`} className="text-xs">Confirm a different quantity</Label>
                  <Input
                    id={`adj-${claim.id}`}
                    className="w-40"
                    inputMode="decimal"
                    value={adjusted}
                    onChange={(e) => setAdjusted(e.target.value)}
                  />
                </div>
                <Button
                  size="sm"
                  variant="secondary"
                  disabled={decide.isPending || !adjusted}
                  onClick={() => decide.mutate("verify_adjusted")}
                >
                  Verify adjusted
                </Button>
              </div>
              <Button size="sm" variant="outline" disabled={decide.isPending} onClick={() => decide.mutate("info")}>
                Ask for more
              </Button>
              <Button
                size="sm"
                variant="destructive"
                disabled={decide.isPending}
                onClick={() => decide.mutate("dispute")}
              >
                Dispute
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setCaseOpen(true)}>
                Raise a case
              </Button>
            </div>
          </div>
        ) : null}
      </CardContent>

      <Dialog open={caseOpen} onOpenChange={setCaseOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Raise an unauthorised activity case</DialogTitle>
            <DialogDescription>
              Track a claim that does not line up with the register, with its own status and running notes.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-3">
            <div className="grid gap-2">
              <Label htmlFor={`case-title-${claim.id}`}>Title</Label>
              <Input
                id={`case-title-${claim.id}`}
                value={caseTitle}
                onChange={(e) => setCaseTitle(e.target.value)}
              />
            </div>
            <div className="grid gap-2">
              <Label>Severity</Label>
              <Select value={severity} onValueChange={setSeverity}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="low">Low</SelectItem>
                  <SelectItem value="medium">Medium</SelectItem>
                  <SelectItem value="high">High</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-2">
              <Label htmlFor={`case-summary-${claim.id}`}>What happened</Label>
              <Textarea
                id={`case-summary-${claim.id}`}
                rows={3}
                value={caseSummary}
                onChange={(e) => setCaseSummary(e.target.value)}
              />
            </div>
          </div>
          <DialogFooter>
            <Button onClick={() => raise.mutate()} disabled={raise.isPending || caseTitle.trim().length < 3}>
              Open case
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}

function Figure({ label, value, tone }: { label: string; value: string; tone?: "ok" | "warn" }) {
  return (
    <div className="rounded-md border p-3">
      <p className="text-xs uppercase tracking-wide text-muted-foreground">{label}</p>
      <p
        className={
          tone === "warn"
            ? "mt-1 text-lg font-semibold text-destructive"
            : "mt-1 text-lg font-semibold"
        }
      >
        {value}
      </p>
    </div>
  );
}

function IssuerPanel({
  companyId,
  data,
  canManage,
  onChanged,
}: {
  companyId: string;
  data: Data;
  canManage: boolean;
  onChanged: () => void;
}) {
  const save = useServerFn(saveCapIssuer);
  const [name, setName] = useState("");
  const [issuerType, setIssuerType] = useState("fund");
  const [email, setEmail] = useState("");

  const adding = useMutation({
    mutationFn: () =>
      save({ data: { companyId, name, issuerType, contactEmail: email || null } }),
    onSuccess: () => {
      setName("");
      setEmail("");
      toast.success("Added to the registry.");
      onChanged();
    },
    onError: (error: unknown) =>
      toast.error(error instanceof Error ? error.message : "We could not save that entity."),
  });

  return (
    <div className="space-y-4">
      {canManage ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Add an entity</CardTitle>
            <CardDescription>Funds, SPVs, advisers and nominees that hold exposure to this company.</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-3 sm:grid-cols-4">
            <div className="grid gap-2 sm:col-span-2">
              <Label htmlFor="issuer-name">Name</Label>
              <Input id="issuer-name" value={name} onChange={(e) => setName(e.target.value)} />
            </div>
            <div className="grid gap-2">
              <Label>Type</Label>
              <Select value={issuerType} onValueChange={setIssuerType}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="fund">Fund</SelectItem>
                  <SelectItem value="spv">SPV</SelectItem>
                  <SelectItem value="adviser">Adviser</SelectItem>
                  <SelectItem value="nominee">Nominee</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-2">
              <Label htmlFor="issuer-email">Contact email</Label>
              <Input id="issuer-email" value={email} onChange={(e) => setEmail(e.target.value)} />
            </div>
            <div className="sm:col-span-4">
              <Button size="sm" disabled={adding.isPending || name.trim().length < 2} onClick={() => adding.mutate()}>
                Add entity
              </Button>
            </div>
          </CardContent>
        </Card>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Issuer registry</CardTitle>
          <CardDescription>Who holds exposure, and through whom.</CardDescription>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          {data.issuers.length === 0 ? (
            <p className="text-sm text-muted-foreground">No entities recorded yet.</p>
          ) : (
            <table className="w-full min-w-[640px] text-sm">
              <thead className="text-left text-xs uppercase tracking-wide text-muted-foreground">
                <tr>
                  <th className="py-2">Entity</th>
                  <th className="py-2">Type</th>
                  <th className="py-2">Contact</th>
                  <th className="py-2 text-right">Claims</th>
                  <th className="py-2 text-right">Verified</th>
                  <th className="py-2">Last activity</th>
                </tr>
              </thead>
              <tbody>
                {data.issuers.map((issuer) => (
                  <tr key={issuer.id} className="border-t">
                    <td className="py-2 font-medium">{issuer.name}</td>
                    <td className="py-2">{issuer.issuerType}</td>
                    <td className="py-2">{issuer.contactEmail ?? "—"}</td>
                    <td className="py-2 text-right">{fmtNumber(issuer.claimCount)}</td>
                    <td className="py-2 text-right">{fmtNumber(issuer.verifiedQuantity)}</td>
                    <td className="py-2">{issuer.lastActivity ? fmtDate(issuer.lastActivity) : "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function InvitePanel({
  companyId,
  data,
  canManage,
  onChanged,
}: {
  companyId: string;
  data: Data;
  canManage: boolean;
  onChanged: () => void;
}) {
  const create = useServerFn(createClaimInvite);
  const revoke = useServerFn(revokeClaimInvite);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [link, setLink] = useState<string | null>(null);

  const origin = useMemo(() => (typeof window === "undefined" ? "" : window.location.origin), []);

  const making = useMutation({
    mutationFn: () => create({ data: { companyId, claimantName: name, claimantEmail: email } }),
    onSuccess: (result: { path: string }) => {
      setLink(`${origin}${result.path}`);
      setName("");
      setEmail("");
      toast.success("Link created — copy it and send it to the claimant.");
      onChanged();
    },
    onError: (error: unknown) =>
      toast.error(error instanceof Error ? error.message : "We could not create that link."),
  });

  const killing = useMutation({
    mutationFn: (inviteId: string) => revoke({ data: { companyId, inviteId } }),
    onSuccess: () => {
      toast.success("Link withdrawn.");
      onChanged();
    },
    onError: (error: unknown) =>
      toast.error(error instanceof Error ? error.message : "We could not withdraw that link."),
  });

  return (
    <div className="space-y-4">
      {canManage ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Invite a claimant</CardTitle>
            <CardDescription>
              A one-time link, valid for 21 days, that lets an outside party declare a position without an account.
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-3 sm:grid-cols-3">
            <div className="grid gap-2">
              <Label htmlFor="invite-name">Claimant</Label>
              <Input id="invite-name" value={name} onChange={(e) => setName(e.target.value)} />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="invite-email">Email</Label>
              <Input id="invite-email" value={email} onChange={(e) => setEmail(e.target.value)} />
            </div>
            <div className="flex items-end">
              <Button size="sm" disabled={making.isPending || !name || !email} onClick={() => making.mutate()}>
                Create link
              </Button>
            </div>
            {link ? (
              <div className="sm:col-span-3">
                <Label htmlFor="invite-link">Send this link</Label>
                <Input id="invite-link" readOnly value={link} onFocus={(e) => e.currentTarget.select()} />
                <p className="mt-1 text-xs text-muted-foreground">
                  This is shown once. It cannot be recovered later — create a new link if it is lost.
                </p>
              </div>
            ) : null}
          </CardContent>
        </Card>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Links issued</CardTitle>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          {data.invites.length === 0 ? (
            <p className="text-sm text-muted-foreground">No links issued yet.</p>
          ) : (
            <table className="w-full min-w-[640px] text-sm">
              <thead className="text-left text-xs uppercase tracking-wide text-muted-foreground">
                <tr>
                  <th className="py-2">Claimant</th>
                  <th className="py-2">Email</th>
                  <th className="py-2">Expires</th>
                  <th className="py-2">State</th>
                  <th className="py-2" />
                </tr>
              </thead>
              <tbody>
                {data.invites.map((invite) => {
                  const state = invite.revokedAt
                    ? "Withdrawn"
                    : invite.usedAt
                      ? "Used"
                      : new Date(invite.expiresAt).getTime() < Date.now()
                        ? "Expired"
                        : "Live";
                  return (
                    <tr key={invite.id} className="border-t">
                      <td className="py-2 font-medium">{invite.claimantName}</td>
                      <td className="py-2">{invite.claimantEmail}</td>
                      <td className="py-2">{fmtDate(invite.expiresAt)}</td>
                      <td className="py-2">
                        <Badge variant={state === "Live" ? "default" : "outline"}>{state}</Badge>
                      </td>
                      <td className="py-2 text-right">
                        {canManage && state === "Live" ? (
                          <Button size="sm" variant="ghost" onClick={() => killing.mutate(invite.id)}>
                            Withdraw
                          </Button>
                        ) : null}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
