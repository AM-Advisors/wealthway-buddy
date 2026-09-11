import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";

import { listSignoffQueue, resolveInvoiceQuery, type SignoffItem } from "@/lib/signoff.functions";
import { activateServiceRequest, declineServiceRequest, decideSowApproval } from "@/lib/contracts.functions";
import { decideWireRequest } from "@/lib/wire-requests.functions";

type Queue = Awaited<ReturnType<typeof listSignoffQueue>>;

function money(cents: number | null) {
  if (cents == null) return null;
  return (cents / 100).toLocaleString("en-US", { style: "currency", currency: "USD" });
}

function daysWaiting(at: string | null) {
  if (!at) return 0;
  return Math.floor((Date.now() - new Date(at).getTime()) / 86_400_000);
}

export function SignoffBoard({ initial }: { initial: Queue }) {
  const [queue, setQueue] = useState<Queue>(initial);
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<string | null>(null);

  const reload = useServerFn(listSignoffQueue);
  const activate = useServerFn(activateServiceRequest);
  const declineService = useServerFn(declineServiceRequest);
  const decideWire = useServerFn(decideWireRequest);
  const decideSow = useServerFn(decideSowApproval);
  const decideInvoice = useServerFn(resolveInvoiceQuery);

  const refresh = async () => setQueue(await reload());

  async function run(key: string, work: () => Promise<unknown>, done: string) {
    setBusy(key);
    try {
      await work();
      toast.success(done);
      await refresh();
      setNotes((n) => ({ ...n, [key]: "" }));
    } catch (e: any) {
      toast.error(e?.message ?? "That didn't go through.");
    } finally {
      setBusy(null);
    }
  }

  async function approve(item: SignoffItem) {
    const key = `${item.kind}:${item.id}`;
    const note = (notes[key] ?? "").trim();
    if (item.kind === "service") {
      if (!item.sowId) {
        toast.error("There is no approved statement of work to activate this under.");
        return;
      }
      await run(key, () => activate({ data: { id: item.id, sowId: item.sowId! } }), "Service switched on.");
    } else if (item.kind === "wire") {
      await run(
        key,
        () => decideWire({ data: { id: item.id, status: "approved", review_note: note } }),
        "Wire request approved. It still needs two separate payment approvals before money moves.",
      );
    } else if (item.kind === "sow") {
      await run(key, () => decideSow({ data: { id: item.id, decision: "approved", note } }), "Agreement approved.");
    } else {
      await run(
        key,
        () => decideInvoice({ data: { id: item.id, decision: "accepted", note } }),
        "Invoice pulled back for correction.",
      );
    }
  }

  async function reject(item: SignoffItem) {
    const key = `${item.kind}:${item.id}`;
    const note = (notes[key] ?? "").trim();
    if (!note) {
      toast.error("Add a note explaining the decision before rejecting.");
      return;
    }
    if (item.kind === "service") {
      await run(key, () => declineService({ data: { id: item.id, reason: note } }), "Request declined.");
    } else if (item.kind === "wire") {
      await run(key, () => decideWire({ data: { id: item.id, status: "declined", review_note: note } }), "Wire request declined.");
    } else if (item.kind === "sow") {
      await run(key, () => decideSow({ data: { id: item.id, decision: "rejected", note } }), "Agreement sent back.");
    } else {
      await run(
        key,
        () => decideInvoice({ data: { id: item.id, decision: "declined", note } }),
        "Invoice kept as it stands; the client has been asked to approve again.",
      );
    }
  }

  const lists: { value: string; label: string; items: SignoffItem[]; blurb: string }[] = [
    {
      value: "services",
      label: `Extra services (${queue.services.length})`,
      items: queue.services,
      blurb: "Services a client has asked for outside their current scope.",
    },
    {
      value: "wires",
      label: `Wire requests (${queue.wires.length})`,
      items: queue.wires,
      blurb: "Approving here only clears the request. Two separate approvals are still needed before money moves.",
    },
    {
      value: "sows",
      label: `Agreements (${queue.sows.length})`,
      items: queue.sows,
      blurb: "Statements of work waiting on a Harmonious administrator.",
    },
    {
      value: "invoices",
      label: `Invoice queries (${queue.invoices.length})`,
      items: queue.invoices,
      blurb: "Accepting a query pulls the invoice back for correction. Declining asks the client to approve again.",
    },
  ];

  return (
    <Tabs defaultValue="services" className="w-full">
      <TabsList className="flex-wrap">
        {lists.map((l) => (
          <TabsTrigger key={l.value} value={l.value}>
            {l.label}
          </TabsTrigger>
        ))}
      </TabsList>

      {lists.map((l) => (
        <TabsContent key={l.value} value={l.value} className="mt-6 space-y-4">
          <p className="text-sm text-muted-foreground">{l.blurb}</p>
          {l.items.length === 0 ? (
            <Card>
              <CardContent className="py-8 text-sm text-muted-foreground">
                Nothing is waiting on you here.
              </CardContent>
            </Card>
          ) : (
            l.items.map((item) => {
              const key = `${item.kind}:${item.id}`;
              const waited = daysWaiting(item.raisedAt);
              return (
                <Card key={key}>
                  <CardHeader className="gap-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <CardTitle className="text-base capitalize">{item.title}</CardTitle>
                      {money(item.amountCents) ? <Badge variant="secondary">{money(item.amountCents)}</Badge> : null}
                      {waited >= 5 ? <Badge variant="destructive">Running late · {waited} days</Badge> : null}
                    </div>
                    <CardDescription>
                      {[item.clientName, item.fundName].filter(Boolean).join(" · ") || "No client recorded"}
                      {item.raisedByName ? ` · raised by ${item.raisedByName}` : ""}
                      {item.raisedAt ? ` · ${new Date(item.raisedAt).toLocaleDateString()}` : ""}
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <p className="text-sm">{item.detail}</p>
                    {item.sowTitle ? (
                      <p className="text-xs text-muted-foreground">Would go live under: {item.sowTitle}</p>
                    ) : null}
                    {item.blocker ? (
                      <p className="text-sm text-destructive">{item.blocker}</p>
                    ) : null}
                    {queue.canManage ? (
                      <>
                        <Textarea
                          value={notes[key] ?? ""}
                          onChange={(e) => setNotes((n) => ({ ...n, [key]: e.target.value }))}
                          placeholder="Note for the client (required to reject)"
                          rows={2}
                        />
                        <div className="flex gap-2">
                          <Button
                            size="sm"
                            disabled={busy === key || !!item.blocker}
                            onClick={() => approve(item)}
                          >
                            Approve
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            disabled={busy === key}
                            onClick={() => reject(item)}
                          >
                            Reject
                          </Button>
                        </div>
                      </>
                    ) : (
                      <p className="text-xs text-muted-foreground">
                        You can see this queue. Deciding needs legal, compliance, finance, client success or admin
                        authority.
                      </p>
                    )}
                  </CardContent>
                </Card>
              );
            })
          )}
        </TabsContent>
      ))}
    </Tabs>
  );
}
