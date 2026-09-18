import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
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
import {
  investorConfirmDistributionFn,
  myDistributionsFn,
  myPaymentInstructionsFn,
  requestPaymentInstructionFn,
} from "@/lib/distributions.functions";

const money = (cents: number | null | undefined) =>
  typeof cents === "number"
    ? (cents / 100).toLocaleString("en-US", { style: "currency", currency: "USD" })
    : "—";

const STATUS_LABEL: Record<string, string> = {
  not_started: "Being prepared",
  ready: "Approved, awaiting payment",
  sent: "Sent",
  submitted: "Sent",
  confirmed: "Confirmed by the bank",
  paid: "Paid",
  returned: "Returned",
  failed: "Failed",
  reversed: "Reversed",
};

/** An investor's own distributions, kept separate for each investment profile. */
export function InvestorDistributions() {
  const queryClient = useQueryClient();
  const load = useServerFn(myDistributionsFn);
  const confirm = useServerFn(investorConfirmDistributionFn);

  const { data, isLoading, error } = useQuery({
    queryKey: ["my-distributions"],
    queryFn: () => load({ data: {} }),
    retry: false,
  });

  const confirmM = useMutation({
    mutationFn: (lineId: string) => confirm({ data: { lineId } }),
    onSuccess: () => {
      toast.success("Thank you — your confirmation has been recorded.");
      queryClient.invalidateQueries({ queryKey: ["my-distributions"] });
    },
    onError: (e: any) => toast.error(e?.message ?? "That didn't save."),
  });

  if (isLoading) return <p className="text-sm text-muted-foreground">Loading your distributions…</p>;
  if (error) {
    return <p className="text-sm text-destructive">{(error as any)?.message ?? "Nothing to show."}</p>;
  }

  const rows = (data?.distributions ?? []) as any[];
  const groups = new Map<string, any[]>();
  for (const row of rows) {
    const key = String(row.investmentProfileId ?? "personal");
    groups.set(key, [...(groups.get(key) ?? []), row]);
  }

  return (
    <div className="space-y-6">
      {rows.length === 0 ? (
        <p className="text-sm text-muted-foreground">You have no distributions yet.</p>
      ) : null}

      {[...groups.entries()].map(([profileId, lines]) => (
        <Card key={profileId}>
          <CardHeader>
            <CardTitle className="text-base">Investments held under this profile</CardTitle>
            <CardDescription>
              Each of your investment profiles is kept separate, as it is legally.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {lines.map((l) => (
              <div key={l.id} className="rounded-md border p-3">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-medium">{money(l.netCents)} paid to you</span>
                  <Badge variant="outline">{STATUS_LABEL[l.status] ?? l.status}</Badge>
                  {l.paymentDate ? <Badge variant="outline">{l.paymentDate}</Badge> : null}
                </div>
                <p className="mt-1 text-sm text-muted-foreground">
                  {money(l.grossCents)} gross · {money(l.withholdingCents)} tax withheld ·{" "}
                  {money(l.netCents)} net
                  {l.destinationEnding ? ` · to the account ending ${l.destinationEnding}` : ""}
                </p>
                {l.confirmationRequired ? (
                  <Button size="sm" className="mt-2" onClick={() => confirmM.mutate(l.id)}>
                    Confirm my details
                  </Button>
                ) : null}
              </div>
            ))}
          </CardContent>
        </Card>
      ))}

      <PaymentDestinations />
    </div>
  );
}

/** Where the investor asks for money to be sent. Changes are always verified. */
function PaymentDestinations() {
  const queryClient = useQueryClient();
  const load = useServerFn(myPaymentInstructionsFn);
  const request = useServerFn(requestPaymentInstructionFn);

  const { data } = useQuery({
    queryKey: ["my-payment-instructions"],
    queryFn: () => load(),
    retry: false,
  });

  const [method, setMethod] = useState("wire");
  const [beneficiaryName, setBeneficiaryName] = useState("");
  const [bankName, setBankName] = useState("");
  const [accountNumber, setAccountNumber] = useState("");
  const [routingNumber, setRoutingNumber] = useState("");

  const submit = useMutation({
    mutationFn: () =>
      request({
        data: {
          destination: {
            method,
            beneficiaryName,
            bankName,
            accountNumber,
            routingNumber,
            country: "US",
            currency: "USD",
          },
        },
      }),
    onSuccess: () => {
      toast.success("Received. We'll verify these details with you before using them.");
      setAccountNumber("");
      setRoutingNumber("");
      queryClient.invalidateQueries({ queryKey: ["my-payment-instructions"] });
    },
    onError: (e: any) => toast.error(e?.message ?? "Those details weren't saved."),
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Where your money is sent</CardTitle>
        <CardDescription>
          For your protection, new or changed bank details are verified with you independently and
          held for a short cooling-off period before any payment uses them.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <ul className="text-sm text-muted-foreground">
          {((data?.instructions ?? []) as any[]).map((i) => (
            <li key={i.id}>
              {i.bankName ?? i.method} ending {i.maskedAccount ?? "—"} · {i.status.replace(/_/g, " ")}
            </li>
          ))}
        </ul>
        <div className="grid gap-3 md:grid-cols-2">
          <div>
            <Label>How you want to be paid</Label>
            <Select value={method} onValueChange={setMethod}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="wire">Bank wire</SelectItem>
                <SelectItem value="ach">Bank transfer (ACH)</SelectItem>
                <SelectItem value="custodian">Custodian account</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Name on the account</Label>
            <Input value={beneficiaryName} onChange={(e) => setBeneficiaryName(e.target.value)} />
          </div>
          <div>
            <Label>Bank</Label>
            <Input value={bankName} onChange={(e) => setBankName(e.target.value)} />
          </div>
          <div>
            <Label>Account number</Label>
            <Input value={accountNumber} onChange={(e) => setAccountNumber(e.target.value)} />
          </div>
          <div>
            <Label>Routing number</Label>
            <Input value={routingNumber} onChange={(e) => setRoutingNumber(e.target.value)} />
          </div>
        </div>
        <Button disabled={submit.isPending} onClick={() => submit.mutate()}>
          {submit.isPending ? "Sending…" : "Submit these details"}
        </Button>
      </CardContent>
    </Card>
  );
}
