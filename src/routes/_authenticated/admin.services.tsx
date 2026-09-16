import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
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
  intentLabel,
  listIntakeRequests,
  updateIntakeRequest,
} from "@/lib/client-services.functions";
import { ENTITY_TYPES } from "@/lib/entities.functions";
import {
  DELIVERY_WORKFLOWS,
  PRICING_MODELS,
  SERVICE_BILLING_FREQUENCIES,
  SERVICE_CATEGORIES,
  categoryLabel,
  listServiceCatalog,
  saveCatalogService,
  saveServicePackage,
} from "@/lib/service-catalog.functions";

export const Route = createFileRoute("/_authenticated/admin/services")({
  head: () => ({
    meta: [
      { title: "Services administration — Harmonious" },
      {
        name: "description",
        content:
          "Manage the Harmonious service catalogue, packages, standard pricing and the queue of client requests.",
      },
      { property: "og:title", content: "Services administration — Harmonious" },
      {
        property: "og:description",
        content: "Service catalogue, packages, pricing and client requests.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: ServicesAdmin,
});

const money = (cents: number) =>
  `$${(cents / 100).toLocaleString("en-US", { maximumFractionDigits: 0 })}`;

const emptyService = {
  id: undefined as string | undefined,
  key: "",
  serviceCode: "",
  name: "",
  category: "administration",
  description: "",
  standardPrice: "0",
  pricingModel: "one_time",
  billingFrequency: "one_time",
  applicableEntityTypes: [] as string[],
  standardScope: "",
  standardDeliverables: "",
  standardExclusions: "",
  requiredInformation: "",
  requiredDocuments: "",
  contractTerms: "",
  dependencies: [] as string[],
  onboardingWorkflow: "none",
  deliveryWorkflow: "none",
  internalOwner: "",
  renewalRule: "",
  status: "active" as "active" | "draft" | "retired",
};

function ServicesAdmin() {
  const loadCatalogue = useServerFn(listServiceCatalog);
  const loadRequests = useServerFn(listIntakeRequests);
  const queryClient = useQueryClient();

  const catalogue = useQuery({
    queryKey: ["service-catalogue-admin"],
    queryFn: () => loadCatalogue({ data: { includeInactive: true } }),
  });
  const requests = useQuery({
    queryKey: ["intake-requests"],
    queryFn: () => loadRequests(),
  });

  const [form, setForm] = useState({ ...emptyService });

  const save = useServerFn(saveCatalogService);
  const saveMutation = useMutation({
    mutationFn: () =>
      save({
        data: {
          id: form.id,
          key: form.key,
          serviceCode: form.serviceCode,
          name: form.name,
          category: form.category,
          description: form.description,
          standardPriceCents: Math.round(Number(form.standardPrice || 0) * 100),
          pricingModel: form.pricingModel,
          billingFrequency: form.billingFrequency,
          applicableEntityTypes: form.applicableEntityTypes,
          standardScope: form.standardScope,
          standardDeliverables: form.standardDeliverables,
          standardExclusions: form.standardExclusions,
          requiredInformation: form.requiredInformation,
          requiredDocuments: form.requiredDocuments,
          contractTerms: form.contractTerms,
          dependencies: form.dependencies,
          onboardingWorkflow: form.onboardingWorkflow,
          deliveryWorkflow: form.deliveryWorkflow,
          internalOwner: form.internalOwner,
          renewalRule: form.renewalRule,
          status: form.status,
          sortOrder: 0,
        },
      }),
    onSuccess: () => {
      toast.success("Service saved.");
      setForm({ ...emptyService });
      void queryClient.invalidateQueries({ queryKey: ["service-catalogue-admin"] });
    },
    onError: (e: any) => toast.error(e?.message ?? "Could not save the service."),
  });

  if (catalogue.isLoading || !catalogue.data) {
    return (
      <main className="mx-auto max-w-6xl px-4 py-10">
        <Skeleton className="h-64 w-full" />
      </main>
    );
  }

  const canManage = catalogue.data.access.canManage;
  const services = catalogue.data.services;

  return (
    <main className="mx-auto max-w-6xl px-4 py-10">
      <div className="mb-6 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-3xl">Services administration</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            The catalogue, packages and pricing behind every Harmonious engagement. New services are
            configured here — no rebuild needed.
          </p>
        </div>
        <Button asChild size="sm" variant="outline">
          <Link to="/admin/entities">Entity register</Link>
        </Button>
      </div>

      {!canManage && (
        <p className="mb-4 text-sm text-muted-foreground">
          You can view the catalogue. Changing it needs legal, compliance, finance, client success
          or admin authority.
        </p>
      )}

      <Tabs defaultValue="catalogue">
        <TabsList className="flex-wrap">
          <TabsTrigger value="catalogue">Catalogue ({services.length})</TabsTrigger>
          <TabsTrigger value="packages">Packages ({catalogue.data.packages.length})</TabsTrigger>
          <TabsTrigger value="requests">
            Client requests ({requests.data?.requests.length ?? 0})
          </TabsTrigger>
        </TabsList>

        <TabsContent value="catalogue" className="mt-4 space-y-4">
          {SERVICE_CATEGORIES.filter((c) => services.some((s) => s.category === c.value)).map(
            (c) => (
              <Card key={c.value}>
                <CardHeader>
                  <CardTitle className="text-base">{c.label}</CardTitle>
                </CardHeader>
                <CardContent className="space-y-2">
                  {services
                    .filter((s) => s.category === c.value)
                    .map((s) => (
                      <div
                        key={s.id}
                        className="flex flex-wrap items-start justify-between gap-2 rounded-md border p-3"
                      >
                        <div>
                          <p className="text-sm font-medium">
                            {s.name}{" "}
                            <span className="text-xs text-muted-foreground">{s.serviceCode}</span>
                          </p>
                          <p className="text-xs text-muted-foreground">
                            {s.standardPriceCents > 0 ? money(s.standardPriceCents) : "Quoted"} ·{" "}
                            {s.pricingModel.replace("_", " ")} ·{" "}
                            {s.billingFrequency.replace("_", " ")}
                            {s.internalOwner ? ` · owner ${s.internalOwner}` : ""}
                          </p>
                          {s.applicableEntityTypes.length > 0 && (
                            <p className="text-xs text-muted-foreground">
                              For:{" "}
                              {s.applicableEntityTypes
                                .map(
                                  (t) => ENTITY_TYPES.find((e) => e.value === t)?.label ?? t,
                                )
                                .join(", ")}
                            </p>
                          )}
                        </div>
                        <div className="flex items-center gap-2">
                          <Badge variant={s.status === "active" ? "default" : "secondary"}>
                            {s.status}
                          </Badge>
                          {canManage && (
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() =>
                                setForm({
                                  id: s.id,
                                  key: s.key,
                                  serviceCode: s.serviceCode ?? "",
                                  name: s.name,
                                  category: s.category,
                                  description: s.description ?? "",
                                  standardPrice: (s.standardPriceCents / 100).toString(),
                                  pricingModel: s.pricingModel,
                                  billingFrequency: s.billingFrequency,
                                  applicableEntityTypes: s.applicableEntityTypes,
                                  standardScope: s.standardScope ?? "",
                                  standardDeliverables: s.standardDeliverables.join("\n"),
                                  standardExclusions: s.standardExclusions.join("\n"),
                                  requiredInformation: s.requiredInformation.join("\n"),
                                  requiredDocuments: s.requiredDocuments.join("\n"),
                                  contractTerms: s.contractTerms ?? "",
                                  dependencies: s.dependencies,
                                  onboardingWorkflow: s.onboardingWorkflow ?? "none",
                                  deliveryWorkflow: s.deliveryWorkflow ?? "none",
                                  internalOwner: s.internalOwner ?? "",
                                  renewalRule: s.renewalRule ?? "",
                                  status: s.status as any,
                                })
                              }
                            >
                              Edit
                            </Button>
                          )}
                        </div>
                      </div>
                    ))}
                </CardContent>
              </Card>
            ),
          )}

          {canManage && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">
                  {form.id ? "Edit service" : "Add a service"}
                </CardTitle>
                <CardDescription>
                  Everything a service needs: what it is, what it costs, what it covers, what we
                  need from the client and which workflow it starts.
                </CardDescription>
              </CardHeader>
              <CardContent className="grid gap-3 sm:grid-cols-2">
                <Field label="Name">
                  <Input
                    value={form.name}
                    onChange={(e) => setForm({ ...form, name: e.target.value })}
                  />
                </Field>
                <Field label="Reference code">
                  <Input
                    value={form.serviceCode}
                    onChange={(e) => setForm({ ...form, serviceCode: e.target.value })}
                  />
                </Field>
                <Field label="Key (used in billing)">
                  <Input
                    value={form.key}
                    onChange={(e) => setForm({ ...form, key: e.target.value })}
                  />
                </Field>
                <Field label="Category">
                  <Picker
                    value={form.category}
                    onChange={(v) => setForm({ ...form, category: v })}
                    options={SERVICE_CATEGORIES as any}
                  />
                </Field>
                <Field label="Standard price ($)">
                  <Input
                    type="number"
                    value={form.standardPrice}
                    onChange={(e) => setForm({ ...form, standardPrice: e.target.value })}
                  />
                </Field>
                <Field label="Pricing model">
                  <Picker
                    value={form.pricingModel}
                    onChange={(v) => setForm({ ...form, pricingModel: v })}
                    options={PRICING_MODELS as any}
                  />
                </Field>
                <Field label="Billing frequency">
                  <Picker
                    value={form.billingFrequency}
                    onChange={(v) => setForm({ ...form, billingFrequency: v })}
                    options={SERVICE_BILLING_FREQUENCIES as any}
                  />
                </Field>
                <Field label="Status">
                  <Picker
                    value={form.status}
                    onChange={(v) => setForm({ ...form, status: v as any })}
                    options={[
                      { value: "active", label: "Active" },
                      { value: "draft", label: "Draft" },
                      { value: "retired", label: "Retired" },
                    ]}
                  />
                </Field>
                <Field label="Starts this onboarding workflow">
                  <Picker
                    value={form.onboardingWorkflow}
                    onChange={(v) => setForm({ ...form, onboardingWorkflow: v })}
                    options={DELIVERY_WORKFLOWS as any}
                  />
                </Field>
                <Field label="Starts this delivery workflow">
                  <Picker
                    value={form.deliveryWorkflow}
                    onChange={(v) => setForm({ ...form, deliveryWorkflow: v })}
                    options={DELIVERY_WORKFLOWS as any}
                  />
                </Field>
                <Field label="Internal owner">
                  <Input
                    value={form.internalOwner}
                    onChange={(e) => setForm({ ...form, internalOwner: e.target.value })}
                  />
                </Field>
                <Field label="Renewal rule">
                  <Input
                    value={form.renewalRule}
                    onChange={(e) => setForm({ ...form, renewalRule: e.target.value })}
                    placeholder="e.g. renews annually unless cancelled with 60 days' notice"
                  />
                </Field>

                <div className="sm:col-span-2">
                  <Label className="text-xs">Applies to these entity types</Label>
                  <div className="mt-1 flex flex-wrap gap-3">
                    {ENTITY_TYPES.map((t) => (
                      <label key={t.value} className="flex items-center gap-2 text-sm">
                        <Checkbox
                          checked={form.applicableEntityTypes.includes(t.value)}
                          onCheckedChange={() =>
                            setForm({
                              ...form,
                              applicableEntityTypes: form.applicableEntityTypes.includes(t.value)
                                ? form.applicableEntityTypes.filter((x) => x !== t.value)
                                : [...form.applicableEntityTypes, t.value],
                            })
                          }
                        />
                        {t.label}
                      </label>
                    ))}
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Leave all unticked for a service that suits any entity.
                  </p>
                </div>

                <Field label="Description" wide>
                  <Textarea
                    rows={2}
                    value={form.description}
                    onChange={(e) => setForm({ ...form, description: e.target.value })}
                  />
                </Field>
                <Field label="Standard scope" wide>
                  <Textarea
                    rows={3}
                    value={form.standardScope}
                    onChange={(e) => setForm({ ...form, standardScope: e.target.value })}
                  />
                </Field>
                <Field label="Deliverables (one per line)">
                  <Textarea
                    rows={3}
                    value={form.standardDeliverables}
                    onChange={(e) => setForm({ ...form, standardDeliverables: e.target.value })}
                  />
                </Field>
                <Field label="Exclusions (one per line)">
                  <Textarea
                    rows={3}
                    value={form.standardExclusions}
                    onChange={(e) => setForm({ ...form, standardExclusions: e.target.value })}
                  />
                </Field>
                <Field label="Information we need (one per line)">
                  <Textarea
                    rows={3}
                    value={form.requiredInformation}
                    onChange={(e) => setForm({ ...form, requiredInformation: e.target.value })}
                  />
                </Field>
                <Field label="Documents we need (one per line)">
                  <Textarea
                    rows={3}
                    value={form.requiredDocuments}
                    onChange={(e) => setForm({ ...form, requiredDocuments: e.target.value })}
                  />
                </Field>
                <Field label="Contract terms for this service" wide>
                  <Textarea
                    rows={3}
                    value={form.contractTerms}
                    onChange={(e) => setForm({ ...form, contractTerms: e.target.value })}
                  />
                </Field>

                <div className="sm:col-span-2">
                  <Label className="text-xs">Depends on</Label>
                  <div className="mt-1 flex flex-wrap gap-3">
                    {services
                      .filter((s) => s.id !== form.id)
                      .slice(0, 30)
                      .map((s) => (
                        <label key={s.id} className="flex items-center gap-2 text-xs">
                          <Checkbox
                            checked={form.dependencies.includes(s.key)}
                            onCheckedChange={() =>
                              setForm({
                                ...form,
                                dependencies: form.dependencies.includes(s.key)
                                  ? form.dependencies.filter((x) => x !== s.key)
                                  : [...form.dependencies, s.key],
                              })
                            }
                          />
                          {s.name}
                        </label>
                      ))}
                  </div>
                </div>

                <div className="flex gap-2 sm:col-span-2">
                  <Button
                    size="sm"
                    disabled={saveMutation.isPending || form.name.trim().length < 2}
                    onClick={() => saveMutation.mutate()}
                  >
                    {form.id ? "Save changes" : "Add service"}
                  </Button>
                  {form.id && (
                    <Button size="sm" variant="ghost" onClick={() => setForm({ ...emptyService })}>
                      Cancel
                    </Button>
                  )}
                </div>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        <TabsContent value="packages" className="mt-4 space-y-4">
          <PackagesTab
            packages={catalogue.data.packages}
            services={services}
            canManage={canManage}
            onSaved={() =>
              queryClient.invalidateQueries({ queryKey: ["service-catalogue-admin"] })
            }
          />
        </TabsContent>

        <TabsContent value="requests" className="mt-4 space-y-3">
          <RequestsTab
            requests={requests.data?.requests ?? []}
            onSaved={() => queryClient.invalidateQueries({ queryKey: ["intake-requests"] })}
          />
        </TabsContent>
      </Tabs>
    </main>
  );
}

function Field({
  label,
  children,
  wide,
}: {
  label: string;
  children: React.ReactNode;
  wide?: boolean;
}) {
  return (
    <div className={wide ? "sm:col-span-2" : undefined}>
      <Label className="text-xs">{label}</Label>
      {children}
    </div>
  );
}

function Picker({
  value,
  onChange,
  options,
}: {
  value: string;
  onChange: (v: string) => void;
  options: readonly { value: string; label: string }[];
}) {
  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger>
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {options.map((o) => (
          <SelectItem key={o.value} value={o.value}>
            {o.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

function PackagesTab({
  packages,
  services,
  canManage,
  onSaved,
}: {
  packages: any[];
  services: any[];
  canManage: boolean;
  onSaved: () => void;
}) {
  const save = useServerFn(saveServicePackage);
  const [form, setForm] = useState({
    id: undefined as string | undefined,
    code: "",
    name: "",
    description: "",
    serviceIds: [] as string[],
    optionalServiceIds: [] as string[],
  });

  const mutation = useMutation({
    mutationFn: () =>
      save({
        data: {
          id: form.id,
          code: form.code,
          name: form.name,
          description: form.description,
          applicableEntityTypes: [],
          status: "active",
          serviceIds: form.serviceIds,
          optionalServiceIds: form.optionalServiceIds,
        },
      }),
    onSuccess: () => {
      toast.success("Package saved.");
      setForm({
        id: undefined,
        code: "",
        name: "",
        description: "",
        serviceIds: [],
        optionalServiceIds: [],
      });
      onSaved();
    },
    onError: (e: any) => toast.error(e?.message ?? "Could not save the package."),
  });

  return (
    <>
      {packages.map((p) => (
        <Card key={p.id}>
          <CardHeader className="flex flex-row flex-wrap items-start justify-between gap-2 space-y-0">
            <div>
              <CardTitle className="text-base">{p.name}</CardTitle>
              <CardDescription>
                {p.code}
                {p.description ? ` · ${p.description}` : ""}
              </CardDescription>
            </div>
            {canManage && (
              <Button
                size="sm"
                variant="outline"
                onClick={() =>
                  setForm({
                    id: p.id,
                    code: p.code,
                    name: p.name,
                    description: p.description ?? "",
                    serviceIds: p.services.map((s: any) => s.serviceId),
                    optionalServiceIds: p.services
                      .filter((s: any) => s.optional)
                      .map((s: any) => s.serviceId),
                  })
                }
              >
                Edit
              </Button>
            )}
          </CardHeader>
          <CardContent className="space-y-1">
            {p.services.map((s: any) => (
              <p key={s.id} className="text-sm">
                {s.name}
                {s.optional ? " (optional)" : ""}
                {s.standardPriceCents > 0 ? ` · ${money(s.standardPriceCents)}` : ""}
              </p>
            ))}
          </CardContent>
        </Card>
      ))}

      {canManage && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">{form.id ? "Edit package" : "New package"}</CardTitle>
            <CardDescription>
              A bundle such as Fund Launch. Clients can still add or drop individual services.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Name">
                <Input
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                />
              </Field>
              <Field label="Code">
                <Input
                  value={form.code}
                  onChange={(e) => setForm({ ...form, code: e.target.value })}
                />
              </Field>
              <Field label="Description" wide>
                <Input
                  value={form.description}
                  onChange={(e) => setForm({ ...form, description: e.target.value })}
                />
              </Field>
            </div>
            <div>
              <Label className="text-xs">Services in this package</Label>
              <div className="mt-1 grid gap-2 sm:grid-cols-2">
                {services.map((s) => (
                  <label key={s.id} className="flex items-center gap-2 text-sm">
                    <Checkbox
                      checked={form.serviceIds.includes(s.id)}
                      onCheckedChange={() =>
                        setForm({
                          ...form,
                          serviceIds: form.serviceIds.includes(s.id)
                            ? form.serviceIds.filter((x) => x !== s.id)
                            : [...form.serviceIds, s.id],
                        })
                      }
                    />
                    <span>
                      {s.name}{" "}
                      <span className="text-xs text-muted-foreground">
                        {categoryLabel(s.category)}
                      </span>
                    </span>
                  </label>
                ))}
              </div>
            </div>
            <Button
              size="sm"
              disabled={mutation.isPending || form.name.trim().length < 2}
              onClick={() => mutation.mutate()}
            >
              Save package
            </Button>
          </CardContent>
        </Card>
      )}
    </>
  );
}

function RequestsTab({ requests, onSaved }: { requests: any[]; onSaved: () => void }) {
  const update = useServerFn(updateIntakeRequest);
  const [notes, setNotes] = useState<Record<string, string>>({});

  const mutation = useMutation({
    mutationFn: (vars: { id: string; status: string }) =>
      update({
        data: {
          id: vars.id,
          status: vars.status as any,
          staffNote: notes[vars.id] ?? null,
        },
      }),
    onSuccess: () => {
      toast.success("Request updated.");
      onSaved();
    },
    onError: (e: any) => toast.error(e?.message ?? "Could not update the request."),
  });

  if (requests.length === 0) {
    return <p className="text-sm text-muted-foreground">No client requests yet.</p>;
  }

  return (
    <>
      {requests.map((r) => (
        <Card key={r.id}>
          <CardHeader className="flex flex-row flex-wrap items-start justify-between gap-2 space-y-0">
            <div>
              <CardTitle className="text-base">
                {intentLabel(r.intent)} — {r.clientName}
              </CardTitle>
              <CardDescription>
                {r.entityName ?? "No specific entity"} ·{" "}
                {new Date(r.createdAt).toLocaleDateString("en-US")}
              </CardDescription>
            </div>
            <Badge variant={r.status === "converted" ? "default" : "secondary"}>
              {r.status.replace("_", " ")}
            </Badge>
          </CardHeader>
          <CardContent className="space-y-2">
            {r.summary && <p className="text-sm">{r.summary}</p>}
            {Object.entries(r.answers ?? {}).map(([k, v]) => (
              <p key={k} className="text-xs text-muted-foreground">
                {k.replace(/_/g, " ")}: {String(v)}
              </p>
            ))}
            {r.requestedServiceKeys.length > 0 && (
              <p className="text-xs text-muted-foreground">
                Asked about: {r.requestedServiceKeys.join(", ")}
              </p>
            )}
            <Textarea
              rows={2}
              placeholder="Note for the file"
              value={notes[r.id] ?? r.staffNote ?? ""}
              onChange={(e) => setNotes({ ...notes, [r.id]: e.target.value })}
            />
            <div className="flex flex-wrap gap-2">
              {["in_review", "scoped", "converted", "declined"].map((s) => (
                <Button
                  key={s}
                  size="sm"
                  variant="outline"
                  disabled={mutation.isPending}
                  onClick={() => mutation.mutate({ id: r.id, status: s })}
                >
                  {s.replace("_", " ")}
                </Button>
              ))}
            </div>
          </CardContent>
        </Card>
      ))}
    </>
  );
}
