import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import {
  addServicesToEngagement,
  decideChangeOrder,
  executeChangeOrder,
  executeEngagementServices,
  getEngagementServices,
} from "@/lib/engagement-services.functions";
import { categoryLabel, listServiceCatalog } from "@/lib/service-catalog.functions";

const money = (cents: number) =>
  `$${(cents / 100).toLocaleString("en-US", { maximumFractionDigits: 0 })}`;

/** Staff view of an engagement's catalogue services, commercial snapshot and change orders. */
export function EngagementServicesPanel({ engagementId }: { engagementId: string }) {
  const load = useServerFn(getEngagementServices);
  const loadCatalogue = useServerFn(listServiceCatalog);
  const queryClient = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ["engagement-services", engagementId],
    queryFn: () => load({ data: { engagementId } }),
  });
  const catalogue = useQuery({
    queryKey: ["service-catalogue"],
    queryFn: () => loadCatalogue({ data: {} }),
  });

  const refresh = () =>
    queryClient.invalidateQueries({ queryKey: ["engagement-services", engagementId] });

  const add = useServerFn(addServicesToEngagement);
  const execute = useServerFn(executeEngagementServices);

  const [picked, setPicked] = useState<string[]>([]);
  const [effectiveDate, setEffectiveDate] = useState("");

  const addMutation = useMutation({
    mutationFn: () =>
      add({
        data: {
          engagementId,
          serviceIds: picked,
          effectiveDate: effectiveDate || null,
        },
      }),
    onSuccess: () => {
      toast.success("Services added at today's standard pricing.");
      setPicked([]);
      refresh();
    },
    onError: (e: any) => toast.error(e?.message ?? "Could not add the services."),
  });

  const executeMutation = useMutation({
    mutationFn: () => execute({ data: { engagementId } }),
    onSuccess: (r: any) => {
      toast.success(
        `Executed. ${r.locked} service${r.locked === 1 ? "" : "s"} locked and delivery started.`,
      );
      refresh();
    },
    onError: (e: any) => toast.error(e?.message ?? "Could not execute the engagement."),
  });

  if (isLoading || !data) return <Skeleton className="h-48 w-full" />;

  const canManage = data.access.canManage;
  const proposed = data.services.filter((s) => s.status === "proposed");

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Services on this engagement</CardTitle>
          <CardDescription>
            Each line keeps the price agreed when it was executed. Later changes to standard rates
            never touch it.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-2">
          {data.services.length === 0 && (
            <p className="text-sm text-muted-foreground">Nothing added yet.</p>
          )}
          {data.services.map((s) => (
            <div key={s.id} className="flex flex-wrap items-center justify-between gap-2 rounded-md border p-3">
              <div>
                <p className="text-sm font-medium">{s.serviceName}</p>
                <p className="text-xs text-muted-foreground">
                  {categoryLabel(s.category)} · standard {money(s.standardPriceCents)} ·{" "}
                  {s.billingFrequency.replace("_", " ")}
                  {s.pricingVersionLabel ? ` · ${s.pricingVersionLabel}` : ""}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-sm">{money(s.agreedPriceCents)}</span>
                <Badge variant={s.locked ? "default" : "secondary"}>
                  {s.locked ? "locked" : s.status}
                </Badge>
              </div>
            </div>
          ))}
          {proposed.length > 0 && canManage && (
            <Button size="sm" disabled={executeMutation.isPending} onClick={() => executeMutation.mutate()}>
              Execute and start delivery ({proposed.length})
            </Button>
          )}
        </CardContent>
      </Card>

      {canManage && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Add catalogue services</CardTitle>
            <CardDescription>
              Priced from the current published schedule and snapshotted onto this engagement.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="max-h-64 space-y-2 overflow-y-auto">
              {(catalogue.data?.services ?? []).map((s) => (
                <label key={s.id} className="flex items-start gap-3 rounded-md border p-2 text-sm">
                  <Checkbox
                    checked={picked.includes(s.id)}
                    onCheckedChange={() =>
                      setPicked((p) =>
                        p.includes(s.id) ? p.filter((x) => x !== s.id) : [...p, s.id],
                      )
                    }
                  />
                  <span>
                    {s.name}
                    <span className="block text-xs text-muted-foreground">
                      {categoryLabel(s.category)}
                      {s.standardPriceCents > 0 ? ` · ${money(s.standardPriceCents)}` : " · quoted"}
                    </span>
                  </span>
                </label>
              ))}
            </div>
            <div className="max-w-xs">
              <Label className="text-xs">Effective date</Label>
              <Input
                type="date"
                value={effectiveDate}
                onChange={(e) => setEffectiveDate(e.target.value)}
              />
            </div>
            <Button
              size="sm"
              disabled={picked.length === 0 || addMutation.isPending}
              onClick={() => addMutation.mutate()}
            >
              Add {picked.length || ""} service{picked.length === 1 ? "" : "s"}
            </Button>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Change orders</CardTitle>
          <CardDescription>
            Additions, cancellations and scope changes the client has asked for.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {data.changeOrders.length === 0 && (
            <p className="text-sm text-muted-foreground">None yet.</p>
          )}
          {data.changeOrders.map((c) => (
            <ChangeOrderRow key={c.id} order={c} canManage={canManage} onDone={refresh} />
          ))}
        </CardContent>
      </Card>
    </div>
  );
}

function ChangeOrderRow({
  order,
  canManage,
  onDone,
}: {
  order: any;
  canManage: boolean;
  onDone: () => void;
}) {
  const decide = useServerFn(decideChangeOrder);
  const countersign = useServerFn(executeChangeOrder);
  const [note, setNote] = useState(order.decisionNote ?? "");
  const [effectiveDate, setEffectiveDate] = useState(order.effectiveDate ?? "");
  const [prices, setPrices] = useState<Record<string, string>>(
    Object.fromEntries(order.lines.map((l: any) => [l.id, (l.agreedPriceCents / 100).toString()])),
  );
  const [signer, setSigner] = useState("");
  const [signerTitle, setSignerTitle] = useState("");

  const decideMutation = useMutation({
    mutationFn: (decision: "quoted" | "declined" | "withdrawn") =>
      decide({
        data: {
          changeOrderId: order.id,
          decision,
          note,
          effectiveDate: effectiveDate || null,
          lines: order.lines.map((l: any) => ({
            id: l.id,
            agreedPriceCents: Math.round(Number(prices[l.id] ?? 0) * 100),
          })),
        },
      }),
    onSuccess: () => {
      toast.success("Change order updated.");
      onDone();
    },
    onError: (e: any) => toast.error(e?.message ?? "Could not update the change order."),
  });

  const signMutation = useMutation({
    mutationFn: () =>
      countersign({
        data: { changeOrderId: order.id, signerName: signer, signerTitle },
      }),
    onSuccess: () => {
      toast.success("Countersigned. The services are live and delivery has started.");
      onDone();
    },
    onError: (e: any) => toast.error(e?.message ?? "Could not countersign."),
  });

  return (
    <div className="rounded-md border p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm font-medium">{order.title}</p>
        <Badge variant={order.status === "executed" ? "default" : "secondary"}>
          {order.status.replace("_", " ")}
        </Badge>
      </div>
      {order.clientReason && (
        <p className="mt-1 text-xs text-muted-foreground">Client: {order.clientReason}</p>
      )}

      <div className="mt-2 space-y-2">
        {order.lines.map((l: any) => (
          <div key={l.id} className="flex flex-wrap items-center justify-between gap-2 text-sm">
            <span>
              {l.action} — {l.serviceName}{" "}
              <span className="text-xs text-muted-foreground">
                standard {money(l.standardPriceCents)}
              </span>
            </span>
            {canManage && ["requested", "quoted"].includes(order.status) ? (
              <Input
                className="w-32"
                type="number"
                value={prices[l.id] ?? ""}
                onChange={(e) => setPrices({ ...prices, [l.id]: e.target.value })}
              />
            ) : (
              <span>{money(l.agreedPriceCents)}</span>
            )}
          </div>
        ))}
      </div>

      {canManage && ["requested", "quoted"].includes(order.status) && (
        <div className="mt-3 space-y-2">
          <div className="grid gap-2 sm:grid-cols-2">
            <div>
              <Label className="text-xs">Effective date</Label>
              <Input
                type="date"
                value={effectiveDate}
                onChange={(e) => setEffectiveDate(e.target.value)}
              />
            </div>
            <div>
              <Label className="text-xs">Note to the client</Label>
              <Textarea rows={2} value={note} onChange={(e) => setNote(e.target.value)} />
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button
              size="sm"
              disabled={decideMutation.isPending}
              onClick={() => decideMutation.mutate("quoted")}
            >
              Send quote to client
            </Button>
            <Button
              size="sm"
              variant="outline"
              disabled={decideMutation.isPending}
              onClick={() => decideMutation.mutate("declined")}
            >
              Decline
            </Button>
          </div>
        </div>
      )}

      {canManage && order.status === "client_signed" && (
        <div className="mt-3 space-y-2 rounded-md bg-muted p-3">
          <p className="text-sm">
            Signed by {order.clientSignerName}. Countersign to make it effective.
          </p>
          <div className="grid gap-2 sm:grid-cols-2">
            <div>
              <Label className="text-xs">Harmonious signer</Label>
              <Input value={signer} onChange={(e) => setSigner(e.target.value)} />
            </div>
            <div>
              <Label className="text-xs">Title</Label>
              <Input value={signerTitle} onChange={(e) => setSignerTitle(e.target.value)} />
            </div>
          </div>
          <Button
            size="sm"
            disabled={signer.trim().length < 2 || signMutation.isPending}
            onClick={() => signMutation.mutate()}
          >
            Countersign and start delivery
          </Button>
        </div>
      )}
    </div>
  );
}
