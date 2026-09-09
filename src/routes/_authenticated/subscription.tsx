import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import { confirmSubscription, getMySubscription } from "@/lib/subscription.functions";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";

export const Route = createFileRoute("/_authenticated/subscription")({
  head: () => ({
    meta: [
      { title: "Confirm Your Commitment — Harmonious Investor Portal" },
      {
        name: "description",
        content:
          "Confirm the amount you are subscribing for, how the investment is titled, and whether you will fund by wire or ACH.",
      },
      { property: "og:title", content: "Confirm Your Commitment — Harmonious Investor Portal" },
      {
        property: "og:description",
        content: "Confirm your subscription amount and payment method before funding.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: SubscriptionPage,
});

function money(cents?: number | null) {
  if (!cents) return "—";
  return `$${(cents / 100).toLocaleString("en-US")}`;
}

const TITLES = [
  { value: "individual", label: "In my own name" },
  { value: "joint", label: "Jointly with another person" },
  { value: "entity", label: "Through a company or LLC" },
  { value: "trust", label: "Through a trust" },
  { value: "ira", label: "Through a retirement account" },
] as const;

function SubscriptionPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const load = useServerFn(getMySubscription);
  const confirm = useServerFn(confirmSubscription);

  const { data, isLoading } = useQuery({ queryKey: ["my-subscription"], queryFn: () => load() });

  const [amount, setAmount] = useState("");
  const [ownershipTitle, setOwnershipTitle] = useState("");
  const [taxClassification, setTaxClassification] = useState<string>("individual");
  const [paymentMethod, setPaymentMethod] = useState<string>("wire");
  const [signedName, setSignedName] = useState("");
  const [agree, setAgree] = useState(false);

  useEffect(() => {
    const sub = data?.subscription as any;
    const app = data?.application as any;
    const cents = Number(sub?.commitment_cents ?? app?.commitment_cents ?? 0);
    if (cents > 0) setAmount(String(cents / 100));
    if (sub?.ownership_title) setOwnershipTitle(sub.ownership_title);
    if (sub?.tax_classification) setTaxClassification(sub.tax_classification);
    if (sub?.payment_method) setPaymentMethod(sub.payment_method);
    if (sub?.signed_name) setSignedName(sub.signed_name);
  }, [data]);

  const mutation = useMutation({
    mutationFn: () =>
      confirm({
        data: {
          amount: amount.replace(/[$,\s]/g, ""),
          ownership_title: ownershipTitle,
          tax_classification: taxClassification as any,
          payment_method: paymentMethod as any,
          signed_name: signedName,
          agree: true as const,
        },
      }),
    onSuccess: async () => {
      toast.success("Commitment confirmed");
      await queryClient.invalidateQueries({ queryKey: ["my-subscription"] });
      await queryClient.invalidateQueries({ queryKey: ["funding"] });
      navigate({ to: "/onboarding/funding" });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  if (isLoading) {
    return <p className="p-8 text-sm text-muted-foreground">Loading your subscription…</p>;
  }

  if (!data?.application) {
    return (
      <div className="mx-auto max-w-2xl p-8">
        <Card>
          <CardHeader>
            <CardTitle>No fund assigned yet</CardTitle>
            <CardDescription>
              Once the fund team adds you to an offering, you can confirm your commitment here.
            </CardDescription>
          </CardHeader>
        </Card>
      </div>
    );
  }

  const offering = data.offering as any;
  const sub = data.subscription as any;
  const locked = Boolean(data.locked);
  const minimum = Number(offering?.min_investment_cents ?? 0);

  return (
    <div className="mx-auto max-w-3xl space-y-6 p-6 md:p-8">
      <header className="space-y-1">
        <h1 className="text-2xl font-semibold">Confirm your commitment</h1>
        <p className="text-sm text-muted-foreground">
          {offering?.name ?? "Your fund"} · minimum {money(minimum)}
        </p>
      </header>

      {sub?.status === "confirmed" ? (
        <Card>
          <CardHeader className="flex flex-row items-start justify-between gap-4">
            <div>
              <CardTitle>Commitment on file</CardTitle>
              <CardDescription>
                Confirmed{" "}
                {sub.confirmed_at ? new Date(sub.confirmed_at).toLocaleString("en-US") : "recently"} by{" "}
                {sub.signed_name ?? "you"}.
              </CardDescription>
            </div>
            <Badge>{money(sub.commitment_cents)}</Badge>
          </CardHeader>
          <CardContent className="grid gap-2 text-sm sm:grid-cols-2">
            <div>
              <p className="text-muted-foreground">Titled as</p>
              <p className="font-medium">{sub.ownership_title ?? "—"}</p>
            </div>
            <div>
              <p className="text-muted-foreground">Paying by</p>
              <p className="font-medium">{sub.payment_method === "ach" ? "Bank debit (ACH)" : "Bank wire"}</p>
            </div>
            <div className="sm:col-span-2">
              <Button asChild size="sm">
                <Link to="/onboarding/funding">Go to payment</Link>
              </Button>
            </div>
          </CardContent>
        </Card>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle>{sub?.status === "confirmed" ? "Change your commitment" : "Your subscription"}</CardTitle>
          <CardDescription>
            {locked
              ? "Your payment is already in progress, so the amount is locked. Contact the fund team to change it."
              : "Tell us the amount you are subscribing for, how it should be titled, and how you will pay."}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          <div className="space-y-2">
            <Label htmlFor="amount">Commitment amount (USD)</Label>
            <Input
              id="amount"
              inputMode="decimal"
              placeholder="250000"
              value={amount}
              disabled={locked}
              onChange={(e) => setAmount(e.target.value)}
            />
            {minimum > 0 ? (
              <p className="text-xs text-muted-foreground">Minimum {money(minimum)}.</p>
            ) : null}
          </div>

          <div className="space-y-2">
            <Label htmlFor="title">How should the investment be titled?</Label>
            <Input
              id="title"
              placeholder="Jane Q. Investor Revocable Trust"
              value={ownershipTitle}
              disabled={locked}
              onChange={(e) => setOwnershipTitle(e.target.value)}
            />
          </div>

          <div className="space-y-2">
            <Label>Who is investing?</Label>
            <RadioGroup
              value={taxClassification}
              onValueChange={setTaxClassification}
              disabled={locked}
              className="grid gap-2 sm:grid-cols-2"
            >
              {TITLES.map((t) => (
                <label
                  key={t.value}
                  className="flex items-center gap-2 rounded-md border p-3 text-sm"
                  htmlFor={`tax-${t.value}`}
                >
                  <RadioGroupItem id={`tax-${t.value}`} value={t.value} />
                  {t.label}
                </label>
              ))}
            </RadioGroup>
          </div>

          <div className="space-y-2">
            <Label>How will you pay?</Label>
            <RadioGroup
              value={paymentMethod}
              onValueChange={setPaymentMethod}
              disabled={locked}
              className="grid gap-2 sm:grid-cols-2"
            >
              <label className="flex items-center gap-2 rounded-md border p-3 text-sm" htmlFor="pay-wire">
                <RadioGroupItem id="pay-wire" value="wire" />
                Bank wire
              </label>
              <label className="flex items-center gap-2 rounded-md border p-3 text-sm" htmlFor="pay-ach">
                <RadioGroupItem id="pay-ach" value="ach" />
                Bank debit (ACH)
              </label>
            </RadioGroup>
          </div>

          <div className="space-y-2">
            <Label htmlFor="signature">Type your full legal name</Label>
            <Input
              id="signature"
              placeholder="Jane Q. Investor"
              value={signedName}
              disabled={locked}
              onChange={(e) => setSignedName(e.target.value)}
            />
          </div>

          <label className="flex items-start gap-3 text-sm" htmlFor="agree">
            <Checkbox
              id="agree"
              checked={agree}
              disabled={locked}
              onCheckedChange={(v) => setAgree(v === true)}
            />
            <span>
              I confirm this is the amount I am subscribing for, and that the fund team may rely on it when
              preparing my closing documents.
            </span>
          </label>

          <Button
            onClick={() => mutation.mutate()}
            disabled={locked || !agree || mutation.isPending || !amount || !signedName || !ownershipTitle}
          >
            {mutation.isPending ? "Saving…" : "Confirm commitment and continue"}
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
