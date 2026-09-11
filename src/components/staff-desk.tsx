import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";

import {
  assignClientStaff,
  getMyDesk,
  listClientCoverage,
  unassignClientStaff,
} from "@/lib/staff-portal.functions";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

function money(cents?: number | null) {
  if (cents == null) return null;
  return (cents / 100).toLocaleString("en-US", { style: "currency", currency: "USD" });
}

function serviceLabel(key: string) {
  return key.replace(/_/g, " ").replace(/^./, (c) => c.toUpperCase());
}

function days(since?: string | null) {
  if (!since) return null;
  const d = Math.floor((Date.now() - new Date(since).getTime()) / 86_400_000);
  return d <= 0 ? "today" : d === 1 ? "1 day" : `${d} days`;
}

/** What one Harmonious person owns: their clients and everything waiting on them. */
export function StaffDesk() {
  const [showAll, setShowAll] = useState(false);
  const desk = useServerFn(getMyDesk);
  const { data, isLoading, error } = useQuery({
    queryKey: ["staff-desk", showAll],
    queryFn: () => desk({ data: { showAll } }),
  });

  if (isLoading) return <p className="text-sm text-muted-foreground">Loading your desk…</p>;
  if (error) {
    return (
      <p className="text-sm text-destructive">
        {(error as Error).message || "That didn't load."}
      </p>
    );
  }
  if (!data) return null;

  const signOffs = (data as any).signOffs ?? [];
  const invoices = (data as any).invoices ?? [];
  const declaredPayments = (data as any).declaredPayments ?? [];
  const waiting =
    data.requests.length +
    data.quotes.length +
    data.holds.length +
    signOffs.length +
    invoices.length;

  return (
    <div className="space-y-6">
      <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-6">
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Your clients</CardDescription>
            <CardTitle className="text-2xl">{data.clients.length}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Requests to review</CardDescription>
            <CardTitle className="text-2xl">{data.requests.length}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Quotes in play</CardDescription>
            <CardTitle className="text-2xl">{data.quotes.length}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Open holds</CardDescription>
            <CardTitle className="text-2xl">{data.holds.length}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Sign-offs pending</CardDescription>
            <CardTitle className="text-2xl">{signOffs.length}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Unpaid invoices</CardDescription>
            <CardTitle className="text-2xl">{invoices.length}</CardTitle>
          </CardHeader>
        </Card>
      </div>

      {data.isAdmin ? (
        <div className="flex flex-wrap items-center gap-3">
          <Button variant="outline" size="sm" onClick={() => setShowAll((v) => !v)}>
            {showAll ? "Show only my clients" : "Show every client"}
          </Button>
          {data.unassignedCount > 0 ? (
            <span className="text-sm text-muted-foreground">
              {data.unassignedCount} client{data.unassignedCount === 1 ? " has" : "s have"} nobody
              assigned yet.
            </span>
          ) : null}
        </div>
      ) : null}

      {data.clients.length === 0 ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">No clients assigned to you yet</CardTitle>
            <CardDescription>
              Ask an administrator to add you to the clients you look after. Until then this desk
              stays empty — you only ever see the clients you cover.
            </CardDescription>
          </CardHeader>
        </Card>
      ) : (
        <Tabs defaultValue="clients">
          <TabsList className="flex flex-wrap">
            <TabsTrigger value="clients">Clients</TabsTrigger>
            <TabsTrigger value="requests">Requests ({data.requests.length})</TabsTrigger>
            <TabsTrigger value="quotes">Quotes ({data.quotes.length})</TabsTrigger>
            <TabsTrigger value="holds">Holds ({data.holds.length})</TabsTrigger>
            <TabsTrigger value="signoffs">Sign-offs ({signOffs.length})</TabsTrigger>
            <TabsTrigger value="payments">Payments ({invoices.length})</TabsTrigger>
          </TabsList>

          <TabsContent value="clients" className="mt-4 space-y-3">
            {data.clients.map((c: any) => (
              <Card key={c.id}>
                <CardHeader className="pb-2">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <CardTitle className="text-base">{c.name}</CardTitle>
                    <div className="flex flex-wrap items-center gap-2">
                      {c.assignmentRole ? (
                        <Badge variant={c.assignmentRole === "lead" ? "default" : "secondary"}>
                          {c.assignmentRole === "lead" ? "You lead" : "You support"}
                        </Badge>
                      ) : (
                        <Badge variant="outline">Not yours</Badge>
                      )}
                      <Badge variant="outline">{c.status}</Badge>
                    </div>
                  </div>
                  <CardDescription>
                    {c.activeSow ? c.activeSow.title : "No active statement of work"} ·{" "}
                    {c.fundCount} fund{c.fundCount === 1 ? "" : "s"}
                    {c.primary_contact_email ? ` · ${c.primary_contact_email}` : ""}
                  </CardDescription>
                </CardHeader>
                <CardContent className="flex flex-wrap items-center gap-4 text-sm">
                  <span>{c.openRequests} request{c.openRequests === 1 ? "" : "s"} to review</span>
                  <span>{c.openQuotes} quote{c.openQuotes === 1 ? "" : "s"} in play</span>
                  <span>{c.openHolds} open hold{c.openHolds === 1 ? "" : "s"}</span>
                  <Button asChild size="sm" variant="outline">
                    <Link to="/admin/contracts/$clientId" params={{ clientId: String(c.id) }}>
                      Open client
                    </Link>
                  </Button>
                </CardContent>
              </Card>
            ))}
          </TabsContent>

          <TabsContent value="requests" className="mt-4 space-y-3">
            {data.requests.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                Nothing waiting. New requests from your clients land here.
              </p>
            ) : (
              data.requests.map((r: any) => (
                <Card key={r.id}>
                  <CardHeader className="pb-2">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <CardTitle className="text-base">{serviceLabel(r.service_key)}</CardTitle>
                      <Badge variant={r.status === "requested" ? "default" : "secondary"}>
                        {r.status === "requested" ? "New" : "In review"}
                      </Badge>
                    </div>
                    <CardDescription>
                      {r.clientName}
                      {r.fundName ? ` · ${r.fundName}` : ""} · waiting {days(r.created_at)}
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-2 text-sm">
                    {r.requester_note ? <p>“{r.requester_note}”</p> : null}
                    <Button asChild size="sm" variant="outline">
                      <Link to="/admin/pricing">Review in Pricing and agreements</Link>
                    </Button>
                  </CardContent>
                </Card>
              ))
            )}
          </TabsContent>

          <TabsContent value="quotes" className="mt-4 space-y-3">
            {data.quotes.length === 0 ? (
              <p className="text-sm text-muted-foreground">No fee proposals outstanding.</p>
            ) : (
              data.quotes.map((r: any) => (
                <Card key={r.id}>
                  <CardHeader className="pb-2">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <CardTitle className="text-base">{serviceLabel(r.service_key)}</CardTitle>
                      <Badge variant="secondary">
                        {r.status === "quoted" ? "Waiting on the client" : "Signed — activate it"}
                      </Badge>
                    </div>
                    <CardDescription>
                      {r.clientName}
                      {r.fundName ? ` · ${r.fundName}` : ""} · sent {days(r.updated_at)} ago
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-2 text-sm">
                    <p>
                      {money(r.proposed_fee_cents) ?? "No fee set"}
                      {r.proposed_pricing_model
                        ? ` (${String(r.proposed_pricing_model).replace(/_/g, " ")})`
                        : ""}
                      {r.effective_date ? ` · starts ${r.effective_date}` : ""}
                    </p>
                    <Button asChild size="sm" variant="outline">
                      <Link to="/admin/pricing">Open in Pricing and agreements</Link>
                    </Button>
                  </CardContent>
                </Card>
              ))
            )}
          </TabsContent>

          <TabsContent value="holds" className="mt-4 space-y-3">
            {data.holds.length === 0 ? (
              <p className="text-sm text-muted-foreground">Nothing is on hold for your clients.</p>
            ) : (
              data.holds.map((h: any) => (
                <Card key={h.id}>
                  <CardHeader className="pb-2">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <CardTitle className="text-base">
                        {h.service_key ? serviceLabel(h.service_key) : serviceLabel(h.scope)}
                      </CardTitle>
                      <Badge variant="destructive">Open {days(h.placed_at)}</Badge>
                    </div>
                    <CardDescription>
                      {h.clientName}
                      {h.fundName ? ` · ${h.fundName}` : ""}
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-2 text-sm">
                    <p>{h.reason}</p>
                    <Button asChild size="sm" variant="outline">
                      <Link to="/admin/pricing">Clear it in Pricing and agreements</Link>
                    </Button>
                  </CardContent>
                </Card>
              ))
            )}
          </TabsContent>
        </Tabs>
      )}

      <p className="text-xs text-muted-foreground">
        {waiting === 0
          ? "Nothing is waiting on you right now."
          : `${waiting} item${waiting === 1 ? "" : "s"} waiting on you across your clients.`}
      </p>
    </div>
  );
}

/** Who covers which client. Only staff with contract authority can change it. */
export function ClientCoverageBoard() {
  const qc = useQueryClient();
  const coverage = useServerFn(listClientCoverage);
  const assign = useServerFn(assignClientStaff);
  const unassign = useServerFn(unassignClientStaff);
  const [filter, setFilter] = useState("");
  const [draft, setDraft] = useState<Record<string, { staffUserId: string; role: string }>>({});

  const { data, isLoading } = useQuery({
    queryKey: ["client-coverage"],
    queryFn: () => coverage(),
  });

  const assignMut = useMutation({
    mutationFn: (vars: any) => assign({ data: vars }),
    onSuccess: () => {
      toast.success("Coverage updated.");
      qc.invalidateQueries({ queryKey: ["client-coverage"] });
      qc.invalidateQueries({ queryKey: ["staff-desk"] });
    },
    onError: (e: any) => toast.error(e?.message ?? "That didn't save."),
  });
  const removeMut = useMutation({
    mutationFn: (id: string) => unassign({ data: { id } }),
    onSuccess: () => {
      toast.success("Removed from that client.");
      qc.invalidateQueries({ queryKey: ["client-coverage"] });
      qc.invalidateQueries({ queryKey: ["staff-desk"] });
    },
    onError: (e: any) => toast.error(e?.message ?? "That didn't save."),
  });

  const clients = useMemo(() => {
    const list = (data?.clients ?? []) as any[];
    const q = filter.trim().toLowerCase();
    return q ? list.filter((c) => String(c.name).toLowerCase().includes(q)) : list;
  }, [data, filter]);

  if (isLoading) return <p className="text-sm text-muted-foreground">Loading coverage…</p>;
  if (!data) return null;

  return (
    <div className="space-y-4">
      <div className="max-w-sm">
        <Label htmlFor="coverage-filter">Find a client</Label>
        <Input
          id="coverage-filter"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          placeholder="Client name"
        />
      </div>

      {!data.canManage ? (
        <p className="text-sm text-muted-foreground">
          You can see who covers each client. Changing it needs contract authority.
        </p>
      ) : null}

      {clients.map((c: any) => {
        const d = draft[c.id] ?? { staffUserId: "", role: "lead" };
        return (
          <Card key={c.id}>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">{c.name}</CardTitle>
              <CardDescription>
                {c.assignees.length === 0
                  ? "Nobody assigned — this client shows on no one's desk."
                  : `${c.assignees.length} teammate${c.assignees.length === 1 ? "" : "s"} covering`}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex flex-wrap gap-2">
                {c.assignees.map((a: any) => (
                  <span
                    key={a.id}
                    className="inline-flex items-center gap-2 rounded-full border px-3 py-1 text-sm"
                  >
                    {a.name}
                    <Badge variant={a.role === "lead" ? "default" : "secondary"}>{a.role}</Badge>
                    {data.canManage ? (
                      <button
                        type="button"
                        className="text-muted-foreground hover:text-destructive"
                        onClick={() => removeMut.mutate(a.id)}
                        aria-label={`Remove ${a.name}`}
                      >
                        ×
                      </button>
                    ) : null}
                  </span>
                ))}
              </div>

              {data.canManage ? (
                <div className="flex flex-wrap items-end gap-2">
                  <div className="min-w-56">
                    <Label>Add someone</Label>
                    <Select
                      value={d.staffUserId}
                      onValueChange={(v) =>
                        setDraft({ ...draft, [c.id]: { ...d, staffUserId: v } })
                      }
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Choose a teammate" />
                      </SelectTrigger>
                      <SelectContent>
                        {(data.staff as any[]).map((s) => (
                          <SelectItem key={s.userId} value={s.userId}>
                            {s.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="w-40">
                    <Label>Cover as</Label>
                    <Select
                      value={d.role}
                      onValueChange={(v) => setDraft({ ...draft, [c.id]: { ...d, role: v } })}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="lead">Lead</SelectItem>
                        <SelectItem value="support">Support</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <Button
                    size="sm"
                    disabled={!d.staffUserId || assignMut.isPending}
                    onClick={() =>
                      assignMut.mutate({
                        clientId: c.id,
                        staffUserId: d.staffUserId,
                        assignmentRole: d.role,
                      })
                    }
                  >
                    Assign
                  </Button>
                </div>
              ) : null}
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
