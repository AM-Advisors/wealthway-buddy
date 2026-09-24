import { useState } from "react";
import { parseMoneyToCents } from "@/lib/contract-coverage";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
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
import {
  archivePricingVersion,
  createPricingVersion,
  deletePricingItem,
  PRICING_MODELS,
  publishPricingVersion,
  savePricingItem,
  SERVICE_CATEGORIES,
} from "@/lib/contracts.functions";

const money = (cents: number | null | undefined) =>
  cents === null || cents === undefined
    ? "—"
    : (cents / 100).toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });

type ItemDraft = {
  id?: string;
  label: string;
  service_key: string;
  category: string;
  pricing_model: string;
  amount: string;
  unit: string;
  condition: string;
  pass_through: boolean;
  sort_order: string;
};

const emptyDraft: ItemDraft = {
  label: "",
  service_key: "",
  category: "administration",
  pricing_model: "one_time",
  amount: "",
  unit: "",
  condition: "",
  pass_through: false,
  sort_order: "100",
};

/** The standard rate card: versions, line items, publishing. */
export function PricingCatalogBoard({
  versions,
  catalog,
  canManage,
}: {
  versions: any[];
  catalog: any[];
  canManage: boolean;
}) {
  const queryClient = useQueryClient();
  const saveItem = useServerFn(savePricingItem);
  const removeItem = useServerFn(deletePricingItem);
  const newVersion = useServerFn(createPricingVersion);
  const publish = useServerFn(publishPricingVersion);
  const archive = useServerFn(archivePricingVersion);

  const [selectedId, setSelectedId] = useState<string>(versions[0]?.id ?? "");
  const [draft, setDraft] = useState<ItemDraft>(emptyDraft);
  const [versionLabel, setVersionLabel] = useState("");
  const [versionDate, setVersionDate] = useState("");

  const selected = versions.find((v) => v.id === selectedId) ?? versions[0] ?? null;
  const locked = !selected || selected.status !== "draft" || !canManage;

  const refresh = () => queryClient.invalidateQueries({ queryKey: ["pricing-board"] });
  const fail = (e: any) => toast.error(e?.message ?? "That didn't save.");

  const itemMutation = useMutation({
    mutationFn: () =>
      saveItem({
        data: {
          ...(draft.id ? { id: draft.id } : {}),
          version_id: selected.id,
          label: draft.label.trim(),
          service_key: draft.service_key === "none" ? "" : draft.service_key,
          category: draft.category,
          pricing_model: draft.pricing_model,
          amount_cents: parseMoneyToCents(draft.amount),
          unit: draft.unit,
          condition: draft.condition,
          pass_through: draft.pass_through,
          sort_order: Number(draft.sort_order || 100),
        } as any,
      }),
    onSuccess: () => {
      toast.success(draft.id ? "Line item updated." : "Line item added.");
      setDraft(emptyDraft);
      refresh();
    },
    onError: fail,
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => removeItem({ data: { id } }),
    onSuccess: () => {
      toast.success("Line item removed.");
      refresh();
    },
    onError: fail,
  });

  const versionMutation = useMutation({
    mutationFn: () =>
      newVersion({
        data: {
          label: versionLabel.trim(),
          ...(selected ? { copyFromVersionId: selected.id } : {}),
          effectiveDate: versionDate,
        } as any,
      }),
    onSuccess: (res: any) => {
      toast.success("New version created as a draft.");
      setVersionLabel("");
      setVersionDate("");
      setSelectedId(res.id);
      refresh();
    },
    onError: fail,
  });

  const publishMutation = useMutation({
    mutationFn: (id: string) => publish({ data: { id } }),
    onSuccess: () => {
      toast.success("Version published.");
      refresh();
    },
    onError: fail,
  });

  const archiveMutation = useMutation({
    mutationFn: (id: string) => archive({ data: { id } }),
    onSuccess: () => {
      toast.success("Version archived.");
      refresh();
    },
    onError: fail,
  });

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Rate card versions</CardTitle>
          <CardDescription>
            A published version stays exactly as it was agreed. To change a fee, copy it into a new
            version, edit the copy and publish that.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex flex-wrap gap-2">
            {versions.map((version) => (
              <button
                key={version.id}
                type="button"
                onClick={() => setSelectedId(version.id)}
                className={`rounded-md border px-3 py-2 text-left text-sm ${
                  version.id === selected?.id ? "border-primary bg-accent" : ""
                }`}
              >
                <span className="font-medium">{version.label}</span>
                <span className="ml-2">
                  <Badge variant={version.status === "published" ? "default" : "secondary"}>
                    {version.status}
                  </Badge>
                </span>
                <span className="block text-xs text-muted-foreground">
                  {version.effective_date ? `From ${version.effective_date}` : "No start date"} ·{" "}
                  {version.items.length} item{version.items.length === 1 ? "" : "s"}
                </span>
              </button>
            ))}
            {!versions.length ? (
              <p className="text-sm text-muted-foreground">No rate card yet. Create the first one.</p>
            ) : null}
          </div>

          {canManage ? (
            <div className="grid gap-2 rounded-md border p-3 sm:grid-cols-[2fr_1fr_auto]">
              <div>
                <Label htmlFor="version-label">New version name</Label>
                <Input
                  id="version-label"
                  value={versionLabel}
                  onChange={(e) => setVersionLabel(e.target.value)}
                  placeholder="Exhibit A — 2026"
                />
              </div>
              <div>
                <Label htmlFor="version-date">Starts on</Label>
                <Input
                  id="version-date"
                  type="date"
                  value={versionDate}
                  onChange={(e) => setVersionDate(e.target.value)}
                />
              </div>
              <div className="flex items-end">
                <Button
                  onClick={() => versionMutation.mutate()}
                  disabled={versionLabel.trim().length < 2 || versionMutation.isPending}
                >
                  {selected ? "Copy into new version" : "Create version"}
                </Button>
              </div>
            </div>
          ) : null}

          {selected && canManage ? (
            <div className="flex flex-wrap gap-2">
              {selected.status === "draft" ? (
                <Button
                  size="sm"
                  onClick={() => publishMutation.mutate(selected.id)}
                  disabled={publishMutation.isPending}
                >
                  Publish {selected.label}
                </Button>
              ) : null}
              {selected.status !== "archived" ? (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => archiveMutation.mutate(selected.id)}
                  disabled={archiveMutation.isPending}
                >
                  Archive
                </Button>
              ) : null}
            </div>
          ) : null}
        </CardContent>
      </Card>

      {selected ? (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">{selected.label} line items</CardTitle>
            <CardDescription>
              {locked
                ? "This version is read-only. Copy it into a new version to change a fee."
                : "Edit fees here, then publish when the version is ready."}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="divide-y rounded-md border">
              {selected.items.length ? (
                selected.items.map((item: any) => (
                  <div key={item.id} className="flex flex-wrap items-start gap-3 p-3">
                    <div className="min-w-64">
                      <p className="text-sm font-medium">{item.label}</p>
                      <p className="text-xs text-muted-foreground">
                        {SERVICE_CATEGORIES.find((c) => c.key === item.category)?.label ??
                          item.category}
                        {item.condition ? ` · ${item.condition}` : ""}
                      </p>
                    </div>
                    <div className="text-sm">
                      {item.pass_through ? (
                        <Badge variant="outline">Pass-through at cost</Badge>
                      ) : (
                        <>
                          <span className="font-medium">{money(item.amount_cents)}</span>
                          <span className="text-muted-foreground">
                            {item.unit ? ` / ${item.unit}` : ""}
                          </span>
                        </>
                      )}
                      <span className="ml-2 text-xs text-muted-foreground">
                        {PRICING_MODELS.find((m) => m.value === item.pricing_model)?.label ??
                          item.pricing_model}
                      </span>
                    </div>
                    {!locked ? (
                      <div className="ml-auto flex gap-2">
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() =>
                            setDraft({
                              id: item.id,
                              label: item.label,
                              service_key: item.service_key ?? "none",
                              category: item.category,
                              pricing_model: item.pricing_model,
                              amount:
                                item.amount_cents === null ? "" : String(item.amount_cents / 100),
                              unit: item.unit ?? "",
                              condition: item.condition ?? "",
                              pass_through: !!item.pass_through,
                              sort_order: String(item.sort_order ?? 100),
                            })
                          }
                        >
                          Edit
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => deleteMutation.mutate(item.id)}
                          disabled={deleteMutation.isPending}
                        >
                          Remove
                        </Button>
                      </div>
                    ) : null}
                  </div>
                ))
              ) : (
                <p className="p-3 text-sm text-muted-foreground">No line items yet.</p>
              )}
            </div>

            {!locked ? (
              <div className="grid gap-3 rounded-md border p-3 md:grid-cols-2">
                <div className="md:col-span-2">
                  <Label htmlFor="item-label">Fee name</Label>
                  <Input
                    id="item-label"
                    value={draft.label}
                    onChange={(e) => setDraft({ ...draft, label: e.target.value })}
                    placeholder="SPV formation and administration"
                  />
                </div>
                <div>
                  <Label>Service it maps to</Label>
                  <Select
                    value={draft.service_key || "none"}
                    onValueChange={(v) => setDraft({ ...draft, service_key: v })}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="No specific service" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">No specific service</SelectItem>
                      {catalog.map((s: any) => (
                        <SelectItem key={s.key} value={s.key}>
                          {s.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Category</Label>
                  <Select
                    value={draft.category}
                    onValueChange={(v) => setDraft({ ...draft, category: v })}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {SERVICE_CATEGORIES.map((c) => (
                        <SelectItem key={c.key} value={c.key}>
                          {c.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>How it's charged</Label>
                  <Select
                    value={draft.pricing_model}
                    onValueChange={(v) => setDraft({ ...draft, pricing_model: v })}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {PRICING_MODELS.map((m) => (
                        <SelectItem key={m.value} value={m.value}>
                          {m.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label htmlFor="item-amount">Amount (USD)</Label>
                  <Input
                    id="item-amount"
                    inputMode="decimal"
                    value={draft.amount}
                    onChange={(e) => setDraft({ ...draft, amount: e.target.value })}
                    placeholder="5000"
                    disabled={draft.pass_through}
                  />
                </div>
                <div>
                  <Label htmlFor="item-unit">Per (optional)</Label>
                  <Input
                    id="item-unit"
                    value={draft.unit}
                    onChange={(e) => setDraft({ ...draft, unit: e.target.value })}
                    placeholder="additional investor"
                  />
                </div>
                <div className="md:col-span-2">
                  <Label htmlFor="item-condition">Applies when</Label>
                  <Input
                    id="item-condition"
                    value={draft.condition}
                    onChange={(e) => setDraft({ ...draft, condition: e.target.value })}
                    placeholder="Raise over $1,000,000"
                  />
                </div>
                <label className="flex items-center gap-2 text-sm">
                  <Checkbox
                    checked={draft.pass_through}
                    onCheckedChange={(v) =>
                      setDraft({ ...draft, pass_through: !!v, amount: v ? "" : draft.amount })
                    }
                  />
                  Charged at cost (state or filing fee passed through)
                </label>
                <div>
                  <Label htmlFor="item-sort">Order</Label>
                  <Input
                    id="item-sort"
                    inputMode="numeric"
                    value={draft.sort_order}
                    onChange={(e) => setDraft({ ...draft, sort_order: e.target.value })}
                  />
                </div>
                <div className="flex gap-2 md:col-span-2">
                  <Button
                    onClick={() => itemMutation.mutate()}
                    disabled={draft.label.trim().length < 2 || itemMutation.isPending}
                  >
                    {draft.id ? "Save changes" : "Add line item"}
                  </Button>
                  {draft.id ? (
                    <Button variant="ghost" onClick={() => setDraft(emptyDraft)}>
                      Cancel
                    </Button>
                  ) : null}
                </div>
              </div>
            ) : null}
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}
