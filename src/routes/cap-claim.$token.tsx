import { useEffect, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";

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
import { Textarea } from "@/components/ui/textarea";

export const Route = createFileRoute("/cap-claim/$token")({
  head: () => ({
    meta: [
        { name: "robots", content: "noindex, nofollow" },
      { title: "Declare your position | Harmonious CapTable" },
      {
        name: "description",
        content:
          "Funds, SPVs and advisers use this secure link to declare the position they hold so the company can verify it against its register.",
      },
      { property: "og:title", content: "Declare your position" },
      {
        property: "og:description",
        content: "Submit a claimed position for the company to verify against its share register.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: ClaimPage,
});

const CLAIMANT_TYPES = [
  ["fund", "Fund"],
  ["spv", "SPV"],
  ["adviser", "Adviser"],
  ["nominee", "Nominee"],
  ["individual", "Individual"],
];

const SECURITY_TYPES = [
  ["common", "Common shares"],
  ["preferred", "Preferred shares"],
  ["option", "Options"],
  ["rsu", "RSUs"],
  ["safe", "SAFE"],
  ["note", "Convertible note"],
  ["warrant", "Warrant"],
];

const ROUTES = [
  ["direct", "Direct purchase from the company"],
  ["secondary", "Secondary purchase"],
  ["spv_interest", "Interest in an SPV"],
  ["fund_position", "Position held through a fund"],
  ["other", "Other"],
];

function ClaimPage() {
  const { token } = Route.useParams();
  const [state, setState] = useState<{ companyName: string; claimantName: string } | null>(null);
  const [linkError, setLinkError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [claimantType, setClaimantType] = useState("fund");
  const [securityType, setSecurityType] = useState("common");
  const [quantity, setQuantity] = useState("");
  const [holdingRoute, setHoldingRoute] = useState("direct");
  const [throughEntity, setThroughEntity] = useState("");
  const [asOfDate, setAsOfDate] = useState(new Date().toISOString().slice(0, 10));
  const [note, setNote] = useState("");
  const [docTitle, setDocTitle] = useState("");
  const [docRef, setDocRef] = useState("");

  useEffect(() => {
    let active = true;
    fetch(`/api/public/cap-claim?token=${encodeURIComponent(token)}`)
      .then((res) => res.json())
      .then((body) => {
        if (!active) return;
        if (body.ok) setState({ companyName: body.companyName, claimantName: body.claimantName });
        else setLinkError(body.error ?? "This link is not valid.");
      })
      .catch(() => active && setLinkError("We could not open this link. Please try again."));
    return () => {
      active = false;
    };
  }, [token]);

  async function submit() {
    setError(null);
    const amount = Number(quantity);
    if (!Number.isFinite(amount) || amount <= 0) {
      setError("Enter the number of shares or units you hold.");
      return;
    }
    setBusy(true);
    try {
      const res = await fetch("/api/public/cap-claim", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          token,
          claimantType,
          securityType,
          claimedQuantity: amount,
          holdingRoute,
          throughEntity: throughEntity || null,
          asOfDate: asOfDate || null,
          claimantNote: note || null,
          documentTitle: docTitle || null,
          documentReference: docRef || null,
        }),
      });
      const body = await res.json();
      if (body.ok) setDone(true);
      else setError(body.error ?? "We could not record that claim.");
    } catch {
      setError("We could not record that claim. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="mx-auto w-full max-w-2xl px-4 py-10">
      <h1 className="text-2xl font-semibold tracking-tight">Declare your position</h1>
      <p className="mt-2 text-sm text-muted-foreground">
        Tell the company what you believe you hold. They will compare it with their share register and confirm,
        adjust or query it. Submitting this does not create or move any shares.
      </p>

      {linkError ? (
        <Card className="mt-6">
          <CardHeader>
            <CardTitle>We cannot open this link</CardTitle>
            <CardDescription>{linkError}</CardDescription>
          </CardHeader>
        </Card>
      ) : done ? (
        <Card className="mt-6">
          <CardHeader>
            <CardTitle>Thank you — your claim is with the company</CardTitle>
            <CardDescription>
              They will review it against their register and contact you at the address this link was sent to.
            </CardDescription>
          </CardHeader>
        </Card>
      ) : !state ? (
        <p className="mt-6 text-sm text-muted-foreground">Opening your link…</p>
      ) : (
        <Card className="mt-6">
          <CardHeader>
            <CardTitle>{state.companyName}</CardTitle>
            <CardDescription>Submitting as {state.claimantName}</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="grid gap-2">
                <Label>Who is holding</Label>
                <Select value={claimantType} onValueChange={setClaimantType}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {CLAIMANT_TYPES.map(([value, label]) => (
                      <SelectItem key={value} value={value!}>{label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid gap-2">
                <Label>What you hold</Label>
                <Select value={securityType} onValueChange={setSecurityType}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {SECURITY_TYPES.map(([value, label]) => (
                      <SelectItem key={value} value={value!}>{label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid gap-2">
                <Label htmlFor="quantity">How many</Label>
                <Input
                  id="quantity"
                  inputMode="decimal"
                  value={quantity}
                  onChange={(e) => setQuantity(e.target.value)}
                  placeholder="100000"
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="as-of">As at</Label>
                <Input id="as-of" type="date" value={asOfDate} onChange={(e) => setAsOfDate(e.target.value)} />
              </div>
              <div className="grid gap-2">
                <Label>How you came to hold it</Label>
                <Select value={holdingRoute} onValueChange={setHoldingRoute}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {ROUTES.map(([value, label]) => (
                      <SelectItem key={value} value={value!}>{label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid gap-2">
                <Label htmlFor="through">Held through (if applicable)</Label>
                <Input
                  id="through"
                  value={throughEntity}
                  onChange={(e) => setThroughEntity(e.target.value)}
                  placeholder="Name of the SPV or fund"
                />
              </div>
            </div>

            <div className="grid gap-2">
              <Label htmlFor="note">Anything the company should know</Label>
              <Textarea id="note" value={note} onChange={(e) => setNote(e.target.value)} rows={3} />
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="grid gap-2">
                <Label htmlFor="doc-title">Supporting paperwork (optional)</Label>
                <Input
                  id="doc-title"
                  value={docTitle}
                  onChange={(e) => setDocTitle(e.target.value)}
                  placeholder="Subscription agreement"
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="doc-ref">Where it can be found</Label>
                <Input
                  id="doc-ref"
                  value={docRef}
                  onChange={(e) => setDocRef(e.target.value)}
                  placeholder="Link or reference"
                />
              </div>
            </div>

            {error ? <p className="text-sm text-destructive">{error}</p> : null}

            <Button onClick={submit} disabled={busy} className="justify-self-start">
              {busy ? "Sending…" : "Submit my claim"}
            </Button>
          </CardContent>
        </Card>
      )}
    </main>
  );
}
