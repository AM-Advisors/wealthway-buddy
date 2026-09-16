import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { Plus } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { EngagementForm } from "@/components/engagement-form";
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
import { Textarea } from "@/components/ui/textarea";
import {
  BILLING_FREQUENCIES,
  DELIVERY_STATUSES,
  listLinkableSows,
  saveEngagement,
} from "@/lib/engagements.functions";
import {
  ENTITY_STATUSES,
  ENTITY_TYPES,
  listClientEntities,
  saveClientTerms,
  saveEntity,
  TAX_ID_STATUSES,
} from "@/lib/entities.functions";

export const Route = createFileRoute("/_authenticated/admin/clients/$clientId/entities")({
  head: () => ({
    meta: [
      { title: "Client entities — Harmonious admin" },
      {
        name: "description",
        content:
          "One client's master relationship, entity register and engagements, with commercial terms and delivery status.",
      },
      { property: "og:title", content: "Client entities — Harmonious admin" },
      {
        property: "og:description",
        content: "Master relationship, entities and engagements for one client.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: ClientEntitiesPage,
});

const typeLabel = (v: string) => ENTITY_TYPES.find((t) => t.value === v)?.label ?? v;
const freqLabel = (v: string) => BILLING_FREQUENCIES.find((t) => t.value === v)?.label ?? v;

function ClientEntitiesPage() {
  const { clientId } = Route.useParams();
  const load = useServerFn(listClientEntities);
  const queryClient = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ["client-entities", clientId],
    queryFn: () => load({ data: { clientId } }),
  });

  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<string | null>(null);
  const [engagementFor, setEngagementFor] = useState<string | "client" | null>(null);

  const refresh = () => queryClient.invalidateQueries({ queryKey: ["client-entities", clientId] });

  if (isLoading || !data) {
    return (
      <main className="mx-auto max-w-5xl px-4 py-10">
        <Skeleton className="h-64 w-full" />
      </main>
    );
  }

  const canManage = data.access.canManage;

  return (
    <main className="mx-auto max-w-5xl px-4 py-10">
      <h1 className="text-3xl">{data.client?.name ?? "Client"}</h1>
      <p className="mb-6 mt-2 text-sm text-muted-foreground">
        Master relationship, entities and engagements.
        {!canManage && " You have read-only access."}
      </p>

      <MasterRelationship client={data.client} canManage={canManage} onSaved={refresh} />

      <div className="mb-3 mt-10 flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-2xl">Entities</h2>
        {canManage && (
          <Button size="sm" onClick={() => setCreating((v) => !v)}>
            <Plus className="mr-2 h-4 w-4" /> {creating ? "Cancel" : "Add entity"}
          </Button>
        )}
      </div>

      {creating && (
        <Card className="mb-4">
          <CardContent className="pt-6">
            <EntityForm
              clientId={clientId}
              entities={data.entities}
              onDone={() => {
                setCreating(false);
                refresh();
              }}
            />
          </CardContent>
        </Card>
      )}

      <div className="space-y-3">
        {data.entities.map((e) => (
          <Card key={e.id}>
            <CardHeader className="flex flex-row flex-wrap items-start justify-between gap-3 space-y-0">
              <div>
                <CardTitle className="text-base">{e.legalName}</CardTitle>
                <CardDescription>
                  {typeLabel(e.entityType)}
                  {e.jurisdiction ? ` · ${e.jurisdiction}` : ""}
                  {e.parentEntityId
                    ? ` · under ${
                        data.entities.find((p) => p.id === e.parentEntityId)?.legalName ?? "parent"
                      }`
                    : ""}
                </CardDescription>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant={e.status === "active" ? "default" : "secondary"}>{e.status}</Badge>
                <Button asChild size="sm" variant="outline">
                  <Link to="/admin/entities/$entityId" params={{ entityId: e.id }}>
                    Open
                  </Link>
                </Button>
                {canManage && (
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => setEditing(editing === e.id ? null : e.id)}
                  >
                    {editing === e.id ? "Close" : "Edit"}
                  </Button>
                )}
              </div>
            </CardHeader>
            <CardContent className="space-y-3">
              {editing === e.id && (
                <EntityForm
                  clientId={clientId}
                  entity={e}
                  entities={data.entities}
                  onDone={() => {
                    setEditing(null);
                    refresh();
                  }}
                />
              )}

              {e.engagements.length === 0 ? (
                <p className="text-sm text-muted-foreground">No engagement yet.</p>
              ) : (
                e.engagements.map((g) => (
                  <div
                    key={g.id}
                    className="flex flex-wrap items-center justify-between gap-2 rounded-md border p-3"
                  >
                    <div>
                      <p className="text-sm font-medium">{g.title}</p>
                      <p className="text-xs text-muted-foreground">
                        {freqLabel(g.billingFrequency)} · {g.deliveryStatus.replace("_", " ")}
                        {g.effectiveDate
                          ? ` · from ${new Date(g.effectiveDate).toLocaleDateString("en-US")}`
                          : ""}
                      </p>
                    </div>
                    <Button asChild size="sm" variant="outline">
                      <Link to="/admin/engagements/$engagementId" params={{ engagementId: g.id }}>
                        Open engagement
                      </Link>
                    </Button>
                  </div>
                ))
              )}

              {canManage && (
                <div>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => setEngagementFor(engagementFor === e.id ? null : e.id)}
                  >
                    {engagementFor === e.id ? "Cancel" : "New engagement"}
                  </Button>
                  {engagementFor === e.id && (
                    <div className="mt-3">
                      <EngagementForm
                        clientId={clientId}
                        entityId={e.id}
                        defaultTitle={`${e.legalName} services`}
                        defaultFrequency={data.client?.defaultBillingFrequency ?? "one_time"}
                        onDone={() => {
                          setEngagementFor(null);
                          refresh();
                        }}
                      />
                    </div>
                  )}
                </div>
              )}
            </CardContent>
          </Card>
        ))}
        {data.entities.length === 0 && (
          <p className="text-sm text-muted-foreground">
            No entities recorded yet. Add the client's company, fund, SPV or management entity.
          </p>
        )}
      </div>

      <div className="mb-3 mt-10 flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-2xl">Client-wide engagements</h2>
        {canManage && (
          <Button
            size="sm"
            variant="outline"
            onClick={() => setEngagementFor(engagementFor === "client" ? null : "client")}
          >
            {engagementFor === "client" ? "Cancel" : "New engagement"}
          </Button>
        )}
      </div>
      {engagementFor === "client" && (
        <Card className="mb-4">
          <CardContent className="pt-6">
            <EngagementForm
              clientId={clientId}
              entityId={null}
              defaultTitle="Client-wide services"
              defaultFrequency={data.client?.defaultBillingFrequency ?? "one_time"}
              onDone={() => {
                setEngagementFor(null);
                refresh();
              }}
            />
          </CardContent>
        </Card>
      )}
      <div className="space-y-2">
        {data.clientWideEngagements.map((g) => (
          <div
            key={g.id}
            className="flex flex-wrap items-center justify-between gap-2 rounded-md border p-3"
          >
            <div>
              <p className="text-sm font-medium">{g.title}</p>
              <p className="text-xs text-muted-foreground">
                {freqLabel(g.billingFrequency)} · {g.deliveryStatus.replace("_", " ")}
              </p>
            </div>
            <Button asChild size="sm" variant="outline">
              <Link to="/admin/engagements/$engagementId" params={{ engagementId: g.id }}>
                Open engagement
              </Link>
            </Button>
          </div>
        ))}
        {data.clientWideEngagements.length === 0 && (
          <p className="text-sm text-muted-foreground">
            Nothing that applies across every entity yet.
          </p>
        )}
      </div>
    </main>
  );
}

function MasterRelationship({
  client,
  canManage,
  onSaved,
}: {
  client: any;
  canManage: boolean;
  onSaved: () => void;
}) {
  const save = useServerFn(saveClientTerms);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({
    defaultBillingFrequency: client?.defaultBillingFrequency ?? "one_time",
    paymentTermsDays: String(client?.paymentTermsDays ?? 30),
    defaultDiscountKind: client?.defaultDiscountKind ?? "none",
    defaultDiscountValue: client?.defaultDiscountValue?.toString() ?? "",
    billingContactName: client?.billingContactName ?? "",
    billingContactEmail: client?.billingContactEmail ?? "",
  });

  const mutation = useMutation({
    mutationFn: () =>
      save({
        data: {
          clientId: client.id,
          defaultBillingFrequency: form.defaultBillingFrequency as any,
          paymentTermsDays: Number(form.paymentTermsDays || 30),
          defaultDiscountKind:
            form.defaultDiscountKind === "none" ? null : (form.defaultDiscountKind as any),
          defaultDiscountValue:
            form.defaultDiscountKind === "none" ? null : Number(form.defaultDiscountValue || 0),
          billingContactName: form.billingContactName,
          billingContactEmail: form.billingContactEmail,
        },
      }),
    onSuccess: () => {
      toast.success("Client terms saved.");
      setOpen(false);
      onSaved();
    },
    onError: (e: any) => toast.error(e?.message ?? "Could not save the terms."),
  });

  if (!client) return null;

  return (
    <Card>
      <CardHeader className="flex flex-row flex-wrap items-start justify-between gap-3 space-y-0">
        <div>
          <CardTitle className="text-base">Master relationship</CardTitle>
          <CardDescription>
            Master agreement {client.msaVersion ?? "not recorded"}
            {client.msaSignedOn
              ? ` · signed ${new Date(client.msaSignedOn).toLocaleDateString("en-US")}`
              : " · not signed yet"}
          </CardDescription>
        </div>
        <div className="flex gap-2">
          <Button asChild size="sm" variant="outline">
            <Link to="/admin/agreements">Agreements</Link>
          </Button>
          {canManage && (
            <Button size="sm" variant="ghost" onClick={() => setOpen((v) => !v)}>
              {open ? "Close" : "Edit terms"}
            </Button>
          )}
        </div>
      </CardHeader>
      <CardContent>
        <p className="text-sm text-muted-foreground">
          Default billing {freqLabel(client.defaultBillingFrequency)} · payment terms{" "}
          {client.paymentTermsDays} days
          {client.defaultDiscountKind
            ? ` · standing discount ${
                client.defaultDiscountKind === "percent"
                  ? `${client.defaultDiscountValue}%`
                  : `$${client.defaultDiscountValue}`
              }`
            : ""}
          {client.billingContactName ? ` · billing contact ${client.billingContactName}` : ""}
        </p>

        {open && (
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <div>
              <Label className="text-xs">Default billing frequency</Label>
              <Select
                value={form.defaultBillingFrequency}
                onValueChange={(v) => setForm({ ...form, defaultBillingFrequency: v })}
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
              <Label className="text-xs">Payment terms (days)</Label>
              <Input
                type="number"
                value={form.paymentTermsDays}
                onChange={(e) => setForm({ ...form, paymentTermsDays: e.target.value })}
              />
            </div>
            <div>
              <Label className="text-xs">Standing discount</Label>
              <Select
                value={form.defaultDiscountKind}
                onValueChange={(v) => setForm({ ...form, defaultDiscountKind: v })}
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
                disabled={form.defaultDiscountKind === "none"}
                value={form.defaultDiscountValue}
                onChange={(e) => setForm({ ...form, defaultDiscountValue: e.target.value })}
              />
            </div>
            <div>
              <Label className="text-xs">Billing contact</Label>
              <Input
                value={form.billingContactName}
                onChange={(e) => setForm({ ...form, billingContactName: e.target.value })}
              />
            </div>
            <div>
              <Label className="text-xs">Billing email</Label>
              <Input
                type="email"
                value={form.billingContactEmail}
                onChange={(e) => setForm({ ...form, billingContactEmail: e.target.value })}
              />
            </div>
            <div className="sm:col-span-2">
              <Button size="sm" disabled={mutation.isPending} onClick={() => mutation.mutate()}>
                Save terms
              </Button>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function EntityForm({
  clientId,
  entity,
  entities,
  onDone,
}: {
  clientId: string;
  entity?: any;
  entities: any[];
  onDone: () => void;
}) {
  const save = useServerFn(saveEntity);
  const [form, setForm] = useState({
    entityType: entity?.entityType ?? "fund",
    legalName: entity?.legalName ?? "",
    shortName: entity?.shortName ?? "",
    jurisdiction: entity?.jurisdiction ?? "",
    formationDate: entity?.formationDate ?? "",
    taxIdStatus: entity?.taxIdStatus ?? "not_started",
    taxIdMasked: entity?.taxIdMasked ?? "",
    parentEntityId: entity?.parentEntityId ?? "none",
    status: entity?.status ?? "planned",
    notes: entity?.notes ?? "",
  });

  const mutation = useMutation({
    mutationFn: () =>
      save({
        data: {
          id: entity?.id,
          clientId,
          entityType: form.entityType as any,
          legalName: form.legalName,
          shortName: form.shortName,
          jurisdiction: form.jurisdiction,
          formationDate: form.formationDate || null,
          taxIdStatus: form.taxIdStatus as any,
          taxIdMasked: form.taxIdMasked,
          parentEntityId: form.parentEntityId === "none" ? null : form.parentEntityId,
          offeringId: entity?.offeringId ?? null,
          status: form.status as any,
          notes: form.notes,
        },
      }),
    onSuccess: () => {
      toast.success(entity ? "Entity updated." : "Entity added.");
      onDone();
    },
    onError: (e: any) => toast.error(e?.message ?? "Could not save the entity."),
  });

  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <div>
        <Label className="text-xs">Type</Label>
        <Select value={form.entityType} onValueChange={(v) => setForm({ ...form, entityType: v })}>
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {ENTITY_TYPES.map((t) => (
              <SelectItem key={t.value} value={t.value}>
                {t.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div>
        <Label className="text-xs">Legal name</Label>
        <Input
          value={form.legalName}
          onChange={(e) => setForm({ ...form, legalName: e.target.value })}
        />
      </div>
      <div>
        <Label className="text-xs">Short name</Label>
        <Input
          value={form.shortName}
          onChange={(e) => setForm({ ...form, shortName: e.target.value })}
        />
      </div>
      <div>
        <Label className="text-xs">Jurisdiction</Label>
        <Input
          value={form.jurisdiction}
          onChange={(e) => setForm({ ...form, jurisdiction: e.target.value })}
        />
      </div>
      <div>
        <Label className="text-xs">Formation date</Label>
        <Input
          type="date"
          value={form.formationDate ?? ""}
          onChange={(e) => setForm({ ...form, formationDate: e.target.value })}
        />
      </div>
      <div>
        <Label className="text-xs">Tax ID</Label>
        <Select value={form.taxIdStatus} onValueChange={(v) => setForm({ ...form, taxIdStatus: v })}>
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {TAX_ID_STATUSES.map((t) => (
              <SelectItem key={t.value} value={t.value}>
                {t.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div>
        <Label className="text-xs">Parent entity</Label>
        <Select
          value={form.parentEntityId}
          onValueChange={(v) => setForm({ ...form, parentEntityId: v })}
        >
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="none">None</SelectItem>
            {entities
              .filter((e) => e.id !== entity?.id)
              .map((e) => (
                <SelectItem key={e.id} value={e.id}>
                  {e.legalName}
                </SelectItem>
              ))}
          </SelectContent>
        </Select>
      </div>
      <div>
        <Label className="text-xs">Status</Label>
        <Select value={form.status} onValueChange={(v) => setForm({ ...form, status: v })}>
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {ENTITY_STATUSES.map((t) => (
              <SelectItem key={t.value} value={t.value}>
                {t.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="sm:col-span-2">
        <Label className="text-xs">Notes</Label>
        <Textarea
          rows={2}
          value={form.notes}
          onChange={(e) => setForm({ ...form, notes: e.target.value })}
        />
      </div>
      <div className="sm:col-span-2">
        <Button
          size="sm"
          disabled={mutation.isPending || form.legalName.trim().length < 2}
          onClick={() => mutation.mutate()}
        >
          {entity ? "Save entity" : "Add entity"}
        </Button>
      </div>
    </div>
  );
}

