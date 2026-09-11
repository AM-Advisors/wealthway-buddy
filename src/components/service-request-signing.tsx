import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { stageLabel } from "@/components/service-requests-board";
import {
  acceptServiceQuote,
  getMyServiceRequests,
  withdrawServiceRequest,
} from "@/lib/contracts.functions";

function money(cents: number | null | undefined) {
  if (cents === null || cents === undefined) return null;
  return `$${(cents / 100).toLocaleString("en-US")}`;
}

const WAITING: Record<string, string> = {
  requested: "Waiting on Harmonious to review it.",
  in_review: "Harmonious is reviewing it.",
  quoted: "Waiting on your signature.",
  signed: "Signed — waiting on Harmonious to switch it on.",
  activated: "Active. It's part of your scope now.",
  declined: "Declined by Harmonious.",
  withdrawn: "Withdrawn.",
};

/** The client's own view: every additional service they've asked for, and the signing step. */
export function MyServiceRequests() {
  const queryClient = useQueryClient();
  const load = useServerFn(getMyServiceRequests);
  const accept = useServerFn(acceptServiceQuote);
  const withdraw = useServerFn(withdrawServiceRequest);

  const { data, isLoading, error } = useQuery({
    queryKey: ["my-service-requests"],
    queryFn: () => load(),
    retry: false,
  });

  const [signing, setSigning] = useState<any | null>(null);
  const [signerName, setSignerName] = useState("");
  const [signerTitle, setSignerTitle] = useState("");
  const [agreed, setAgreed] = useState(false);

  const refresh = () => queryClient.invalidateQueries({ queryKey: ["my-service-requests"] });
  const fail = (e: any) => toast.error(e?.message ?? "That didn't save.");

  const acceptMut = useMutation({
    mutationFn: () =>
      accept({
        data: { requestId: signing.id, signerName, signerTitle },
      }),
    onSuccess: () => {
      toast.success("Signed. Harmonious will switch the service on.");
      setSigning(null);
      setSignerName("");
      setSignerTitle("");
      setAgreed(false);
      refresh();
    },
    onError: fail,
  });

  const withdrawMut = useMutation({
    mutationFn: (requestId: string) => withdraw({ data: { requestId } }),
    onSuccess: () => {
      toast.success("Request withdrawn.");
      refresh();
    },
    onError: fail,
  });

  if (isLoading) return null;
  if (error || !data || data.requests.length === 0) return null;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">Additional services you've requested</CardTitle>
        <CardDescription>
          Each request moves from review to a written fee proposal, your signature, and then goes
          live in your scope.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {data.requests.map((r: any) => (
          <div key={r.id} className="space-y-2 rounded-md border p-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <p className="text-sm font-medium">{r.serviceName}</p>
                <p className="text-xs text-muted-foreground">
                  {r.fundName ?? "All funds"} · asked {new Date(r.created_at).toLocaleDateString("en-US")}
                </p>
              </div>
              <Badge variant={r.status === "activated" ? "default" : r.status === "declined" ? "destructive" : "secondary"}>
                {stageLabel(r.status)}
              </Badge>
            </div>
            <p className="text-sm text-muted-foreground">{WAITING[r.status] ?? r.status}</p>

            {r.status === "quoted" ? (
              <div className="space-y-2 rounded-md bg-muted p-3 text-sm">
                <p>
                  Proposed fee:{" "}
                  <span className="font-medium">{feeText(r.proposed_fee_cents, r.proposed_pricing_model)}</span>
                  {r.effective_date ? ` · starts ${r.effective_date}` : ""}
                </p>
                {r.amendment_terms ? <p className="whitespace-pre-wrap">{r.amendment_terms}</p> : null}
                {r.review_note ? <p className="text-muted-foreground">Note: {r.review_note}</p> : null}
                <Button size="sm" onClick={() => setSigning(r)}>
                  Review and sign
                </Button>
              </div>
            ) : null}

            {r.status === "declined" && r.declined_reason ? (
              <p className="text-sm text-muted-foreground">Reason: {r.declined_reason}</p>
            ) : null}

            {["requested", "in_review", "quoted"].includes(r.status) ? (
              <Button
                size="sm"
                variant="ghost"
                disabled={withdrawMut.isPending}
                onClick={() => withdrawMut.mutate(r.id)}
              >
                Withdraw request
              </Button>
            ) : null}
          </div>
        ))}

        {signing ? (
          <div className="space-y-3 rounded-md border border-primary p-4">
            <p className="text-sm font-medium">Sign the amendment — {signing.serviceName}</p>
            <p className="text-sm">
              Fee:{" "}
              <span className="font-medium">
                {feeText(signing.proposed_fee_cents, signing.proposed_pricing_model)}
              </span>
              {signing.effective_date ? ` · starts ${signing.effective_date}` : ""}
            </p>
            {signing.amendment_terms ? (
              <p className="whitespace-pre-wrap rounded-md bg-muted p-3 text-sm">
                {signing.amendment_terms}
              </p>
            ) : null}
            <div className="flex items-start gap-2">
              <Checkbox
                id="sow-amend-agree"
                checked={agreed}
                onCheckedChange={(v) => setAgreed(v === true)}
              />
              <Label htmlFor="sow-amend-agree" className="text-sm font-normal leading-snug">
                I agree this amends our statement of work{signing.sowTitle ? ` (${signing.sowTitle})` : ""},
                and I'm authorized to sign for the client.
              </Label>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <Label htmlFor="signer-name">Your full name</Label>
                <Input
                  id="signer-name"
                  value={signerName}
                  onChange={(e) => setSignerName(e.target.value)}
                />
              </div>
              <div>
                <Label htmlFor="signer-title">Title (optional)</Label>
                <Input
                  id="signer-title"
                  value={signerTitle}
                  onChange={(e) => setSignerTitle(e.target.value)}
                />
              </div>
            </div>
            <div className="flex gap-2">
              <Button
                disabled={!agreed || signerName.trim().length < 2 || acceptMut.isPending}
                onClick={() => acceptMut.mutate()}
              >
                Sign and accept
              </Button>
              <Button variant="ghost" onClick={() => setSigning(null)}>
                Cancel
              </Button>
            </div>
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}
