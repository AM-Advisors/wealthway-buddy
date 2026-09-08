import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";

import { getAdminAccess } from "@/lib/admin.functions";
import { createInvestorApplication, listFundsForApplication } from "@/lib/admin-applications.functions";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";

export const Route = createFileRoute("/_authenticated/admin/new-application")({
  head: () => ({
    meta: [
      { title: "Open an Investor Application — Harmonious Admin" },
      {
        name: "description",
        content:
          "Open a real investor application against a live Harmonious fund and track its onboarding status from the review queue.",
      },
      { property: "og:title", content: "Open an Investor Application — Harmonious Admin" },
      {
        property: "og:description",
        content: "Create an investor's application, grant fund access and send the onboarding invitation.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: NewApplication,
});

const INVESTOR_TYPES = [
  { value: "individual", label: "Individual" },
  { value: "joint", label: "Joint" },
  { value: "entity", label: "Entity / company" },
  { value: "trust", label: "Trust" },
  { value: "ira", label: "IRA / retirement account" },
] as const;

function NewApplication() {
  const navigate = useNavigate();
  const access = useServerFn(getAdminAccess);
  const loadFunds = useServerFn(listFundsForApplication);
  const submit = useServerFn(createInvestorApplication);

  const accessQuery = useQuery({ queryKey: ["admin-access"], queryFn: () => access() });
  const isAdmin = accessQuery.data?.isAdmin === true;

  const fundsQuery = useQuery({
    queryKey: ["admin-application-funds"],
    queryFn: () => loadFunds(),
    enabled: isAdmin,
  });

  const [email, setEmail] = useState("");
  const [legalName, setLegalName] = useState("");
  const [investorType, setInvestorType] = useState<(typeof INVESTOR_TYPES)[number]["value"]>("individual");
  const [entityName, setEntityName] = useState("");
  const [phone, setPhone] = useState("");
  const [offeringId, setOfferingId] = useState("");
  const [commitment, setCommitment] = useState("");
  const [sendInvitation, setSendInvitation] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const mutation = useMutation({
    mutationFn: () => {
      const dollars = Number(commitment.replace(/[^0-9.]/g, ""));
      return submit({
        data: {
          email,
          legal_name: legalName,
          investor_type: investorType,
          entity_name: entityName,
          phone,
          offering_id: offeringId,
          commitment_cents: Number.isFinite(dollars) && dollars > 0 ? Math.round(dollars * 100) : null,
          send_invitation: sendInvitation,
        },
      });
    },
    onSuccess: (result: any) => {
      if (!result.ok) {
        setError(result.message);
        return;
      }
      setError(null);
      toast.success(result.message, { description: result.invitation ?? undefined });
      navigate({ to: "/admin/$applicationId", params: { applicationId: result.applicationId } });
    },
    onError: (err: any) => setError(err?.message ?? "Could not open the application."),
  });

  if (accessQuery.isLoading) {
    return <main className="mx-auto max-w-3xl px-4 py-10 text-sm text-muted-foreground">Loading…</main>;
  }

  if (!isAdmin) {
    return (
      <main className="mx-auto max-w-2xl px-4 py-16">
        <h1 className="text-3xl">Restricted</h1>
        <p className="mt-3 text-sm text-muted-foreground">
          Only Harmonious administrators can open investor applications.
        </p>
        <Button asChild variant="outline" className="mt-6">
          <Link to="/admin">Back to the review queue</Link>
        </Button>
      </main>
    );
  }

  const offerings = fundsQuery.data?.offerings ?? [];
  const selected = offerings.find((o: any) => o.id === offeringId);
  const canSubmit = email.trim() !== "" && legalName.trim().length > 1 && offeringId !== "" && !mutation.isPending;

  return (
    <main className="mx-auto max-w-3xl px-4 py-10">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-3xl">Open an investor application</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Start a real application in a live fund. The investor gets portal access, an onboarding invitation and
            a status you can track from the review queue.
          </p>
        </div>
        <Button asChild size="sm" variant="outline">
          <Link to="/admin">Review queue</Link>
        </Button>
      </div>

      <Card className="mt-6">
        <CardHeader>
          <CardTitle>Investor details</CardTitle>
          <CardDescription>These details prefill the investor's onboarding and appear in the queue.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="legalName">Full legal name</Label>
              <Input
                id="legalName"
                value={legalName}
                maxLength={120}
                onChange={(e) => setLegalName(e.target.value)}
                placeholder="Jordan Avery"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="email">Email address</Label>
              <Input
                id="email"
                type="email"
                value={email}
                maxLength={255}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="investor@example.com"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="investorType">Investor type</Label>
              <select
                id="investorType"
                className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                value={investorType}
                onChange={(e) => setInvestorType(e.target.value as typeof investorType)}
              >
                {INVESTOR_TYPES.map((t) => (
                  <option key={t.value} value={t.value}>
                    {t.label}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="phone">Phone (optional)</Label>
              <Input id="phone" value={phone} maxLength={30} onChange={(e) => setPhone(e.target.value)} />
            </div>
            {(investorType === "entity" || investorType === "trust" || investorType === "ira") && (
              <div className="space-y-1.5 sm:col-span-2">
                <Label htmlFor="entityName">Entity / trust name</Label>
                <Input
                  id="entityName"
                  value={entityName}
                  maxLength={160}
                  onChange={(e) => setEntityName(e.target.value)}
                />
              </div>
            )}
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="fund">Fund</Label>
              <select
                id="fund"
                className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                value={offeringId}
                onChange={(e) => setOfferingId(e.target.value)}
              >
                <option value="">Choose a fund…</option>
                {offerings.map((o: any) => (
                  <option key={o.id} value={o.id} disabled={!o.is_open}>
                    {o.name} · Reg D {o.reg_type}
                    {o.is_open ? "" : " (closed)"}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="commitment">Intended commitment (USD, optional)</Label>
              <Input
                id="commitment"
                inputMode="decimal"
                value={commitment}
                onChange={(e) => setCommitment(e.target.value)}
                placeholder="250000"
              />
              {selected ? (
                <p className="text-xs text-muted-foreground">
                  Fund minimum ${(selected.min_investment_cents / 100).toLocaleString("en-US")}
                </p>
              ) : null}
            </div>
          </div>

          <label className="flex items-start gap-3 text-sm">
            <Checkbox
              checked={sendInvitation}
              onCheckedChange={(v) => setSendInvitation(v === true)}
              className="mt-0.5"
            />
            <span>
              Send the onboarding invitation email now, so the investor can sign in and complete identity
              verification, accreditation, documents and funding.
            </span>
          </label>

          {error ? <p className="text-sm text-destructive">{error}</p> : null}

          <div className="flex flex-wrap gap-2">
            <Button disabled={!canSubmit} onClick={() => mutation.mutate()}>
              {mutation.isPending ? "Opening…" : "Open application"}
            </Button>
            <Button asChild variant="outline">
              <Link to="/admin">Cancel</Link>
            </Button>
          </div>
        </CardContent>
      </Card>
    </main>
  );
}
