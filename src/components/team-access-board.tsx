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
  cancelStaffInvitation,
  inviteStaff,
  listStaffAccounts,
  setStaffRole,
  STAFF_ROLES,
} from "@/lib/staff-access.functions";

const CONTRACT_AUTHORITY = new Set([
  "admin",
  "super_admin",
  "legal",
  "client_success",
  "compliance",
  "finance",
  "executive",
]);

/**
 * Who at Harmonious can work the holds queue, the provider register and the
 * service request queue. Access is granted per person, per role.
 */
export function TeamAccessBoard() {
  const queryClient = useQueryClient();
  const load = useServerFn(listStaffAccounts);
  const setRole = useServerFn(setStaffRole);
  const invite = useServerFn(inviteStaff);
  const cancelInvite = useServerFn(cancelStaffInvitation);

  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [role, setRole_] = useState<string>("operations");

  const { data, isLoading, error } = useQuery({
    queryKey: ["staff-accounts"],
    queryFn: () => load(),
    retry: false,
  });

  const refresh = () => queryClient.invalidateQueries({ queryKey: ["staff-accounts"] });

  const roleMutation = useMutation({
    mutationFn: (input: { userId: string; role: string; grant: boolean }) =>
      setRole({ data: input as any }),
    onSuccess: () => {
      toast.success("Access updated.");
      refresh();
    },
    onError: (e: any) => toast.error(e?.message ?? "That access couldn't be changed."),
  });

  const inviteMutation = useMutation({
    mutationFn: () => invite({ data: { email, role: role as any, name } }),
    onSuccess: () => {
      toast.success("Invitation recorded. Access applies the first time they sign in.");
      setEmail("");
      setName("");
      refresh();
    },
    onError: (e: any) => toast.error(e?.message ?? "That invitation couldn't be created."),
  });

  const cancelMutation = useMutation({
    mutationFn: (id: string) => cancelInvite({ data: { id } }),
    onSuccess: () => {
      toast.success("Invitation withdrawn.");
      refresh();
    },
    onError: (e: any) => toast.error(e?.message ?? "That invitation couldn't be withdrawn."),
  });

  if (error) {
    return (
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Harmonious team access</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            Only an administrator can manage team access.
          </p>
        </CardContent>
      </Card>
    );
  }

  const staff = ((data as any)?.staff ?? []) as any[];
  const invitations = (((data as any)?.invitations ?? []) as any[]).filter(
    (i) => i.status === "pending",
  );
  const me = (data as any)?.me as string | undefined;

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Harmonious team access</CardTitle>
          <CardDescription>
            Holds, providers, service requests, invoices and payments are worked by named people.
            Give each person only the roles their work requires; every change is written to the
            audit trail.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {isLoading ? <p className="text-sm text-muted-foreground">Loading the team…</p> : null}
          {!isLoading && staff.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No Harmonious accounts yet. Invite someone below.
            </p>
          ) : null}
          {staff.map((person) => {
            const roles: string[] = person.roles ?? [];
            const authority = roles.some((r) => CONTRACT_AUTHORITY.has(r));
            return (
              <div key={person.user_id} className="rounded-md border p-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-medium">{person.legal_name || person.email}</span>
                      {person.user_id === me ? <Badge variant="secondary">You</Badge> : null}
                      {authority ? (
                        <Badge variant="outline">Contract authority</Badge>
                      ) : (
                        <Badge variant="secondary">View only</Badge>
                      )}
                    </div>
                    <p className="text-sm text-muted-foreground">
                      {person.email}
                      {person.last_sign_in_at
                        ? ` · last signed in ${String(person.last_sign_in_at).slice(0, 10)}`
                        : " · has not signed in yet"}
                    </p>
                  </div>
                </div>
                <div className="mt-3 flex flex-wrap gap-2">
                  {STAFF_ROLES.map((r) => {
                    const has = roles.includes(r.value);
                    return (
                      <Button
                        key={r.value}
                        size="sm"
                        variant={has ? "default" : "outline"}
                        title={r.note}
                        disabled={roleMutation.isPending}
                        onClick={() =>
                          roleMutation.mutate({
                            userId: person.user_id,
                            role: r.value,
                            grant: !has,
                          })
                        }
                      >
                        {r.label}
                      </Button>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Invite a colleague</CardTitle>
          <CardDescription>
            The role is applied the first time they sign in and confirm their email address.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid gap-3 sm:grid-cols-3">
            <div className="space-y-1">
              <Label htmlFor="staff-email">Work email</Label>
              <Input
                id="staff-email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="name@harmonious.co"
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="staff-name">Name</Label>
              <Input id="staff-name" value={name} onChange={(e) => setName(e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label>Role</Label>
              <Select value={role} onValueChange={setRole_}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {STAFF_ROLES.map((r) => (
                    <SelectItem key={r.value} value={r.value}>
                      {r.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <Button
            size="sm"
            disabled={!email.includes("@") || inviteMutation.isPending}
            onClick={() => inviteMutation.mutate()}
          >
            Send invitation
          </Button>

          {invitations.length > 0 ? (
            <div className="space-y-2 pt-2">
              <p className="text-sm font-medium">Waiting to be accepted</p>
              {invitations.map((inv) => (
                <div
                  key={inv.id}
                  className="flex flex-wrap items-center justify-between gap-2 rounded-md border p-2"
                >
                  <span className="text-sm">
                    {inv.email} · {inv.role} · expires {String(inv.expires_at).slice(0, 10)}
                  </span>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => cancelMutation.mutate(inv.id)}
                  >
                    Withdraw
                  </Button>
                </div>
              ))}
            </div>
          ) : null}
        </CardContent>
      </Card>
    </div>
  );
}
