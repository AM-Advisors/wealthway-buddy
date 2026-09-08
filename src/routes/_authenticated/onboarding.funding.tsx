import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";

import {
  acknowledgeFunding,
  chooseWire,
  getFunding,
  markWireSent,
  startAchDebit,
} from "@/lib/funding.functions";
import { OnboardingStepper } from "@/components/OnboardingStepper";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";

export const Route = createFileRoute("/_authenticated/onboarding/funding")({
  head: () => ({
    meta: [
      { title: "Fund Your Subscription — Harmonious Investor Portal" },
      {
        name: "description",
        content:
          "Fund your Harmonious subscription by bank wire with a reference code, or authorize an ACH debit from your bank account.",
      },
      { property: "og:title", content: "Fund Your Subscription — Harmonious Investor Portal" },
      { property: "og:description", content: "Choose wire or ACH to complete your capital commitment." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: FundingStep,
});

function money(cents?: number | null) {
  if (!cents) return "—";
  return `$${(cents / 100).toLocaleString("en-US")}`;
}

const WIRE_STATEMENTS = [
  "I have reviewed the wire instructions above for this fund.",
  "I confirm the amount and reference code are correct.",
  "I understand Harmonious will never email changed bank details, and I will verify any change by phone.",
];

const ACH_STATEMENTS = [
  "I have reviewed the debit details above for this fund.",
  "I confirm the bank account I am about to enter is mine and the details are accurate.",
  "I authorize Harmonious to debit that account once for my capital commitment.",
];

function FundingStep() {
  const queryClient = useQueryClient();
  const load = useServerFn(getFunding);
  const wire = useServerFn(chooseWire);
  const wireSent = useServerFn(markWireSent);
  const ach = useServerFn(startAchDebit);
  const acknowledge = useServerFn(acknowledgeFunding);

  const { data, isLoading } = useQuery({ queryKey: ["funding"], queryFn: () => load() });
  const [method, setMethodState] = useState<"wire" | "ach">("wire");
  const [checked, setChecked] = useState<boolean[]>([false, false, false]);
  const setMethod = (v: "wire" | "ach") => {
    setMethodState(v);
    setChecked([false, false, false]);
  };
  const [expectedDate, setExpectedDate] = useState("");
  const [bankLast4, setBankLast4] = useState("");
  const [wireAmount, setWireAmount] = useState("");
  const [sendingBank, setSendingBank] = useState("");
  const [bankReference, setBankReference] = useState("");
  const [wireNote, setWireNote] = useState("");
  const [wireAccurate, setWireAccurate] = useState(false);
  const [accountHolder, setAccountHolder] = useState("");
  const [routing, setRouting] = useState("");
  const [accountNumber, setAccountNumber] = useState("");
  const [accountType, setAccountType] = useState<"checking" | "savings">("checking");
  const [authorize, setAuthorize] = useState(false);

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ["funding"] });
  const onError = (e: Error) => toast.error(e.message);

  const chooseWireMutation = useMutation({
    mutationFn: () => wire(),
    onSuccess: () => {
      toast.success("Wire instructions issued");
      invalidate();
    },
    onError,
  });

  const wireConfirmMutation = useMutation({
    mutationFn: () =>
      submitWire({
        data: {
          sent_on: expectedDate,
          amount: wireAmount,
          sending_bank_name: sendingBank,
          sending_account_last4: bankLast4,
          bank_reference: bankReference,
          investor_note: wireNote,
          confirm_accurate: true as const,
        },
      }),
    onSuccess: () => {
      setWireAccurate(false);
      toast.success("Wire confirmation submitted for review.");
      invalidate();
    },
    onError,
  });

  const achMutation = useMutation({
    mutationFn: () =>
      ach({
        data: {
          account_holder: accountHolder,
          routing_number: routing,
          account_number: accountNumber,
          account_type: accountType,
          authorize_debit: true,
        },
      }),
    onSuccess: (r) => {
      toast.success(`ACH debit authorized from account ending ${r.last4}`);
      setAccountNumber("");
      invalidate();
    },
    onError,
  });

  const acknowledgeMutation = useMutation({
    mutationFn: (m: "wire" | "ach") =>
      acknowledge({ data: { method: m, statements: m === "wire" ? WIRE_STATEMENTS : ACH_STATEMENTS } }),
    onSuccess: async (_r, m) => {
      await queryClient.invalidateQueries({ queryKey: ["funding"] });
      if (m === "wire") chooseWireMutation.mutate();
      else toast.success("Confirmed — you can now enter your bank details.");
    },
    onError,
  });

  const app = data?.application as any;
  const payment = data?.payment as any;
  const instructions = (data?.offering?.wire_instructions ?? {}) as Record<string, string>;
  const ready = app?.documents_status === "approved" && app?.accreditation_status === "approved";
  const acks = (data?.acknowledgements ?? {}) as Record<string, any>;
  const wireAck = acks["wire"] && acks["wire"].current ? acks["wire"] : null;
  const achAck = acks["ach"] && acks["ach"].current ? acks["ach"] : null;
  const staleAck = method === "wire" ? acks["wire"] && !acks["wire"].current : acks["ach"] && !acks["ach"].current;
  const allChecked = checked.every(Boolean);
  const statements = method === "wire" ? WIRE_STATEMENTS : ACH_STATEMENTS;
  const reference = payment?.reference_code ?? (data as any)?.reference;

  const copyInstructions = async () => {
    const lines = Object.entries(instructions).map(([k, v]) => `${k.replace(/_/g, " ")}: ${v}`);
    lines.push(`reference: ${reference}`, `amount: ${money(app?.commitment_cents)}`);
    await navigator.clipboard.writeText(lines.join("\n"));
    toast.success("Wire instructions copied");
  };

  const confirmationPanel = (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">
          {method === "wire" ? "Confirm your wire details" : "Confirm your debit details"}
        </CardTitle>
        <CardDescription>
          Review these details for {data?.offering?.name ?? "this fund"} and confirm they are accurate before
          you continue.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4 text-sm">
        {staleAck && (
          <p className="rounded-md border border-amber-300 bg-amber-50 p-3 text-amber-900">
            The funding details for this fund have changed since you last confirmed them. Please review and
            confirm again.
          </p>
        )}

        <dl className="grid gap-x-8 gap-y-2 rounded-md border p-4 sm:grid-cols-2">
          <div className="flex gap-2">
            <dt className="text-muted-foreground">fund:</dt>
            <dd className="font-medium">{data?.offering?.name ?? "—"}</dd>
          </div>
          {method === "wire" &&
            Object.entries(instructions).map(([k, v]) => (
              <div key={k} className="flex gap-2">
                <dt className="text-muted-foreground">{k.replace(/_/g, " ")}:</dt>
                <dd className="break-words font-medium">{String(v)}</dd>
              </div>
            ))}
          <div className="flex gap-2">
            <dt className="text-muted-foreground">reference:</dt>
            <dd className="font-mono font-medium">{reference ?? "—"}</dd>
          </div>
          <div className="flex gap-2">
            <dt className="text-muted-foreground">
              {method === "wire" ? "amount:" : "amount to be debited:"}
            </dt>
            <dd className="font-medium">{money(app?.commitment_cents)}</dd>
          </div>
        </dl>

        <p className="rounded-md border border-destructive/30 bg-destructive/5 p-3 text-destructive">
          These details come from Harmonious. Never act on {method === "wire" ? "wire" : "bank"} details sent
          to you by email, and call the fund to verify by phone before sending money if anything changes.
        </p>

        <div className="space-y-3">
          {statements.map((s, i) => (
            <div key={s} className="flex items-start gap-3">
              <Checkbox
                id={`ack-${method}-${i}`}
                checked={checked[i] ?? false}
                onCheckedChange={(v) =>
                  setChecked((prev) => prev.map((c, idx) => (idx === i ? v === true : c)))
                }
                className="mt-1"
              />
              <Label htmlFor={`ack-${method}-${i}`} className="font-normal">
                {s}
              </Label>
            </div>
          ))}
        </div>

        <div className="flex flex-wrap gap-3">
          <Button
            onClick={() => acknowledgeMutation.mutate(method)}
            disabled={!allChecked || acknowledgeMutation.isPending || chooseWireMutation.isPending}
          >
            {acknowledgeMutation.isPending ? "Confirming…" : "Confirm and continue"}
          </Button>
          {method === "wire" && Object.keys(instructions).length > 0 && (
            <Button variant="outline" onClick={copyInstructions}>
              Copy instructions
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );

  return (
    <main className="mx-auto max-w-3xl px-4 py-10">
      <OnboardingStepper current="funding" />
      <h1 className="mt-8 text-3xl">Fund your subscription</h1>
      <p className="mt-2 text-sm text-muted-foreground">
        Commitment {money(app?.commitment_cents)} · {data?.offering?.name ?? "Fund subscription"}
      </p>

      {isLoading && <p className="mt-8 text-sm text-muted-foreground">Loading…</p>}

      {!isLoading && !ready && (
        <Card className="mt-8">
          <CardHeader>
            <CardTitle className="text-base">Funding is not open yet</CardTitle>
            <CardDescription>
              Capital can only be accepted once compliance has approved your accreditation and your signed
              subscription documents.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button asChild variant="outline" size="sm">
              <Link to="/dashboard">Back to status</Link>
            </Button>
          </CardContent>
        </Card>
      )}

      {!isLoading && ready && (
        <div className="mt-8 space-y-6">
          {payment && (
            <div className="flex items-center gap-2 text-sm">
              <span className="text-muted-foreground">Current funding status:</span>
              <Badge variant="secondary">{String(payment.status).replace(/_/g, " ")}</Badge>
            </div>
          )}

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Choose a funding method</CardTitle>
            </CardHeader>
            <CardContent>
              <RadioGroup value={method} onValueChange={(v) => setMethod(v as "wire" | "ach")} className="gap-3">
                <div className="flex items-start gap-3">
                  <RadioGroupItem value="wire" id="method-wire" className="mt-1" />
                  <Label htmlFor="method-wire" className="font-normal">
                    Bank wire — you send funds from your bank using our instructions and reference code.
                  </Label>
                </div>
                <div className="flex items-start gap-3">
                  <RadioGroupItem value="ach" id="method-ach" className="mt-1" />
                  <Label htmlFor="method-ach" className="font-normal">
                    ACH debit — authorize us to debit your bank account for the commitment amount.
                  </Label>
                </div>
              </RadioGroup>
            </CardContent>
          </Card>

          {((method === "wire" && !wireAck) || (method === "ach" && !achAck)) && confirmationPanel}

          {(method === "wire" ? wireAck : achAck) && (
            <p className="text-xs text-muted-foreground">
              Details confirmed{" "}
              {new Date((method === "wire" ? wireAck : achAck).acknowledged_at).toLocaleString()}.
            </p>
          )}

          {method === "wire" && wireAck && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Wire instructions</CardTitle>
                <CardDescription>
                  Include the reference code so the administrator can match your wire.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4 text-sm">
                {payment?.reference_code ? (
                  <>
                    <dl className="grid gap-x-8 gap-y-2 sm:grid-cols-2">
                      {Object.entries(instructions).map(([k, v]) => (
                        <div key={k} className="flex gap-2">
                          <dt className="text-muted-foreground">{k.replace(/_/g, " ")}:</dt>
                          <dd className="break-words font-medium">{String(v)}</dd>
                        </div>
                      ))}
                      <div className="flex gap-2">
                        <dt className="text-muted-foreground">reference:</dt>
                        <dd className="font-mono font-medium">{payment.reference_code}</dd>
                      </div>
                      <div className="flex gap-2">
                        <dt className="text-muted-foreground">amount:</dt>
                        <dd className="font-medium">{money(app?.commitment_cents)}</dd>
                      </div>
                    </dl>

                    <div className="space-y-4 border-t pt-4">
                      {pendingConfirmation ? (
                        <p className="rounded-md border bg-muted/40 p-3">
                          Wire confirmation submitted{" "}
                          {new Date(pendingConfirmation.created_at).toLocaleString()} for{" "}
                          {money(pendingConfirmation.amount_cents)}. Our team is verifying receipt with the
                          fund administrator and will confirm your funding here.
                        </p>
                      ) : (
                        <>
                          {rejectedConfirmation && (
                            <p className="rounded-md border border-destructive/30 bg-destructive/5 p-3 text-destructive">
                              Your last wire confirmation could not be approved
                              {rejectedConfirmation.review_notes
                                ? `: ${rejectedConfirmation.review_notes}`
                                : "."}{" "}
                              Please check the details and submit again.
                            </p>
                          )}
                          <p className="font-medium">Confirm the wire you sent</p>
                          <div className="grid gap-3 sm:grid-cols-2">
                            <div className="space-y-1.5">
                              <Label htmlFor="expected_date">Date wire was sent</Label>
                              <Input
                                id="expected_date"
                                type="date"
                                value={expectedDate}
                                onChange={(e) => setExpectedDate(e.target.value)}
                              />
                            </div>
                            <div className="space-y-1.5">
                              <Label htmlFor="wire_amount">Amount wired (USD)</Label>
                              <Input
                                id="wire_amount"
                                inputMode="decimal"
                                placeholder="50000"
                                value={wireAmount}
                                onChange={(e) => setWireAmount(e.target.value.replace(/[^\d.]/g, ""))}
                              />
                            </div>
                            <div className="space-y-1.5">
                              <Label htmlFor="sending_bank">Bank you wired from</Label>
                              <Input
                                id="sending_bank"
                                value={sendingBank}
                                onChange={(e) => setSendingBank(e.target.value)}
                              />
                            </div>
                            <div className="space-y-1.5">
                              <Label htmlFor="bank_last4">Sending account last 4</Label>
                              <Input
                                id="bank_last4"
                                inputMode="numeric"
                                maxLength={4}
                                value={bankLast4}
                                onChange={(e) => setBankLast4(e.target.value.replace(/\D/g, ""))}
                              />
                            </div>
                            <div className="space-y-1.5 sm:col-span-2">
                              <Label htmlFor="bank_reference">
                                Bank confirmation / reference number (optional)
                              </Label>
                              <Input
                                id="bank_reference"
                                value={bankReference}
                                onChange={(e) => setBankReference(e.target.value)}
                              />
                            </div>
                            <div className="space-y-1.5 sm:col-span-2">
                              <Label htmlFor="wire_note">Anything we should know (optional)</Label>
                              <Input
                                id="wire_note"
                                value={wireNote}
                                onChange={(e) => setWireNote(e.target.value)}
                              />
                            </div>
                          </div>
                          <div className="flex items-start gap-3">
                            <Checkbox
                              id="wire-accurate"
                              checked={wireAccurate}
                              onCheckedChange={(v) => setWireAccurate(v === true)}
                              className="mt-1"
                            />
                            <Label htmlFor="wire-accurate" className="font-normal">
                              I confirm I have sent this wire and these details are accurate. I understand
                              Harmonious will verify receipt before my subscription is marked funded.
                            </Label>
                          </div>
                          <Button
                            onClick={() => wireConfirmMutation.mutate()}
                            disabled={
                              wireConfirmMutation.isPending ||
                              !expectedDate ||
                              !wireAmount ||
                              sendingBank.trim().length < 2 ||
                              bankLast4.length !== 4 ||
                              !wireAccurate
                            }
                          >
                            {wireConfirmMutation.isPending ? "Submitting…" : "Submit wire confirmation"}
                          </Button>
                        </>
                      )}
                    </div>
                  </>
                ) : (
                  <Button onClick={() => chooseWireMutation.mutate()} disabled={chooseWireMutation.isPending}>
                    {chooseWireMutation.isPending ? "Preparing…" : "Get wire instructions"}
                  </Button>
                )}
              </CardContent>
            </Card>
          )}

          {method === "ach" && achAck && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">ACH debit authorization</CardTitle>
                <CardDescription>
                  Bank details are used once to originate the debit; only the last four digits are retained.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-1.5">
                  <Label htmlFor="account_holder">Account holder</Label>
                  <Input
                    id="account_holder"
                    value={accountHolder}
                    onChange={(e) => setAccountHolder(e.target.value)}
                  />
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="space-y-1.5">
                    <Label htmlFor="routing_number">Routing number</Label>
                    <Input
                      id="routing_number"
                      inputMode="numeric"
                      maxLength={9}
                      value={routing}
                      onChange={(e) => setRouting(e.target.value.replace(/\D/g, ""))}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="account_number">Account number</Label>
                    <Input
                      id="account_number"
                      inputMode="numeric"
                      maxLength={17}
                      value={accountNumber}
                      onChange={(e) => setAccountNumber(e.target.value.replace(/\D/g, ""))}
                    />
                  </div>
                </div>
                <RadioGroup
                  value={accountType}
                  onValueChange={(v) => setAccountType(v as "checking" | "savings")}
                  className="flex gap-6"
                >
                  <div className="flex items-center gap-2">
                    <RadioGroupItem value="checking" id="acct-checking" />
                    <Label htmlFor="acct-checking" className="font-normal">
                      Checking
                    </Label>
                  </div>
                  <div className="flex items-center gap-2">
                    <RadioGroupItem value="savings" id="acct-savings" />
                    <Label htmlFor="acct-savings" className="font-normal">
                      Savings
                    </Label>
                  </div>
                </RadioGroup>
                <div className="flex items-start gap-3">
                  <Checkbox
                    id="authorize"
                    checked={authorize}
                    onCheckedChange={(v) => setAuthorize(v === true)}
                    className="mt-1"
                  />
                  <Label htmlFor="authorize" className="font-normal">
                    I authorize Harmonious to debit {money(app?.commitment_cents)} from this
                    account for my capital commitment.
                  </Label>
                </div>
                <Button
                  onClick={() => achMutation.mutate()}
                  disabled={
                    achMutation.isPending ||
                    !authorize ||
                    accountHolder.trim().length < 2 ||
                    routing.length !== 9 ||
                    accountNumber.length < 4
                  }
                >
                  {achMutation.isPending ? "Authorizing…" : "Authorize ACH debit"}
                </Button>
              </CardContent>
            </Card>
          )}

          <Button asChild variant="outline" size="sm">
            <Link to="/dashboard">Back to status</Link>
          </Button>
        </div>
      )}
    </main>
  );
}
