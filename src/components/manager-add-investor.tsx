import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";

import { inviteInvestorFn, managerOnboardingBoardFn, resendOnboardInvitationFn } from "@/lib/investor-onboarding.functions";
import { managerPortalStatus } from "@/lib/onboard-portal-model";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

const money = (cents: number | null | undefined) =>
  cents == null ? "—" : `$${(cents / 100).toLocaleString(undefined, { maximumFractionDigits: 0 })}`;

const INVESTOR_TYPES = [
  ["unknown", "Not sure yet"],
  ["individual", "Individual"],
  ["joint", "Joint"],
  ["entity", "Company / LLC"],
  ["trust", "Trust"],
  ["ira", "IRA / retirement account"],
] as const;

/**
 * Fund → Investors → Add Investor. The fund's exemption (506(b)/506(c)) comes
 * from its own configuration; managers never choose it here.
 */
export function ManagerAddInvestor({ fundId, exemptionLabel }: { fundId: string; exemptionLabel?: string | null }) {
  const qc = useQueryClient();
  const invite = useServerFn(inviteInvestorFn);
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [amount, setAmount] = useState("");
  const [type, setType] = useState("unknown");
  const [link, setLink] = useState<string | null>(null);
  useEffect(() => {
    const raw = window.sessionStorage.getItem(`harmonious.invite-draft.${fundId}`);
    if (!raw) return;
    try { const d = JSON.parse(raw); setEmail(d.email ?? ""); setName(d.name ?? ""); setAmount(d.amount ?? ""); setType(d.type ?? "unknown"); } catch { /* ignore */ }
  }, [fundId]);

  const send = useMutation({
    mutationFn: () =>
      invite({
        data: {
          offeringId: fundId,
          email: email.trim(),
          name: name.trim() || null,
          intendedAmountCents: amount ? Math.round(Number(amount.replace(/[,$]/g, "")) * 100) : null,
          source: type === "unknown" ? "manager" : `manager:${type}`,
        },
      }),
    onSuccess: (r: any) => {
      toast.success(r.emailSent ? "Invitation sent." : "Invitation created. The email could not be sent — use Resend.");
      setLink(null);
      window.sessionStorage.removeItem(`harmonious.invite-draft.${fundId}`);
      setEmail("");
      setName("");
      setAmount("");
      void qc.invalidateQueries({ queryKey: ["fund-investor-progress", fundId] });
    },
    onError: (e: any) => toast.error(String(e?.message ?? e).replace(/^Forbidden:\s*/, "")),
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Add Investor</CardTitle>
        <CardDescription>
          They'll get one secure link to complete their investment.
          {exemptionLabel ? ` This fund is offered under ${exemptionLabel}, so the right checks apply automatically.` : ""}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <Label htmlFor="inv-email">Email</Label>
            <Input id="inv-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
          </div>
          <div>
            <Label htmlFor="inv-name">Name</Label>
            <Input id="inv-name" value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div>
            <Label htmlFor="inv-amount">Investment amount (USD)</Label>
            <Input id="inv-amount" inputMode="decimal" placeholder="250,000" value={amount} onChange={(e) => setAmount(e.target.value)} />
          </div>
          <div>
            <Label>Investor type, if known</Label>
            <Select value={type} onValueChange={setType}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {INVESTOR_TYPES.map(([v, l]) => <SelectItem key={v} value={v}>{l}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        </div>
        <Button disabled={!/.+@.+\..+/.test(email) || send.isPending} onClick={() => send.mutate()}>
          {send.isPending ? "Sending…" : "Send Invitation"}
        </Button>
        <Button variant="outline" className="ml-2" onClick={() => { window.sessionStorage.setItem(`harmonious.invite-draft.${fundId}`, JSON.stringify({ email, name, amount, type })); toast.success("Draft saved on this device."); }}>
          Save Draft
        </Button>
        {link ? (
          <p className="break-all rounded-md bg-muted p-3 text-xs text-muted-foreground">
            Invitation link: {link}
          </p>
        ) : null}
      </CardContent>
    </Card>
  );
}

/** Progress only — no identity evidence, tax numbers, provider results or bank details. */
export function FundInvestorProgress({ fundId }: { fundId: string }) {
  const load = useServerFn(managerOnboardingBoardFn);
  const { data, isLoading } = useQuery({
    queryKey: ["fund-investor-progress", fundId],
    queryFn: () => load({ data: { offeringId: fundId } }),
  });
  const items: any[] = (data as any)?.items ?? [];
  const resendFn = useServerFn(resendOnboardInvitationFn);
  const resend = useMutation({
    mutationFn: (invitationId: string) => resendFn({ data: { invitationId } }),
    onSuccess: (r: any) => (r?.sent ? toast.success("Invitation resent.") : toast.error("The email could not be sent.")),
    onError: (e: any) => toast.error(String(e?.message ?? e).replace(/^Forbidden:\s*/, "")),
  });
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Investor progress</CardTitle>
        <CardDescription>Where each invited investor is. Verification detail stays with Harmonious.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-2">
        {isLoading ? <p className="text-sm text-muted-foreground">Loading…</p> : null}
        {!isLoading && items.length === 0 ? <p className="text-sm text-muted-foreground">No investors invited yet.</p> : null}
        {items.map((i) => (
          <div key={i.id} className="flex flex-wrap items-center justify-between gap-2 rounded-md border p-3 text-sm">
            <div>
              <p className="font-medium">{i.investorName}</p>
              <p className="text-xs text-muted-foreground">
                {i.profileLabel ? `${i.profileLabel} · ` : ""}{money(i.acceptedAmountCents ?? i.requestedAmountCents)}
              </p>
            </div>
            <div className="flex items-center gap-2">
              <Badge variant={i.status === "Funded" ? "default" : "outline"}>
                {["Funded", "Funding pending", "Funding required", "Admitted", "Closed", "Declined"].includes(i.status)
                  ? i.status
                  : managerPortalStatus({
                      invitedOnly: String(i.id).startsWith("invite:"),
                      requirements: i.progress ?? [],
                      stage: i.stage,
                      acceptedAt: i.acceptedAt,
                    })}
              </Badge>
              {String(i.id).startsWith("invite:") ? (
                <Button size="sm" variant="outline" disabled={resend.isPending} onClick={() => resend.mutate(String(i.id).slice(7))}>
                  Resend Invitation
                </Button>
              ) : null}
            </div>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
