import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";

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
import { supabase } from "@/integrations/supabase/client";
import {
  createPaymentInstruction,
  getMoneyMovementOptions,
} from "@/lib/payment-controls.functions";

/**
 * Raises one movement of money for review. Harmonious facilitates the payment
 * on instruction — it does not hold funds as a bank, custodian or escrow agent.
 * Anything outside the client's active statement of work is refused here.
 */
export function RaisePaymentCard({
  kind,
}: {
  kind: "wire" | "distribution";
}) {
  const queryClient = useQueryClient();
  const loadOptions = useServerFn(getMoneyMovementOptions);
  const create = useServerFn(createPaymentInstruction);

  const options = useQuery({
    queryKey: ["money-movement-options"],
    queryFn: () => loadOptions(),
    retry: false,
    staleTime: 300_000,
  });

  const [fundId, setFundId] = useState("");
  const [purpose, setPurpose] = useState(kind === "distribution" ? "distribution" : "expense");
  const [amount, setAmount] = useState("");
  const [beneficiaryName, setBeneficiaryName] = useState("");
  const [beneficiaryAccount, setBeneficiaryAccount] = useState("");
  const [originatingAccount, setOriginatingAccount] = useState("");
  const [authorization, setAuthorization] = useState("");
  const [note, setNote] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);

  const funds = (options.data?.funds ?? []) as any[];
  const fund = funds.find((f) => f.id === fundId) ?? null;

  const submit = useMutation({
    mutationFn: async () => {
      const cents = Math.round(Number(amount) * 100);
      if (!fundId) throw new Error("Choose the fund this payment belongs to.");
      if (!Number.isFinite(cents) || cents <= 0) throw new Error("Enter the amount.");

      let path = "";
      if (file) {
        setBusy(true);
        const safe = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
        path = `${fundId}/${Date.now()}-${safe}`;
        const { error } = await supabase.storage.from("payment-documents").upload(path, file);
        if (error) throw new Error(error.message);
      }

      return create({
        data: {
          offeringId: fundId,
          clientId: fund?.client_id ?? null,
          direction: "outbound",
          purpose,
          amountCents: cents,
          beneficiaryName,
          beneficiaryAccount,
          originatingAccount,
          supportingDocumentPath: path,
          authorizationReference: authorization,
          callbackRequired: true,
          note,
        },
      });
    },
    onSuccess: () => {
      toast.success("Raised for verification and two approvals.");
      setAmount("");
      setBeneficiaryName("");
      setBeneficiaryAccount("");
      setAuthorization("");
      setNote("");
      setFile(null);
      queryClient.invalidateQueries({ queryKey: ["payment-instructions"] });
    },
    onError: (e: any) => toast.error(e?.message ?? "That payment wasn't raised."),
    onSettled: () => setBusy(false),
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">
          {kind === "distribution" ? "Raise a distribution" : "Raise a wire"}
        </CardTitle>
        <CardDescription>
          {kind === "distribution"
            ? "Money paid back out to investors, on the fund's written instruction. It is recorded against the fund once the bank settles it."
            : "An outgoing payment on the client's instruction. Harmonious facilitates it; it does not hold or custody the money."}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="grid gap-3 md:grid-cols-2">
          <div>
            <Label>Fund</Label>
            <Select value={fundId} onValueChange={setFundId}>
              <SelectTrigger>
                <SelectValue placeholder="Choose a fund" />
              </SelectTrigger>
              <SelectContent>
                {funds.map((f) => (
                  <SelectItem key={f.id} value={f.id}>
                    {f.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Purpose</Label>
            <Select value={purpose} onValueChange={setPurpose}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {kind === "distribution" ? (
                  <>
                    <SelectItem value="distribution">Distribution to investors</SelectItem>
                    <SelectItem value="return_of_capital">Return of capital</SelectItem>
                  </>
                ) : (
                  <>
                    <SelectItem value="expense">Fund expense</SelectItem>
                    <SelectItem value="fee">Harmonious fee (authorised)</SelectItem>
                    <SelectItem value="transfer">Transfer between accounts</SelectItem>
                    <SelectItem value="other">Other</SelectItem>
                  </>
                )}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Amount (USD)</Label>
            <Input value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0.00" />
          </div>
          <div>
            <Label>Paying from</Label>
            <Input
              value={originatingAccount}
              onChange={(e) => setOriginatingAccount(e.target.value)}
              placeholder="Fund operating account"
            />
          </div>
          <div>
            <Label>Beneficiary</Label>
            <Input
              value={beneficiaryName}
              onChange={(e) => setBeneficiaryName(e.target.value)}
              placeholder="Who is being paid"
            />
          </div>
          <div>
            <Label>Beneficiary account</Label>
            <Input
              value={beneficiaryAccount}
              onChange={(e) => setBeneficiaryAccount(e.target.value)}
              placeholder="Last four digits are enough"
            />
          </div>
          <div>
            <Label>Written instruction reference</Label>
            <Input
              value={authorization}
              onChange={(e) => setAuthorization(e.target.value)}
              placeholder="Email, resolution or notice from the client"
            />
          </div>
          <div>
            <Label>Supporting document</Label>
            <Input
              type="file"
              accept=".pdf,.doc,.docx,.png,.jpg,.jpeg"
              onChange={(e) => setFile(e.target.files?.[0] ?? null)}
            />
          </div>
        </div>
        <div>
          <Label>Note</Label>
          <Textarea rows={2} value={note} onChange={(e) => setNote(e.target.value)} />
        </div>
        <Button disabled={submit.isPending || busy} onClick={() => submit.mutate()}>
          {submit.isPending || busy ? "Raising…" : "Raise for approval"}
        </Button>
        <p className="text-xs text-muted-foreground">
          Two authorised people must approve, the beneficiary must be verified and compliance must
          clear it before anything is sent.
        </p>
      </CardContent>
    </Card>
  );
}
