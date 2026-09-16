import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
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
  getMyExposureClaims,
  submitExposureClaim,
  withdrawMyExposureClaim,
} from "@/lib/captable-exposure.functions";

export const Route = createFileRoute("/_authenticated/my-claims")({
  head: () => ({
    meta: [
      { title: "My declared positions | Harmonious CapTable" },
      {
        name: "description",
        content:
          "Funds, SPVs and advisers track every position they have declared and the company's decision on each one.",
      },
      { property: "og:title", content: "My declared positions" },
      {
        property: "og:description",
        content: "Track the positions you have declared and how each company responded.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: MyClaimsPage,
});

const STATUS_LABEL: Record<string, string> = {
  submitted: "With the company",
  under_review: "Under review",
  info_requested: "They need more from you",
  verified: "Verified",
  partially_verified: "Verified at an adjusted amount",
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

function fmtDate(value: string | null) {
  if (!value) return "—";
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? value
    : date.toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" });
}

function MyClaimsPage() {
  const load = useServerFn(getMyExposureClaims);
  const submit = useServerFn(submitExposureClaim);
  const withdraw = useServerFn(withdrawMyExposureClaim);

  const query = useQuery({ queryKey: ["my-exposure-claims"], queryFn: () => load() });

  const [companyId, setCompanyId] = useState("");
  const [claimantName, setClaimantName] = useState("");
  const [claimantType, setClaimantType] = useState("fund");
  const [securityType, setSecurityType] = useState("common");
  const [quantity, setQuantity] = useState("");
  const [holdingRoute, setHoldingRoute] = useState("direct");
  const [throughEntity, setThroughEntity] = useState("");
  const [asOfDate, setAsOfDate] = useState(new Date().toISOString().slice(0, 10));
  const [note, setNote] = useState("");

  const sending = useMutation({
    mutationFn: () =>
      submit({
        data: {
          companyId,
          claimantName,
          claimantType,
          securityType,
          claimedQuantity: Number(quantity),
          holdingRoute,
          throughEntity: throughEntity || null,
          asOfDate: asOfDate || null,
          claimantNote: note || null,
        },
      }),
    onSuccess: () => {
      setQuantity("");
      setNote("");
      toast.success("Your claim is with the company.");
      void query.refetch();
    },
    onError: (error: unknown) =>
      toast.error(error instanceof Error ? error.message : "We could not send that claim."),
  });

  const pulling = useMutation({
    mutationFn: (claimId: string) => withdraw({ data: { claimId } }),
    onSuccess: () => {
      toast.success("Claim withdrawn.");
      void query.refetch();
    },
    onError: (error: unknown) =>
      toast.error(error instanceof Error ? error.message : "We could not withdraw that claim."),
  });

  return (
    <main className="mx-auto w-full max-w-4xl space-y-6 px-4 py-8">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">My declared positions</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Declare what you hold in a company and follow their decision. Declaring a position does not create or
          move any shares — the company confirms it against their own register.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Declare a position</CardTitle>
          <CardDescription>
            You will need the company's identifier, which they provide when they ask you to declare.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-3 sm:grid-cols-2">
          <div className="grid gap-2 sm:col-span-2">
            <Label htmlFor="company">Company identifier</Label>
            <Input id="company" value={companyId} onChange={(e) => setCompanyId(e.target.value)} />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="claimant">Your entity name</Label>
            <Input id="claimant" value={claimantName} onChange={(e) => setClaimantName(e.target.value)} />
          </div>
          <div className="grid gap-2">
            <Label>Entity type</Label>
            <Select value={claimantType} onValueChange={setClaimantType}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="fund">Fund</SelectItem>
                <SelectItem value="spv">SPV</SelectItem>
                <SelectItem value="adviser">Adviser</SelectItem>
                <SelectItem value="nominee">Nominee</SelectItem>
                <SelectItem value="individual">Individual</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="grid gap-2">
            <Label>What you hold</Label>
            <Select value={securityType} onValueChange={setSecurityType}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="common">Common shares</SelectItem>
                <SelectItem value="preferred">Preferred shares</SelectItem>
                <SelectItem value="safe">SAFE</SelectItem>
                <SelectItem value="note">Convertible note</SelectItem>
                <SelectItem value="warrant">Warrant</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="grid gap-2">
            <Label htmlFor="qty">How many</Label>
            <Input id="qty" inputMode="decimal" value={quantity} onChange={(e) => setQuantity(e.target.value)} />
          </div>
          <div className="grid gap-2">
            <Label>How you came to hold it</Label>
            <Select value={holdingRoute} onValueChange={setHoldingRoute}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="direct">Direct purchase from the company</SelectItem>
                <SelectItem value="secondary">Secondary purchase</SelectItem>
                <SelectItem value="spv_interest">Interest in an SPV</SelectItem>
                <SelectItem value="fund_position">Position held through a fund</SelectItem>
                <SelectItem value="other">Other</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="grid gap-2">
            <Label htmlFor="through">Held through (if applicable)</Label>
            <Input id="through" value={throughEntity} onChange={(e) => setThroughEntity(e.target.value)} />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="asof">As at</Label>
            <Input id="asof" type="date" value={asOfDate} onChange={(e) => setAsOfDate(e.target.value)} />
          </div>
          <div className="grid gap-2 sm:col-span-2">
            <Label htmlFor="claim-note">Anything the company should know</Label>
            <Textarea id="claim-note" rows={2} value={note} onChange={(e) => setNote(e.target.value)} />
          </div>
          <div className="sm:col-span-2">
            <Button
              size="sm"
              disabled={sending.isPending || !companyId || !claimantName || !quantity}
              onClick={() => sending.mutate()}
            >
              Send my claim
            </Button>
          </div>
        </CardContent>
      </Card>

      {query.isLoading ? (
        <Skeleton className="h-48 w-full" />
      ) : (
        <div className="space-y-4">
          {(query.data?.claims ?? []).length === 0 ? (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Nothing declared yet</CardTitle>
                <CardDescription>Positions you declare will appear here with the company's decision.</CardDescription>
              </CardHeader>
            </Card>
          ) : (
            (query.data?.claims ?? []).map((claim) => (
              <Card key={claim.id}>
                <CardHeader className="gap-2">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <CardTitle className="text-base">{claim.companyName}</CardTitle>
                    <Badge variant={STATUS_TONE[claim.status] ?? "secondary"}>
                      {STATUS_LABEL[claim.status] ?? claim.status}
                    </Badge>
                  </div>
                  <CardDescription>
                    {claim.claimedQuantity.toLocaleString("en-US")} {claim.securityType} · declared{" "}
                    {fmtDate(claim.submittedAt)}
                    {claim.throughEntity ? ` · through ${claim.throughEntity}` : ""}
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-2 text-sm">
                  {claim.verifiedQuantity !== null ? (
                    <p>
                      <span className="font-medium">Confirmed: </span>
                      {claim.verifiedQuantity.toLocaleString("en-US")}
                    </p>
                  ) : null}
                  {claim.infoRequest ? (
                    <p>
                      <span className="font-medium">They asked for: </span>
                      {claim.infoRequest}
                    </p>
                  ) : null}
                  {claim.reviewerNote ? (
                    <p>
                      <span className="font-medium">Their note: </span>
                      {claim.reviewerNote}
                    </p>
                  ) : null}
                  {claim.status !== "withdrawn" &&
                  claim.status !== "verified" &&
                  claim.status !== "partially_verified" ? (
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={pulling.isPending}
                      onClick={() => pulling.mutate(claim.id)}
                    >
                      Withdraw this claim
                    </Button>
                  ) : null}
                </CardContent>
              </Card>
            ))
          )}
        </div>
      )}
    </main>
  );
}
