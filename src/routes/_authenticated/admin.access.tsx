import { useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { listAccessDirectory, assignFundAccess, revokeFundAccess } from "@/lib/access.functions";
import { FundInvitations } from "@/components/fund-invitations";


export const Route = createFileRoute("/_authenticated/admin/access")({
  head: () => ({
    meta: [
      { title: "Fund Access Control | Harmonious Admin" },
      {
        name: "description",
        content:
          "Assign fund managers and investors to Harmonious funds and control who can review each offering.",
      },
      { property: "og:title", content: "Fund Access Control | Harmonious Admin" },
      {
        property: "og:description",
        content: "Assign fund managers and investors to Harmonious funds.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: AccessPage,
});

type Kind = "manager" | "investor";

function AccessPage() {
  const load = useServerFn(listAccessDirectory);
  const assign = useServerFn(assignFundAccess);
  const revoke = useServerFn(revokeFundAccess);
  const queryClient = useQueryClient();

  const { data, isLoading, error } = useQuery({
    queryKey: ["access-directory"],
    queryFn: () => load(),
    retry: false,
  });

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ["access-directory"] });

  const assignMutation = useMutation({
    mutationFn: (input: { userId: string; offeringId: string; kind: Kind }) =>
      assign({ data: input }),
    onSuccess: () => {
      toast.success("Access granted.");
      void invalidate();
    },
    onError: (e: unknown) => toast.error(e instanceof Error ? e.message : "Could not grant access."),
  });

  const revokeMutation = useMutation({
    mutationFn: (input: { id: string; kind: Kind }) => revoke({ data: input }),
    onSuccess: () => {
      toast.success("Access removed.");
      void invalidate();
    },
    onError: (e: unknown) => toast.error(e instanceof Error ? e.message : "Could not remove access."),
  });

  if (isLoading) {
    return <main className="mx-auto max-w-5xl px-4 py-10 text-sm text-muted-foreground">Loading…</main>;
  }

  if (error || !data) {
    return (
      <main className="mx-auto max-w-2xl px-4 py-16">
        <h1 className="text-3xl">Restricted</h1>
        <p className="mt-3 text-sm text-muted-foreground">
          Only Harmonious administrators can manage fund access.
        </p>
        <Button asChild variant="outline" className="mt-6">
          <Link to="/dashboard">Back to your application</Link>
        </Button>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-5xl px-4 py-10">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-3xl">Fund access</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Decide who manages each fund and which investors can see private offerings.
          </p>
        </div>
        <div className="flex gap-2">
          <Button asChild size="sm">
            <Link to="/admin/setup">Set up a fund</Link>
          </Button>
          <Button asChild size="sm" variant="outline">
            <Link to="/admin/security">Login activity</Link>
          </Button>

          <Button asChild size="sm" variant="outline">
            <Link to="/admin">Review queue</Link>
          </Button>
        </div>
      </div>

      <Card className="mt-8">
        <CardHeader>
          <CardTitle>Funds</CardTitle>
          <p className="text-sm text-muted-foreground">
            Open a fund to see its description, offering documents and wire details.
          </p>
        </CardHeader>
        <CardContent className="grid gap-3 sm:grid-cols-2">
          {(data.offerings as any[]).map((o: any) => (
            <Link
              key={o.id}
              to="/admin/fund/$fundId"
              params={{ fundId: o.id }}
              className="rounded-md border p-4 transition-colors hover:bg-muted/50"
            >
              <p className="font-medium">{o.name}</p>
              <p className="mt-1 text-xs text-muted-foreground">
                Reg D {o.reg_type === "506c" ? "506(c)" : "506(b)"} · view fund page
              </p>
            </Link>
          ))}
          {(data.offerings as any[]).length === 0 && (
            <p className="text-sm text-muted-foreground">No funds set up yet.</p>
          )}
        </CardContent>
      </Card>

      <div className="mt-8">
        <FundInvitations title="Invite investors and fund managers" />
      </div>

      <Tabs defaultValue="manager" className="mt-8">


        <TabsList>
          <TabsTrigger value="manager">Fund managers</TabsTrigger>
          <TabsTrigger value="investor">Investors</TabsTrigger>
        </TabsList>

        <TabsContent value="manager" className="mt-6">
          <AssignmentPanel
            kind="manager"
            title="Fund managers"
            hint="A fund manager can review every investor in the funds you assign, but cannot manage access or see login activity."
            rows={data.managers}
            users={data.users}
            offerings={data.offerings as any[]}
            onAssign={(userId, offeringId) =>
              assignMutation.mutate({ userId, offeringId, kind: "manager" })
            }
            onRevoke={(id) => revokeMutation.mutate({ id, kind: "manager" })}
            busy={assignMutation.isPending || revokeMutation.isPending}
          />
        </TabsContent>

        <TabsContent value="investor" className="mt-6">
          <AssignmentPanel
            kind="investor"
            title="Investor fund access"
            hint="Reg D 506(c) funds are visible to everyone. Grant access here so an investor can see a private 506(b) fund."
            rows={data.investors}
            users={data.users}
            offerings={data.offerings as any[]}
            onAssign={(userId, offeringId) =>
              assignMutation.mutate({ userId, offeringId, kind: "investor" })
            }
            onRevoke={(id) => revokeMutation.mutate({ id, kind: "investor" })}
            busy={assignMutation.isPending || revokeMutation.isPending}
          />
        </TabsContent>
      </Tabs>
    </main>
  );
}

type Row = {
  id: string;
  userId: string;
  offeringId: string;
  createdAt: string;
  email: string;
  legalName: string | null;
};

function AssignmentPanel({
  title,
  hint,
  rows,
  users,
  offerings,
  onAssign,
  onRevoke,
  busy,
}: {
  kind: Kind;
  title: string;
  hint: string;
  rows: Row[];
  users: { userId: string; email: string; legalName: string | null }[];
  offerings: { id: string; name: string; reg_type: string }[];
  onAssign: (userId: string, offeringId: string) => void;
  onRevoke: (id: string) => void;
  busy: boolean;
}) {
  const [userId, setUserId] = useState("");
  const [offeringId, setOfferingId] = useState("");
  const offeringName = (id: string) => offerings.find((o) => o.id === id)?.name ?? "Unknown fund";

  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        <p className="text-sm text-muted-foreground">{hint}</p>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="flex flex-wrap items-end gap-3">
          <div className="min-w-[240px] flex-1">
            <label className="text-xs font-medium text-muted-foreground">Person</label>
            <Select value={userId} onValueChange={setUserId}>
              <SelectTrigger className="mt-1">
                <SelectValue placeholder="Choose a person" />
              </SelectTrigger>
              <SelectContent>
                {users.map((u) => (
                  <SelectItem key={u.userId} value={u.userId}>
                    {u.legalName ? `${u.legalName} — ${u.email}` : u.email}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="min-w-[220px] flex-1">
            <label className="text-xs font-medium text-muted-foreground">Fund</label>
            <Select value={offeringId} onValueChange={setOfferingId}>
              <SelectTrigger className="mt-1">
                <SelectValue placeholder="Choose a fund" />
              </SelectTrigger>
              <SelectContent>
                {offerings.map((o) => (
                  <SelectItem key={o.id} value={o.id}>
                    {o.name} ({o.reg_type === "506c" ? "506(c)" : "506(b)"})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <Button
            disabled={!userId || !offeringId || busy}
            onClick={() => {
              onAssign(userId, offeringId);
              setUserId("");
              setOfferingId("");
            }}
          >
            Grant access
          </Button>
        </div>

        <div className="space-y-2">
          {rows.length === 0 && (
            <p className="text-sm text-muted-foreground">No assignments yet.</p>
          )}
          {rows.map((row) => (
            <div
              key={row.id}
              className="flex flex-wrap items-center justify-between gap-3 rounded-md border p-3"
            >
              <div>
                <p className="text-sm font-medium">{row.legalName ?? row.email}</p>
                <p className="text-xs text-muted-foreground">
                  {row.legalName ? `${row.email} · ` : ""}Granted{" "}
                  {new Date(row.createdAt).toLocaleDateString()}
                </p>
              </div>
              <div className="flex items-center gap-3">
                <Badge variant="secondary">{offeringName(row.offeringId)}</Badge>
                <Button size="sm" variant="ghost" disabled={busy} onClick={() => onRevoke(row.id)}>
                  Remove
                </Button>
              </div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
