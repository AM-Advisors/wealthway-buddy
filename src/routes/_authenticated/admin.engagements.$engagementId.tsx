import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
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
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import {
  BILLING_FREQUENCIES,
  DELIVERY_STATUSES,
  getEngagement,
  saveEngagement,
} from "@/lib/engagements.functions";

export const Route = createFileRoute("/_authenticated/admin/engagements/$engagementId")({
  head: () => ({
    meta: [
      { title: "Engagement — Harmonious admin" },
      {
        name: "description",
        content:
          "One engagement: the services in scope, commercial terms, service order, changes, signatures and delivery status.",
      },
      { property: "og:title", content: "Engagement — Harmonious admin" },
      {
        property: "og:description",
        content: "Services, commercial terms, order, changes, signatures and delivery.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: EngagementPage,
});

const money = (cents: number) =>
  `$${(cents / 100).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const date = (v: string | null) => (v ? new Date(v).toLocaleDateString("en-US") : "—");

function EngagementPage() {
  const { engagementId } = Route.useParams();
  const load = useServerFn(getEngagement);
  const queryClient = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ["engagement", engagementId],
    queryFn: () => load({ data: { engagementId } }),
  });

  if (isLoading || !data) {
    return (
      <main className="mx-auto max-w-5xl px-4 py-10">
        <Skeleton className="h-64 w-full" />
      </main>
    );
  }

  const g = data.engagement;

  return (
    <main className="mx-auto max-w-5xl px-4 py-10">
      <div className="mb-6 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-3xl">{g.title}</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {data.client?.name}
            {data.entity ? ` · ${data.entity.legalName}` : " · applies across the client"}
            {g.effectiveDate ? ` · from ${date(g.effectiveDate)}` : ""}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant={g.deliveryStatus === "live" ? "default" : "secondary"}>
            {g.deliveryStatus.replace("_", " ")}
          </Badge>
          {data.entity && (
            <Button asChild size="sm" variant="outline">
              <Link to="/admin/entities/$entityId" params={{ entityId: data.entity.id }}>
                Entity
              </Link>
            </Button>
          )}
        </div>
      </div>

      <Tabs defaultValue="services">
        <TabsList className="flex-wrap">
          <TabsTrigger value="services">Services</TabsTrigger>
          <TabsTrigger value="commercial">Commercial terms</TabsTrigger>
          <TabsTrigger value="order">Service order</TabsTrigger>
          <TabsTrigger value="changes">Changes ({data.changes.length})</TabsTrigger>
          <TabsTrigger value="signatures">Signatures</TabsTrigger>
          <TabsTrigger value="delivery">Delivery</TabsTrigger>
        </TabsList>

        <TabsContent value="services" className="mt-4 space-y-3">
          <EngagementServicesPanel engagementId={engagementId} />
          {g.serviceTerms && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Service-specific terms</CardTitle>
              </CardHeader>
              <CardContent className="whitespace-pre-line text-sm">{g.serviceTerms}</CardContent>
            </Card>
          )}
          {data.entitlements.length === 0 && (
            <p className="text-sm text-muted-foreground">No services recorded yet.</p>
          )}
          {data.entitlements.map((e) => (
            <div key={e.id} className="rounded-md border p-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-sm font-medium">{e.serviceKey.replace(/_/g, " ")}</p>
                <Badge variant={e.status === "included" ? "default" : "secondary"}>
                  {e.status.replace("_", " ")}
                </Badge>
              </div>
              {e.harmoniousHandles && (
                <p className="mt-1 text-xs text-muted-foreground">
                  Harmonious: {e.harmoniousHandles}
                </p>
              )}
              {e.clientHandles && (
                <p className="text-xs text-muted-foreground">Client: {e.clientHandles}</p>
              )}
              {e.thirdPartyHandles && (
                <p className="text-xs text-muted-foreground">
                  Third party: {e.thirdPartyHandles}
                </p>
              )}
            </div>
          ))}
        </TabsContent>

        <TabsContent value="commercial" className="mt-4 space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">
                Priced lines {data.pricing.versionLabel ? `· ${data.pricing.versionLabel}` : ""}
              </CardTitle>
              <CardDescription>
                {data.pricing.locked
                  ? "Locked to the executed agreement. Changing standard rates never touches this."
                  : "Not executed yet, so these lines can still change."}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-2">
              {data.pricing.lines.length === 0 && (
                <p className="text-sm text-muted-foreground">No priced lines yet.</p>
              )}
              {data.pricing.lines.map((l) => (
                <div key={l.id} className="flex items-center justify-between rounded-md border p-3">
                  <div>
                    <p className="text-sm font-medium">{l.label}</p>
                    <p className="text-xs text-muted-foreground">
                      {l.passThrough
                        ? "Pass-through cost"
                        : `Standard ${money(l.standardCents)} · ${l.pricingModel.replace("_", " ")}`}
                    </p>
                  </div>
                  <p className="text-sm">{l.passThrough ? "At cost" : money(l.finalCents)}</p>
                </div>
              ))}
              {data.pricing.lines.length > 0 && (
                <div className="space-y-1 rounded-md bg-muted p-3 text-sm">
                  <p className="flex justify-between">
                    <span>Subtotal</span>
                    <span>{money(data.pricing.subtotalCents)}</span>
                  </p>
                  {data.pricing.discountCents > 0 && (
                    <p className="flex justify-between">
                      <span>
                        Discount
                        {g.discountReason ? ` — ${g.discountReason}` : ""}
                      </span>
                      <span>-{money(data.pricing.discountCents)}</span>
                    </p>
                  )}
                  <p className="flex justify-between font-medium">
                    <span>Total</span>
                    <span>{money(data.pricing.totalCents)}</span>
                  </p>
                </div>
              )}
            </CardContent>
          </Card>

          <CommercialTermsForm
            engagement={g}
            clientId={g.clientId}
            canManage={data.access.canManage}
            onSaved={() => queryClient.invalidateQueries({ queryKey: ["engagement", engagementId] })}
          />
        </TabsContent>

        <TabsContent value="order" className="mt-4 space-y-3">
          {!data.sow && (
            <p className="text-sm text-muted-foreground">
              No service order attached to this engagement yet.
            </p>
          )}
          {data.sow && (
            <Card>
              <CardHeader className="flex flex-row flex-wrap items-start justify-between gap-3 space-y-0">
                <div>
                  <CardTitle className="text-base">{data.sow.title}</CardTitle>
                  <CardDescription>
                    Version {data.sow.version} · {data.sow.stage.replace("_", " ")} ·{" "}
                    {data.sow.executedAt
                      ? `executed ${date(data.sow.executedAt)}`
                      : "not executed yet"}
                  </CardDescription>
                </div>
                <Button asChild size="sm" variant="outline">
                  <Link to="/admin/agreements">Open in agreements</Link>
                </Button>
              </CardHeader>
              <CardContent className="space-y-3">
                {data.sections.map((s) => (
                  <div key={s.id}>
                    <p className="text-sm font-medium">
                      {s.sectionNo}. {s.title}
                    </p>
                    <p className="whitespace-pre-line text-sm text-muted-foreground">{s.body}</p>
                  </div>
                ))}
              </CardContent>
            </Card>
          )}
          {data.amendments.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Amendments and change orders</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                {data.amendments.map((a) => (
                  <div key={a.id} className="rounded-md border p-3 text-sm">
                    <p className="font-medium">
                      #{a.amendmentNo} {a.title}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {a.status}
                      {a.executedAt ? ` · executed ${date(a.executedAt)}` : ""}
                    </p>
                  </div>
                ))}
              </CardContent>
            </Card>
          )}
        </TabsContent>

        <TabsContent value="changes" className="mt-4 space-y-2">
          {data.changes.length === 0 && (
            <p className="text-sm text-muted-foreground">No change requests.</p>
          )}
          {data.changes.map((c) => (
            <div key={c.id} className="rounded-md border p-3 text-sm">
              <p className="font-medium">
                {c.sectionTitle} — {c.status}
              </p>
              <p className="whitespace-pre-line">{c.requestedText}</p>
              {c.reason && <p className="text-xs text-muted-foreground">Why: {c.reason}</p>}
            </div>
          ))}
        </TabsContent>

        <TabsContent value="signatures" className="mt-4 space-y-2">
          {data.signatures.length === 0 && (
            <p className="text-sm text-muted-foreground">Nobody has signed yet.</p>
          )}
          {data.signatures.map((s) => (
            <p key={s.id} className="text-sm">
              {s.side === "client" ? "Client" : "Harmonious"} · {s.name}
              {s.title ? `, ${s.title}` : ""} · {new Date(s.signedAt).toLocaleString("en-US")}
            </p>
          ))}
        </TabsContent>

        <TabsContent value="delivery" className="mt-4 space-y-3">
          <p className="text-sm text-muted-foreground">
            Delivery status: {g.deliveryStatus.replace("_", " ")} · {data.delivery.openHolds} open
            hold{data.delivery.openHolds === 1 ? "" : "s"}
          </p>
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Compliance items</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {data.delivery.compliance.length === 0 && (
                <p className="text-sm text-muted-foreground">Nothing tracked yet.</p>
              )}
              {data.delivery.compliance.map((c) => (
                <div key={c.id} className="flex justify-between rounded-md border p-3 text-sm">
                  <span>{c.title}</span>
                  <span className="text-muted-foreground">
                    {c.status}
                    {c.dueDate ? ` · due ${date(c.dueDate)}` : ""}
                  </span>
                </div>
              ))}
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Documents</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {data.delivery.documents.length === 0 && (
                <p className="text-sm text-muted-foreground">No documents yet.</p>
              )}
              {data.delivery.documents.map((d) => (
                <div key={d.id} className="flex justify-between rounded-md border p-3 text-sm">
                  <span>{d.title}</span>
                  <span className="text-muted-foreground">{d.status}</span>
                </div>
              ))}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </main>
  );
}

function CommercialTermsForm({
  engagement,
  clientId,
  canManage,
  onSaved,
}: {
  engagement: any;
  clientId: string;
  canManage: boolean;
  onSaved: () => void;
}) {
  const save = useServerFn(saveEngagement);
  const [form, setForm] = useState({
    title: engagement.title,
    billingFrequency: engagement.billingFrequency,
    discountKind: engagement.discountKind ?? "none",
    discountValue: engagement.discountValue?.toString() ?? "",
    discountReason: engagement.discountReason ?? "",
    effectiveDate: engagement.effectiveDate ?? "",
    firstInvoiceDate: engagement.firstInvoiceDate ?? "",
    deliveryStatus: engagement.deliveryStatus,
    serviceTerms: engagement.serviceTerms ?? "",
  });

  const mutation = useMutation({
    mutationFn: () =>
      save({
        data: {
          id: engagement.id,
          clientId,
          entityId: engagement.entityId,
          sowId: engagement.sowId,
          title: form.title,
          billingFrequency: form.billingFrequency as any,
          discountKind: form.discountKind === "none" ? null : (form.discountKind as any),
          discountValue: form.discountKind === "none" ? null : Number(form.discountValue || 0),
          discountReason: form.discountReason,
          effectiveDate: form.effectiveDate || null,
          firstInvoiceDate: form.firstInvoiceDate || null,
          deliveryStatus: form.deliveryStatus as any,
          serviceTerms: form.serviceTerms,
        },
      }),
    onSuccess: () => {
      toast.success("Engagement saved.");
      onSaved();
    },
    onError: (e: any) => toast.error(e?.message ?? "Could not save the engagement."),
  });

  if (!canManage) return null;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Engagement terms</CardTitle>
        <CardDescription>
          Billing frequency, discount and dates apply to this engagement only.
        </CardDescription>
      </CardHeader>
      <CardContent className="grid gap-3 sm:grid-cols-2">
        <div>
          <Label className="text-xs">Title</Label>
          <Input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />
        </div>
        <div>
          <Label className="text-xs">Billing frequency</Label>
          <Select
            value={form.billingFrequency}
            onValueChange={(v) => setForm({ ...form, billingFrequency: v })}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {BILLING_FREQUENCIES.map((f) => (
                <SelectItem key={f.value} value={f.value}>
                  {f.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label className="text-xs">Discount</Label>
          <Select
            value={form.discountKind}
            onValueChange={(v) => setForm({ ...form, discountKind: v })}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="none">None</SelectItem>
              <SelectItem value="percent">Percentage</SelectItem>
              <SelectItem value="fixed">Fixed amount</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label className="text-xs">Discount amount</Label>
          <Input
            type="number"
            disabled={form.discountKind === "none"}
            value={form.discountValue}
            onChange={(e) => setForm({ ...form, discountValue: e.target.value })}
          />
        </div>
        <div className="sm:col-span-2">
          <Label className="text-xs">Reason for the discount</Label>
          <Input
            disabled={form.discountKind === "none"}
            value={form.discountReason}
            onChange={(e) => setForm({ ...form, discountReason: e.target.value })}
          />
        </div>
        <div>
          <Label className="text-xs">Effective date</Label>
          <Input
            type="date"
            value={form.effectiveDate}
            onChange={(e) => setForm({ ...form, effectiveDate: e.target.value })}
          />
        </div>
        <div>
          <Label className="text-xs">First invoice date</Label>
          <Input
            type="date"
            value={form.firstInvoiceDate}
            onChange={(e) => setForm({ ...form, firstInvoiceDate: e.target.value })}
          />
        </div>
        <div>
          <Label className="text-xs">Delivery status</Label>
          <Select
            value={form.deliveryStatus}
            onValueChange={(v) => setForm({ ...form, deliveryStatus: v })}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {DELIVERY_STATUSES.map((s) => (
                <SelectItem key={s.value} value={s.value}>
                  {s.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="sm:col-span-2">
          <Label className="text-xs">Service-specific terms</Label>
          <Textarea
            rows={3}
            value={form.serviceTerms}
            onChange={(e) => setForm({ ...form, serviceTerms: e.target.value })}
          />
        </div>
        <div className="sm:col-span-2">
          <Button size="sm" disabled={mutation.isPending} onClick={() => mutation.mutate()}>
            Save engagement
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
