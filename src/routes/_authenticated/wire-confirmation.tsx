import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { CheckCircle2, Clock, ShieldAlert, XCircle } from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { getFunding, submitWireConfirmation, wireConfirmationSchema } from "@/lib/funding.functions";

export const Route = createFileRoute("/_authenticated/wire-confirmation")({
  head: () => ({
    meta: [
      { title: "Confirm your wire — Harmonious investor portal" },
      {
        name: "description",
        content:
          "Tell Harmonious the details of the wire you sent so your subscription can be matched and reviewed.",
      },
      { property: "og:title", content: "Confirm your wire — Harmonious investor portal" },
      {
        property: "og:description",
        content: "Submit your wire details for review by the Harmonious team.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: WireConfirmationPage,
});

function money(cents?: number | null) {
  if (cents == null) return null;
  return `$${(cents / 100).toLocaleString("en-US")}`;
}

function dateLabel(value?: string | null) {
  if (!value) return null;
  const d = new Date(value.length <= 10 ? `${value}T00:00:00` : value);
  if (Number.isNaN(d.getTime())) return value;
  return d.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });
}

const STATUS: Record<string, { label: string; icon: typeof Clock; tone: string }> = {
  submitted: { label: "Awaiting review", icon: Clock, tone: "text-muted-foreground" },
  approved: { label: "Approved", icon: CheckCircle2, tone: "text-emerald-600" },
  rejected: { label: "Sent back", icon: XCircle, tone: "text-destructive" },
};

function WireConfirmationPage() {
  const load = useServerFn(getFunding);
  const submit = useServerFn(submitWireConfirmation);
  const queryClient = useQueryClient();

  const { data, isLoading } = useQuery({ queryKey: ["funding"], queryFn: () => load() });

  const [form, setForm] = useState({
    sent_on: "",
    amount: "",
    sending_bank_name: "",
    sending_account_last4: "",
    bank_reference: "",
    investor_note: "",
  });
  const [confirmed, setConfirmed] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});

  const confirmations = (data?.wireConfirmations ?? []) as Array<Record<string, any>>;
  const pending = confirmations.some((c) => c.status === "submitted");
  const payment = data?.payment as Record<string, any> | null | undefined;
  const isWire = payment?.method === "wire";
  const settled = payment?.status === "settled";
  const acknowledged = Boolean(data?.acknowledgements?.wire?.current);
  const commitment = money(data?.application?.commitment_cents ?? null);

  const mutation = useMutation({
    mutationFn: async () => {
      const parsed = wireConfirmationSchema.safeParse({ ...form, confirm_accurate: confirmed });
      if (!parsed.success) {
        const next: Record<string, string> = {};
        for (const issue of parsed.error.issues) {
          const key = String(issue.path[0] ?? "form");
          if (!next[key]) next[key] = issue.message;
        }
        if (!confirmed) next["confirm_accurate"] = "Please confirm these details are accurate.";
        setErrors(next);
        throw new Error("Please check the highlighted fields.");
      }
      setErrors({});
      return submit({ data: parsed.data });
    },
    onSuccess: () => {
      toast.success("Wire details sent for review.");
      setConfirmed(false);
      setForm({
        sent_on: "",
        amount: "",
        sending_bank_name: "",
        sending_account_last4: "",
        bank_reference: "",
        investor_note: "",
      });
      void queryClient.invalidateQueries({ queryKey: ["funding"] });
      void queryClient.invalidateQueries({ queryKey: ["portal"] });
    },
    onError: (error: unknown) => {
      toast.error(error instanceof Error ? error.message : "Could not submit your wire details.");
    },
  });

  const field = (key: keyof typeof form) => ({
    value: form[key],
    onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
      setForm((f) => ({ ...f, [key]: e.target.value })),
  });

  const canSubmit = Boolean(data?.application) && isWire && acknowledged && !pending && !settled;

  return (
    <div className="mx-auto w-full max-w-3xl space-y-6 p-6">
      <header className="space-y-2">
        <p className="text-sm font-medium text-muted-foreground">Harmonious investor portal</p>
        <h1 className="font-heading text-3xl font-semibold text-foreground">Confirm your wire</h1>
        <p className="text-muted-foreground">
          Once you've sent your transfer, tell us the details here. Your Harmonious contact reviews
          it and marks your subscription funded — you'll see the status update on this page.
        </p>
      </header>

      {isLoading ? (
        <Card>
          <CardContent className="p-6 text-muted-foreground">Loading your details…</CardContent>
        </Card>
      ) : !data?.application ? (
        <Card>
          <CardContent className="space-y-3 p-6">
            <p className="text-muted-foreground">
              You don't have an active application yet, so there's nothing to confirm.
            </p>
            <Button asChild>
              <Link to="/dashboard">Go to your dashboard</Link>
            </Button>
          </CardContent>
        </Card>
      ) : (
        <>
          {confirmations.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Your submissions</CardTitle>
                <CardDescription>Everything you've sent us so far.</CardDescription>
              </CardHeader>
              <CardContent className="divide-y">
                {confirmations.map((c) => {
                  const meta = STATUS[String(c.status)] ?? STATUS["submitted"]!;
                  const Icon = meta.icon;
                  return (
                    <div key={String(c.id)} className="space-y-1 py-3 first:pt-0 last:pb-0">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <p className="font-medium text-foreground">
                          {money(Number(c.amount_cents))} sent {dateLabel(c.sent_on)}
                        </p>
                        <span className={`flex items-center gap-1.5 text-sm ${meta.tone}`}>
                          <Icon className="h-4 w-4" />
                          {meta.label}
                        </span>
                      </div>
                      <p className="text-sm text-muted-foreground">
                        {String(c.sending_bank_name)} · account ending {String(c.sending_account_last4)}
                        {c.bank_reference ? ` · reference ${String(c.bank_reference)}` : ""}
                      </p>
                      {c.review_notes ? (
                        <p className="text-sm text-foreground">
                          <span className="font-medium">Note from Harmonious:</span>{" "}
                          {String(c.review_notes)}
                        </p>
                      ) : null}
                    </div>
                  );
                })}
              </CardContent>
            </Card>
          )}

          {settled ? (
            <Card>
              <CardContent className="p-6 text-muted-foreground">
                Your subscription is fully funded — no further confirmation is needed.
              </CardContent>
            </Card>
          ) : !isWire || !acknowledged ? (
            <Card>
              <CardContent className="space-y-3 p-6">
                <p className="text-muted-foreground">
                  Before confirming a transfer, choose bank wire as your funding method and review
                  the fund's bank details.
                </p>
                <div className="flex flex-wrap gap-3">
                  <Button asChild>
                    <Link to="/onboarding/funding">Choose funding method</Link>
                  </Button>
                  <Button asChild variant="outline">
                    <Link to="/wire">View wire instructions</Link>
                  </Button>
                </div>
              </CardContent>
            </Card>
          ) : pending ? (
            <Card>
              <CardContent className="p-6 text-muted-foreground">
                Your wire details are with the Harmonious team for review. We'll update this page as
                soon as they've matched your funds.
              </CardContent>
            </Card>
          ) : (
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Wire details</CardTitle>
                <CardDescription>
                  {commitment
                    ? `Your committed amount is ${commitment}. Tell us exactly what you sent.`
                    : "Tell us exactly what you sent."}
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="sent_on">Date sent</Label>
                    <Input id="sent_on" type="date" {...field("sent_on")} />
                    {errors["sent_on"] ? (
                      <p className="text-sm text-destructive">{errors["sent_on"]}</p>
                    ) : null}
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="amount">Amount sent (USD)</Label>
                    <Input id="amount" inputMode="decimal" placeholder="100000" {...field("amount")} />
                    {errors["amount"] ? (
                      <p className="text-sm text-destructive">{errors["amount"]}</p>
                    ) : null}
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="sending_bank_name">Bank you sent from</Label>
                    <Input id="sending_bank_name" {...field("sending_bank_name")} />
                    {errors["sending_bank_name"] ? (
                      <p className="text-sm text-destructive">{errors["sending_bank_name"]}</p>
                    ) : null}
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="sending_account_last4">Last 4 digits of your account</Label>
                    <Input
                      id="sending_account_last4"
                      inputMode="numeric"
                      maxLength={4}
                      {...field("sending_account_last4")}
                    />
                    {errors["sending_account_last4"] ? (
                      <p className="text-sm text-destructive">{errors["sending_account_last4"]}</p>
                    ) : null}
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="bank_reference">Bank reference or confirmation number (optional)</Label>
                  <Input id="bank_reference" {...field("bank_reference")} />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="investor_note">Anything we should know? (optional)</Label>
                  <Textarea id="investor_note" rows={3} {...field("investor_note")} />
                </div>

                <div className="flex items-start gap-3 rounded-md border p-3">
                  <Checkbox
                    id="confirm_accurate"
                    checked={confirmed}
                    onCheckedChange={(v) => setConfirmed(v === true)}
                  />
                  <Label htmlFor="confirm_accurate" className="text-sm font-normal leading-relaxed">
                    I confirm these details are accurate and that I sent the funds to the bank
                    details published by Harmonious for this fund.
                  </Label>
                </div>
                {errors["confirm_accurate"] ? (
                  <p className="text-sm text-destructive">{errors["confirm_accurate"]}</p>
                ) : null}

                <div className="flex flex-wrap gap-3">
                  <Button
                    disabled={!canSubmit || mutation.isPending}
                    onClick={() => mutation.mutate()}
                  >
                    {mutation.isPending ? "Sending…" : "Submit for review"}
                  </Button>
                  <Button asChild variant="outline">
                    <Link to="/wire">View wire instructions</Link>
                  </Button>
                </div>
              </CardContent>
            </Card>
          )}

          <Card className="border-destructive/40">
            <CardContent className="flex gap-3 p-6">
              <ShieldAlert className="mt-0.5 h-5 w-5 shrink-0 text-destructive" />
              <div className="space-y-1 text-sm">
                <p className="font-semibold text-foreground">Beware of wire fraud</p>
                <p className="text-muted-foreground">
                  Harmonious will never email you changed bank details. Always confirm by phone
                  using a number you already have on file before sending money.
                </p>
              </div>
            </CardContent>
          </Card>

          <div className="flex flex-wrap gap-3">
            <Badge variant="secondary">Reviewed by your Harmonious contact</Badge>
            <Button asChild variant="ghost">
              <Link to="/dashboard">Back to dashboard</Link>
            </Button>
          </div>
        </>
      )}
    </div>
  );
}
