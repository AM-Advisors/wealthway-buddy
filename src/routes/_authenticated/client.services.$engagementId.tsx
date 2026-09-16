import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { Check, Plus } from "lucide-react";
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
  getEngagementServices,
  requestServiceChange,
  signChangeOrder,
} from "@/lib/engagement-services.functions";
import { categoryLabel, listServiceCatalog } from "@/lib/service-catalog.functions";

export const Route = createFileRoute("/_authenticated/client/services/$engagementId")({
  head: () => ({
    meta: [
      { title: "Your services — Harmonious" },
      {
        name: "description",
        content:
          "What Harmonious does on this engagement, what it costs, what has changed and what needs your approval.",
      },
      { property: "og:title", content: "Your services — Harmonious" },
      {
        property: "og:description",
        content: "Services, cost, changes and approvals for one engagement.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: EngagementReview,
});

const money = (cents: number) =>
  `$${(cents / 100).toLocaleString("en-US", { maximumFractionDigits: 0 })}`;
const date = (v: string | null) => (v ? new Date(v).toLocaleDateString("en-US") : "—");

function EngagementReview() {
  const { engagementId } = Route.useParams();
  const load = useServerFn(getEngagementServices);
  const queryClient = useQueryClient();
  const { data, isLoading } = useQuery({
    queryKey: ["engagement-services", engagementId],
    queryFn: () => load({ data: { engagementId } }),
  });
  const refresh = () =>
    queryClient.invalidateQueries({ queryKey: ["engagement-services", engagementId] });

  if (isLoading || !data) return <Skeleton className="h-64 w-full" />;

  const open = data.changeOrders.filter(
    (c) => !["executed", "declined", "withdrawn"].includes(c.status),
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{data.engagement.title}</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {data.entities.map((e) => e.legalName).join(", ") || "Across your organisation"}
            {data.engagement.effectiveDate
              ? ` · from ${date(data.engagement.effectiveDate)}`
              : ""}
          </p>
        </div>
        <Button asChild size="sm" variant="outline">
          <Link to="/client/services">All services</Link>
        </Button>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <SummaryCard
          label="What are we doing?"
          value={`${data.services.filter((s) => s.status === "active").length} services`}
        />
        <SummaryCard
          label="What does it cost?"
          value={`${money(data.totals.annualCents)} a year`}
          hint={data.totals.oneTimeCents > 0 ? `${money(data.totals.oneTimeCents)} one-time` : undefined}
        />
        <SummaryCard
          label="What needs approving?"
          value={open.length === 0 ? "Nothing right now" : `${open.length} change`}
        />
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Services</CardTitle>
          <CardDescription>
            Each line shows what we do, what it costs and when it started.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-2">
          {data.services.length === 0 && (
            <p className="text-sm text-muted-foreground">No services recorded yet.</p>
          )}
          {data.services.map((s) => (
            <div key={s.id} className="rounded-md border p-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <p className="text-sm font-medium">{s.serviceName}</p>
                  <p className="text-xs text-muted-foreground">
                    {categoryLabel(s.category)} · {s.billingFrequency.replace("_", " ")}
                    {s.effectiveDate ? ` · from ${date(s.effectiveDate)}` : ""}
                  </p>
                </div>
                <div className="text-right">
                  <p className="text-sm">
                    {s.passThrough ? "Billed at cost" : money(s.agreedPriceCents)}
                  </p>
                  {s.discountCents > 0 && (
                    <p className="text-xs text-muted-foreground">
                      {money(s.discountCents)} off the standard price
                    </p>
                  )}
                </div>
              </div>
              {s.scope && <p className="mt-2 text-xs text-muted-foreground">{s.scope}</p>}
              {s.status !== "active" && (
                <Badge className="mt-2" variant="secondary">
                  {s.status.replace("_", " ")}
                </Badge>
              )}
            </div>
          ))}
        </CardContent>
      </Card>

      <AddServiceCard engagementId={engagementId} onDone={refresh} />

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Changes</CardTitle>
          <CardDescription>
            Additions, cancellations and scope changes, with what was agreed and who agreed it.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {data.changeOrders.length === 0 && (
            <p className="text-sm text-muted-foreground">Nothing has changed yet.</p>
          )}
          {data.changeOrders.map((c) => (
            <div key={c.id} className="rounded-md border p-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-sm font-medium">{c.title}</p>
                <Badge variant={c.status === "executed" ? "default" : "secondary"}>
                  {c.status.replace("_", " ")}
                </Badge>
              </div>
              {c.clientReason && (
                <p className="mt-1 text-xs text-muted-foreground">You asked: {c.clientReason}</p>
              )}
              {c.decisionNote && (
                <p className="mt-1 text-xs text-muted-foreground">Harmonious: {c.decisionNote}</p>
              )}
              <div className="mt-2 space-y-1">
                {c.lines.map((l) => (
                  <p key={l.id} className="text-sm">
                    {l.action === "add" ? "Add" : l.action === "remove" ? "Cancel" : "Change"} —{" "}
                    {l.serviceName}
                    {l.action !== "remove" ? ` · ${money(l.agreedPriceCents)}` : ""}
                    {l.standardPriceCents !== l.agreedPriceCents && l.action === "add" ? (
                      <span className="text-xs text-muted-foreground">
                        {" "}
                        (standard {money(l.standardPriceCents)})
                      </span>
                    ) : null}
                  </p>
                ))}
              </div>
              {c.status === "quoted" && <SignChangeOrder id={c.id} onDone={refresh} />}
              {c.executedAt && (
                <p className="mt-2 text-xs text-muted-foreground">
                  Signed by {c.clientSignerName} and {c.harmoniousSignerName} ·{" "}
                  {date(c.executedAt)}. This does not change the pricing or terms of your other
                  services.
                </p>
              )}
            </div>
          ))}
        </CardContent>
      </Card>

      {data.workflows.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">What happens next</CardTitle>
            <CardDescription>The steps we start once an agreement is signed.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            {data.workflows.map((w) => (
              <div
                key={w.id}
                className="flex flex-wrap items-center justify-between gap-2 rounded-md border p-3 text-sm"
              >
                <span>{w.workflowName}</span>
                <span className="flex items-center gap-2">
                  <Badge variant={w.status === "complete" ? "default" : "secondary"}>
                    {w.status.replace("_", " ")}
                  </Badge>
                  {w.targetPath && (
                    <a className="text-xs underline" href={w.targetPath}>
                      Open
                    </a>
                  )}
                </span>
              </div>
            ))}
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function SummaryCard({
  label,
  value,
  hint,
}: {
  label: string;
  value: string;
  hint?: string | undefined;
}) {
  return (
    <Card>
      <CardContent className="p-4">
        <p className="text-xs uppercase tracking-wide text-muted-foreground">{label}</p>
        <p className="mt-1 text-lg font-medium">{value}</p>
        {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
      </CardContent>
    </Card>
  );
}

function AddServiceCard({ engagementId, onDone }: { engagementId: string; onDone: () => void }) {
  const loadCatalogue = useServerFn(listServiceCatalog);
  const request = useServerFn(requestServiceChange);
  const [open, setOpen] = useState(false);
  const [picked, setPicked] = useState<string[]>([]);
  const [reason, setReason] = useState("");

  const catalogue = useQuery({
    queryKey: ["service-catalogue"],
    queryFn: () => loadCatalogue({ data: {} }),
    enabled: open,
  });

  const mutation = useMutation({
    mutationFn: () =>
      request({
        data: {
          engagementId,
          changeType: "service_addition",
          serviceIds: picked,
          reason,
        },
      }),
    onSuccess: () => {
      toast.success("Sent. We'll price it and send it back for your approval.");
      setOpen(false);
      setPicked([]);
      setReason("");
      onDone();
    },
    onError: (e: any) => toast.error(e?.message ?? "Could not send the request."),
  });

  if (!open) {
    return (
      <Button variant="outline" onClick={() => setOpen(true)}>
        <Plus className="mr-2 size-4" /> Add a service
      </Button>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Add a service</CardTitle>
        <CardDescription>
          This does not change the pricing or terms of your existing services.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="max-h-72 space-y-2 overflow-y-auto">
          {(catalogue.data?.services ?? []).map((s) => (
            <label key={s.id} className="flex cursor-pointer items-start gap-3 rounded-md border p-3">
              <Checkbox
                checked={picked.includes(s.id)}
                onCheckedChange={() =>
                  setPicked((p) => (p.includes(s.id) ? p.filter((x) => x !== s.id) : [...p, s.id]))
                }
              />
              <span className="text-sm">
                <span className="font-medium">{s.name}</span>
                <span className="block text-xs text-muted-foreground">
                  {categoryLabel(s.category)}
                  {s.standardPriceCents > 0
                    ? ` · ${money(s.standardPriceCents)} ${s.billingFrequency.replace("_", " ")}`
                    : ""}
                </span>
                {s.standardScope && (
                  <span className="block text-xs text-muted-foreground">{s.standardScope}</span>
                )}
              </span>
            </label>
          ))}
        </div>
        <div>
          <Label className="text-xs">Why do you need this?</Label>
          <Textarea rows={2} value={reason} onChange={(e) => setReason(e.target.value)} />
        </div>
        <div className="flex gap-2">
          <Button
            size="sm"
            disabled={picked.length === 0 || reason.trim().length < 3 || mutation.isPending}
            onClick={() => mutation.mutate()}
          >
            Request this service
          </Button>
          <Button size="sm" variant="ghost" onClick={() => setOpen(false)}>
            Cancel
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

function SignChangeOrder({ id, onDone }: { id: string; onDone: () => void }) {
  const sign = useServerFn(signChangeOrder);
  const [name, setName] = useState("");
  const [title, setTitle] = useState("");
  const [services, setServices] = useState(false);
  const [changes, setChanges] = useState(false);

  const mutation = useMutation({
    mutationFn: () =>
      sign({
        data: {
          changeOrderId: id,
          signerName: name,
          signerTitle: title,
          confirmedServices: services,
          confirmedChanges: changes,
        },
      }),
    onSuccess: () => {
      toast.success("Signed. Harmonious will countersign and start work.");
      onDone();
    },
    onError: (e: any) => toast.error(e?.message ?? "Could not sign."),
  });

  return (
    <div className="mt-3 space-y-3 rounded-md bg-muted p-3">
      <p className="text-sm font-medium">Ready to approve</p>
      <label className="flex items-start gap-2 text-sm">
        <Checkbox checked={services} onCheckedChange={(v) => setServices(Boolean(v))} />
        <span>I have reviewed and approve the services, pricing and terms.</span>
      </label>
      <label className="flex items-start gap-2 text-sm">
        <Checkbox checked={changes} onCheckedChange={(v) => setChanges(Boolean(v))} />
        <span>
          I confirm the agreed changes shown above accurately reflect the modifications agreed by
          the parties.
        </span>
      </label>
      <div className="grid gap-2 sm:grid-cols-2">
        <div>
          <Label className="text-xs">Your full legal name</Label>
          <Input value={name} onChange={(e) => setName(e.target.value)} />
        </div>
        <div>
          <Label className="text-xs">Your title</Label>
          <Input value={title} onChange={(e) => setTitle(e.target.value)} />
        </div>
      </div>
      <Button
        size="sm"
        disabled={!services || !changes || name.trim().length < 2 || mutation.isPending}
        onClick={() => mutation.mutate()}
      >
        <Check className="mr-2 size-4" /> Sign
      </Button>
    </div>
  );
}
