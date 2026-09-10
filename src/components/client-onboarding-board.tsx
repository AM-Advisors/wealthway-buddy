import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Check, CircleDashed } from "lucide-react";
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
import { Textarea } from "@/components/ui/textarea";
import {
  CLIENT_CONTACT_ROLES,
  cancelClientInvitation,
  getClientOnboarding,
  inviteClientContact,
  markOnboardingStep,
  setContactAccess,
} from "@/lib/client-onboarding.functions";

const when = (v: string | null | undefined) =>
  v ? new Date(v).toLocaleString("en-US", { dateStyle: "medium", timeStyle: "short" }) : "—";
const roleLabel = (v: string) => CLIENT_CONTACT_ROLES.find((r) => r.value === v)?.label ?? v;

const emptyInvite = { email: "", name: "", role: "client_readonly", canApprove: false, note: "" };

/** Staff view: invite a new client's people, walk them through what they have
 *  to accept, and keep track of how far each engagement has got. */
export function ClientOnboardingBoard() {
  const queryClient = useQueryClient();
  const load = useServerFn(getClientOnboarding);
  const invite = useServerFn(inviteClientContact);
  const cancelInvite = useServerFn(cancelClientInvitation);
  const changeAccess = useServerFn(setContactAccess);
  const markStep = useServerFn(markOnboardingStep);

  const [clientId, setClientId] = useState<string | null>(null);
  const [draft, setDraft] = useState({ ...emptyInvite });

  const query = useQuery({
    queryKey: ["client-onboarding", clientId],
    queryFn: () => load({ data: { clientId } }),
  });

  const refresh = () => queryClient.invalidateQueries({ queryKey: ["client-onboarding"] });
  const fail = (error: unknown) => toast.error(error instanceof Error ? error.message : "That didn't work.");

  const inviteMutation = useMutation({
    mutationFn: (input: Parameters<typeof invite>[0]["data"]) => invite({ data: input }),
    onSuccess: () => {
      toast.success("Invitation sent. They join this client the first time they sign in.");
      setDraft({ ...emptyInvite });
      refresh();
    },
    onError: fail,
  });

  const cancelMutation = useMutation({
    mutationFn: (id: string) => cancelInvite({ data: { id } }),
    onSuccess: () => {
      toast.success("Invitation withdrawn.");
      refresh();
    },
    onError: fail,
  });

  const accessMutation = useMutation({
    mutationFn: (input: Parameters<typeof changeAccess>[0]["data"]) => changeAccess({ data: input }),
    onSuccess: () => {
      toast.success("Access updated.");
      refresh();
    },
    onError: fail,
  });

  const stepMutation = useMutation({
    mutationFn: (input: Parameters<typeof markStep>[0]["data"]) => markStep({ data: input }),
    onSuccess: () => refresh(),
    onError: fail,
  });

  if (query.isLoading) return <p className="text-sm text-muted-foreground">Loading clients…</p>;
  if (query.isError)
    return <p className="text-sm text-destructive">This area is for the Harmonious team.</p>;

  const data = query.data!;
  const selected = data.selected;
  const canManage = data.canManage;

  return (
    <div className="grid gap-6 lg:grid-cols-[280px_1fr]">
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Clients</CardTitle>
          <CardDescription>Pick a client to work through their onboarding.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-1">
          {data.clients.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No clients yet. Add one under Clients and scope first.
            </p>
          ) : (
            data.clients.map((c: any) => (
              <button
                key={c.id}
                type="button"
                onClick={() => setClientId(c.id)}
                className={`w-full rounded-md border px-3 py-2 text-left text-sm transition ${
                  c.id === data.selectedId ? "border-primary bg-muted" : "border-transparent hover:bg-muted/60"
                }`}
              >
                <span className="block font-medium">{c.name}</span>
                <span className="text-xs text-muted-foreground">
                  {c.complete} of {c.total} steps done
                </span>
              </button>
            ))
          )}
        </CardContent>
      </Card>

      {!selected ? (
        <Card>
          <CardContent className="py-10 text-sm text-muted-foreground">
            Select a client on the left.
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">{selected.name}</CardTitle>
              <CardDescription>
                {selected.complete} of {selected.total} onboarding steps complete. Harmonious
                administers, records and reports for this client under their agreement; it does not
                advise them or act on their behalf.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-2">
              {selected.automatic.map((step: any) => (
                <div key={step.key} className="flex items-center gap-2 text-sm">
                  {step.done ? (
                    <Check className="h-4 w-4 text-primary" aria-hidden />
                  ) : (
                    <CircleDashed className="h-4 w-4 text-muted-foreground" aria-hidden />
                  )}
                  <span className={step.done ? "" : "text-muted-foreground"}>{step.label}</span>
                </div>
              ))}
              {selected.manual.map((step: any) => (
                <div key={step.key} className="flex items-start justify-between gap-3 rounded-md border p-3">
                  <div>
                    <p className="flex items-center gap-2 text-sm">
                      {step.done ? (
                        <Check className="h-4 w-4 text-primary" aria-hidden />
                      ) : (
                        <CircleDashed className="h-4 w-4 text-muted-foreground" aria-hidden />
                      )}
                      {step.label}
                    </p>
                    <p className="mt-1 text-xs text-muted-foreground">{step.note}</p>
                    {step.at ? (
                      <p className="mt-1 text-xs text-muted-foreground">Marked {when(step.at)}</p>
                    ) : null}
                  </div>
                  <Button
                    size="sm"
                    variant={step.done ? "outline" : "default"}
                    disabled={stepMutation.isPending}
                    onClick={() =>
                      stepMutation.mutate({ clientId: selected.id, step: step.key, done: !step.done })
                    }
                  >
                    {step.done ? "Reopen" : "Mark done"}
                  </Button>
                </div>
              ))}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Their people</CardTitle>
              <CardDescription>
                Everyone invited accepts the privacy notice, platform terms, fee schedule and
                electronic-records consent the first time they sign in.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {data.people.length === 0 ? (
                <p className="text-sm text-muted-foreground">Nobody has signed in for this client yet.</p>
              ) : (
                data.people.map((person: any) => (
                  <div key={person.id} className="rounded-md border p-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div>
                        <p className="text-sm font-medium">{person.name ?? person.email ?? "Client contact"}</p>
                        <p className="text-xs text-muted-foreground">
                          {person.email ?? "Email not visible"} · {roleLabel(person.client_role)}
                          {person.can_approve ? " · can approve" : ""}
                        </p>
                      </div>
                      {canManage ? (
                        <div className="flex items-center gap-2">
                          <Select
                            value={person.client_role}
                            onValueChange={(role) => accessMutation.mutate({ id: person.id, role, remove: false })}
                          >
                            <SelectTrigger className="h-8 w-52">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              {CLIENT_CONTACT_ROLES.map((r) => (
                                <SelectItem key={r.value} value={r.value}>
                                  {r.label}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() =>
                              accessMutation.mutate({
                                id: person.id,
                                canApprove: !person.can_approve,
                                remove: false,
                              })
                            }
                          >
                            {person.can_approve ? "Remove approval" : "Allow approvals"}
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => accessMutation.mutate({ id: person.id, remove: true })}
                          >
                            Remove
                          </Button>
                        </div>
                      ) : null}
                    </div>
                    <div className="mt-2 flex flex-wrap gap-2">
                      {person.accepted.map((a: any) => (
                        <Badge key={a.kind} variant={a.at ? "secondary" : "outline"}>
                          {a.title} v{a.version}: {a.at ? "signed" : "waiting"}
                        </Badge>
                      ))}
                    </div>
                  </div>
                ))
              )}

              <div>
                <h3 className="text-sm font-medium">Invitations waiting</h3>
                {selected.invitations.filter((i: any) => i.status === "pending").length === 0 ? (
                  <p className="mt-1 text-sm text-muted-foreground">None outstanding.</p>
                ) : (
                  <ul className="mt-2 space-y-2">
                    {selected.invitations
                      .filter((i: any) => i.status === "pending")
                      .map((i: any) => (
                        <li key={i.id} className="flex items-center justify-between gap-3 rounded-md border p-2 text-sm">
                          <span>
                            {i.invited_name ? `${i.invited_name} · ` : ""}
                            {i.email} · {roleLabel(i.client_role)}
                            <span className="block text-xs text-muted-foreground">
                              Invited {when(i.created_at)} · expires {when(i.expires_at)}
                            </span>
                          </span>
                          {canManage ? (
                            <Button size="sm" variant="ghost" onClick={() => cancelMutation.mutate(i.id)}>
                              Withdraw
                            </Button>
                          ) : null}
                        </li>
                      ))}
                  </ul>
                )}
              </div>
            </CardContent>
          </Card>

          {canManage ? (
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Invite someone from this client</CardTitle>
                <CardDescription>
                  They join this client automatically the first time they sign in with this email.
                </CardDescription>
              </CardHeader>
              <CardContent className="grid gap-3 md:grid-cols-2">
                <div>
                  <Label htmlFor="invite-email">Email</Label>
                  <Input
                    id="invite-email"
                    value={draft.email}
                    onChange={(e) => setDraft({ ...draft, email: e.target.value })}
                    placeholder="name@client.com"
                  />
                </div>
                <div>
                  <Label htmlFor="invite-name">Name</Label>
                  <Input
                    id="invite-name"
                    value={draft.name}
                    onChange={(e) => setDraft({ ...draft, name: e.target.value })}
                  />
                </div>
                <div>
                  <Label>What they can see</Label>
                  <Select value={draft.role} onValueChange={(role) => setDraft({ ...draft, role })}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {CLIENT_CONTACT_ROLES.map((r) => (
                        <SelectItem key={r.value} value={r.value}>
                          {r.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {CLIENT_CONTACT_ROLES.find((r) => r.value === draft.role)?.note}
                  </p>
                </div>
                <div className="flex items-end">
                  <Button
                    type="button"
                    variant={draft.canApprove ? "default" : "outline"}
                    onClick={() => setDraft({ ...draft, canApprove: !draft.canApprove })}
                  >
                    {draft.canApprove ? "Can approve payments" : "Cannot approve payments"}
                  </Button>
                </div>
                <div className="md:col-span-2">
                  <Label htmlFor="invite-note">Note (internal)</Label>
                  <Textarea
                    id="invite-note"
                    value={draft.note}
                    onChange={(e) => setDraft({ ...draft, note: e.target.value })}
                  />
                </div>
                <div className="md:col-span-2">
                  <Button
                    disabled={!draft.email.trim() || inviteMutation.isPending}
                    onClick={() =>
                      inviteMutation.mutate({
                        clientId: selected.id,
                        email: draft.email.trim(),
                        name: draft.name.trim(),
                        role: draft.role,
                        canApprove: draft.canApprove,
                        note: draft.note.trim(),
                      })
                    }
                  >
                    Send invitation
                  </Button>
                </div>
              </CardContent>
            </Card>
          ) : null}

          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Anything outside their scope</CardTitle>
              <CardDescription>
                Show the client that where a service isn't in their statement of work they'll see:
                “This service is not currently included in your active scope. Request service.” The
                request is reviewed, quoted and signed before any work starts.
              </CardDescription>
            </CardHeader>
            <CardContent className="text-sm text-muted-foreground">
              {selected.inScopeCount} services in scope · {selected.rateCount} contracted rates ·{" "}
              {selected.openRequests} open service request{selected.openRequests === 1 ? "" : "s"} of{" "}
              {selected.requestCount} in total.
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Onboarding record</CardTitle>
              <CardDescription>Who did what, and when.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-1 text-sm">
              {data.activity.length === 0 ? (
                <p className="text-muted-foreground">Nothing recorded yet.</p>
              ) : (
                data.activity.map((row: any, index: number) => (
                  <p key={index} className="text-muted-foreground">
                    {when(row.created_at)} — {row.action}
                    {row.target ? ` · ${row.target}` : ""}
                  </p>
                ))
              )}
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
