/**
 * Investor sign-off card: the investor confirms their fund and commitment
 * before Harmonious records any capital for them.
 */
import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";

import {
  getMyInvestorSignoff,
  signInvestorCommitment,
} from "@/lib/investor-signoff.functions";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const money = (cents: number) =>
  new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(cents / 100);

export function InvestorSignoffCard() {
  const load = useServerFn(getMyInvestorSignoff);
  const sign = useServerFn(signInvestorCommitment);
  const queryClient = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ["investor-signoff"],
    queryFn: () => load(),
  });

  const [name, setName] = useState("");
  const [title, setTitle] = useState("");
  const [agreed, setAgreed] = useState<boolean[]>([]);

  useEffect(() => {
    if (data?.acknowledgements) setAgreed(data.acknowledgements.map(() => false));
  }, [data?.acknowledgements?.length, data?.status]);

  const mutation = useMutation({
    mutationFn: () =>
      sign({
        data: {
          application_id: data!.applicationId!,
          signer_name: name.trim(),
          signer_title: title.trim() || null,
          confirmed_commitment_cents: data!.commitmentCents,
        },
      }),
    onSuccess: () => {
      toast.success("Thank you — your fund and commitment are approved.");
      setName("");
      setTitle("");
      queryClient.invalidateQueries({ queryKey: ["investor-signoff"] });
    },
    onError: (e: any) => toast.error(e?.message ?? "We could not record your approval."),
  });

  if (isLoading || !data || data.status === "no_application") return null;

  const allAgreed = agreed.length > 0 && agreed.every(Boolean);
  const canSign = allAgreed && name.trim().length >= 2 && !mutation.isPending;

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <CardTitle className="text-base">Approve your fund and commitment</CardTitle>
            <CardDescription>
              Harmonious records your capital only after you confirm these details.
            </CardDescription>
          </div>
          <Badge
            variant={
              data.status === "signed" ? "default" : data.status === "outdated" ? "destructive" : "outline"
            }
          >
            {data.status === "signed"
              ? "Approved"
              : data.status === "outdated"
                ? "Re-approval needed"
                : data.status === "no_commitment"
                  ? "Waiting on your commitment"
                  : "Approval needed"}
          </Badge>
        </div>
      </CardHeader>

      <CardContent className="space-y-4">
        <div className="grid gap-3 rounded-lg border p-3 text-sm sm:grid-cols-3">
          <div>
            <p className="text-muted-foreground">Fund</p>
            <p className="font-medium">{data.fundName}</p>
          </div>
          <div>
            <p className="text-muted-foreground">Your commitment</p>
            <p className="font-medium">
              {data.commitmentCents > 0 ? money(data.commitmentCents) : "Not set yet"}
            </p>
          </div>
          <div>
            <p className="text-muted-foreground">Price per unit</p>
            <p className="font-medium">
              {data.sharePriceCents ? money(data.sharePriceCents) : "Not set"}
            </p>
          </div>
        </div>

        {data.latest ? (
          <p className="text-xs text-muted-foreground">
            Signed by {data.latest.signerName}
            {data.latest.signerTitle ? `, ${data.latest.signerTitle}` : ""} on{" "}
            {new Date(data.latest.signedAt).toLocaleString()} for{" "}
            {money(data.latest.commitmentCents)}.
          </p>
        ) : null}

        {data.status === "no_commitment" ? (
          <p className="text-sm text-muted-foreground">
            Once your commitment amount is set, you will be asked to approve it here.
          </p>
        ) : data.status === "signed" ? (
          <p className="text-sm text-muted-foreground">
            Your approval is on file. If your commitment changes, you will be asked to approve the
            new amount before any capital is recorded.
          </p>
        ) : (
          <div className="space-y-3">
            {data.status === "outdated" ? (
              <p className="text-sm text-destructive">
                Your commitment amount changed since you last approved it. Please review and approve
                the amount above.
              </p>
            ) : null}

            <ul className="space-y-2">
              {data.acknowledgements.map((text, i) => (
                <li key={text} className="flex items-start gap-2 text-sm">
                  <Checkbox
                    id={`ack-${i}`}
                    checked={agreed[i] ?? false}
                    onCheckedChange={(v) =>
                      setAgreed((prev) => prev.map((p, idx) => (idx === i ? Boolean(v) : p)))
                    }
                  />
                  <Label htmlFor={`ack-${i}`} className="font-normal leading-snug">
                    {text}
                  </Label>
                </li>
              ))}
            </ul>

            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1">
                <Label htmlFor="signoff-name">Type your full legal name</Label>
                <Input
                  id="signoff-name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Jane Investor"
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="signoff-title">Title (if signing for an entity)</Label>
                <Input
                  id="signoff-title"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="Managing Member"
                />
              </div>
            </div>

            <Button disabled={!canSign} onClick={() => mutation.mutate()}>
              {mutation.isPending ? "Recording…" : "Approve fund and commitment"}
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
