import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
  inviteToFund,
  listFundInvitations,
  removeFundAccess,
  resendInvitation,
  revokeInvitation,
} from "@/lib/invitations.functions";

type Role = "investor" | "fund_manager";

export function FundInvitations({ title = "Invitations" }: { title?: string }) {
  const load = useServerFn(listFundInvitations);
  const invite = useServerFn(inviteToFund);
  const resend = useServerFn(resendInvitation);
  const revoke = useServerFn(revokeInvitation);
  const remove = useServerFn(removeFundAccess);
  const queryClient = useQueryClient();

  const { data, isLoading, error } = useQuery({
    queryKey: ["fund-invitations"],
    queryFn: () => load(),
    retry: false,
  });

  const [offeringId, setOfferingId] = useState("");
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [role, setRole] = useState<Role>("investor");

  const funds = (data?.funds ?? []) as any[];
  const selectedFund = useMemo(
    () => funds.find((f) => f.id === offeringId) ?? funds[0],
    [funds, offeringId],
  );
  const activeFundId = selectedFund?.id ?? "";

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ["fund-invitations"] });

  const inviteMutation = useMutation({
    mutationFn: () =>
      invite({
        data: { offeringId: activeFundId, email, name, role, sendEmail: true },
      }),
    onSuccess: (result: any) => {
      toast.success(
        result.accountCreated
          ? `Account created and invitation sent to ${result.email}.`
          : `Invitation sent to ${result.email}.`,
      );
      setEmail("");
      setName("");
      void invalidate();
    },
    onError: (e: unknown) =>
      toast.error(e instanceof Error ? e.message : "Could not send that invitation."),
  });

  const resendMutation = useMutation({
    mutationFn: (id: string) => resend({ data: { id } }),
    onSuccess: () => {
      toast.success("Invitation email sent again.");
      void invalidate();
    },
    onError: (e: unknown) => toast.error(e instanceof Error ? e.message : "Could not resend."),
  });

  const revokeMutation = useMutation({
    mutationFn: (id: string) => revoke({ data: { id } }),
    onSuccess: () => {
      toast.success("Invitation cancelled and access removed.");
      void invalidate();
    },
    onError: (e: unknown) => toast.error(e instanceof Error ? e.message : "Could not cancel."),
  });

  const removeMutation = useMutation({
    mutationFn: (input: { userId: string; offeringId: string; role: Role }) =>
      remove({ data: input }),
    onSuccess: () => {
      toast.success("Access removed.");
      void invalidate();
    },
    onError: (e: unknown) => toast.error(e instanceof Error ? e.message : "Could not remove access."),
  });

  if (isLoading) {
    return <p className="text-sm text-muted-foreground">Loading invitations…</p>;
  }
  if (error || !data) {
    return (
      <p className="text-sm text-muted-foreground">
        You do not have permission to invite people to funds.
      </p>
    );
  }
  if (funds.length === 0) {
    return <p className="text-sm text-muted-foreground">No funds are assigned to you yet.</p>;
  }

  const invitations = ((data.invitations ?? []) as any[]).filter(
    (i) => i.offering_id === activeFundId,
  );
  const managers = ((data.managers ?? []) as any[]).filter((m) => m.offeringId === activeFundId);
  const investors = ((data.investors ?? []) as any[]).filter((i) => i.offeringId === activeFundId);

  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        <p className="text-sm text-muted-foreground">
          People can only reach a fund after you invite them. Inviting creates their account if they
          do not have one, grants access straight away and emails them a link to sign in.
        </p>
      </CardHeader>
      <CardContent className="space-y-8">
        <div className="grid gap-4 md:grid-cols-2">
          <div className="space-y-2">
            <Label>Fund</Label>
            <Select value={activeFundId} onValueChange={setOfferingId}>
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
          <div className="space-y-2">
            <Label>They join as</Label>
            <Select value={role} onValueChange={(v) => setRole(v as Role)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="investor">Investor</SelectItem>
                <SelectItem value="fund_manager">Fund manager</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="invite-email">Email address</Label>
            <Input
              id="invite-email"
              type="email"
              value={email}
              placeholder="name@example.com"
              onChange={(e) => setEmail(e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="invite-name">Full name (optional)</Label>
            <Input
              id="invite-name"
              value={name}
              placeholder="Alyssa Pettit"
              onChange={(e) => setName(e.target.value)}
            />
          </div>
        </div>
        <Button
          onClick={() => inviteMutation.mutate()}
          disabled={inviteMutation.isPending || !email.trim() || !activeFundId}
        >
          {inviteMutation.isPending ? "Sending…" : "Send invitation"}
        </Button>

        <section className="space-y-3">
          <h3 className="text-sm font-semibold">People with access</h3>
          <div className="space-y-2">
            {managers.map((m) => (
              <Row
                key={m.id}
                title={m.legalName || m.email}
                subtitle={m.email}
                badge="Fund manager"
                onRemove={() =>
                  removeMutation.mutate({
                    userId: m.userId,
                    offeringId: activeFundId,
                    role: "fund_manager",
                  })
                }
              />
            ))}
            {investors.map((i) => (
              <Row
                key={i.id}
                title={i.legalName || i.email}
                subtitle={i.email}
                badge="Investor"
                onRemove={() =>
                  removeMutation.mutate({
                    userId: i.userId,
                    offeringId: activeFundId,
                    role: "investor",
                  })
                }
              />
            ))}
            {managers.length === 0 && investors.length === 0 && (
              <p className="text-sm text-muted-foreground">Nobody has access to this fund yet.</p>
            )}
          </div>
        </section>

        <section className="space-y-3">
          <h3 className="text-sm font-semibold">Invitation history</h3>
          <div className="space-y-2">
            {invitations.map((inv) => (
              <div
                key={inv.id}
                className="flex flex-wrap items-center justify-between gap-3 rounded-md border p-3"
              >
                <div>
                  <p className="text-sm font-medium">{inv.invited_name || inv.email}</p>
                  <p className="text-xs text-muted-foreground">
                    {inv.email} · {inv.role === "fund_manager" ? "Fund manager" : "Investor"} ·{" "}
                    {new Date(inv.created_at).toLocaleDateString()}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <Badge variant={inv.status === "revoked" ? "outline" : "secondary"}>
                    {inv.status}
                  </Badge>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => resendMutation.mutate(inv.id)}
                    disabled={resendMutation.isPending || inv.status === "revoked"}
                  >
                    Resend
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => revokeMutation.mutate(inv.id)}
                    disabled={revokeMutation.isPending || inv.status === "revoked"}
                  >
                    Cancel
                  </Button>
                </div>
              </div>
            ))}
            {invitations.length === 0 && (
              <p className="text-sm text-muted-foreground">No invitations sent for this fund yet.</p>
            )}
          </div>
        </section>
      </CardContent>
    </Card>
  );
}

function Row({
  title,
  subtitle,
  badge,
  onRemove,
}: {
  title: string;
  subtitle: string;
  badge: string;
  onRemove: () => void;
}) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-md border p-3">
      <div>
        <p className="text-sm font-medium">{title}</p>
        <p className="text-xs text-muted-foreground">{subtitle}</p>
      </div>
      <div className="flex items-center gap-2">
        <Badge variant="secondary">{badge}</Badge>
        <Button size="sm" variant="ghost" onClick={onRemove}>
          Remove
        </Button>
      </div>
    </div>
  );
}
