import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";

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
import { deleteClientPrice, PRICING_MODELS, saveClientPrice } from "@/lib/contracts.functions";

const money = (cents: number | null | undefined) =>
  cents === null || cents === undefined
    ? "—"
    : (cents / 100).toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });

const toCents = (value: string) => (value.trim() === "" ? null : Math.round(Number(value) * 100));

/** Contracted rates for one client, shown against the standard rate card. */
export function ClientPricingBoard({
  clients,
  clientPricing,
  sows,
  versions,
  catalog = [],
  canManage,
}: {
  clients: any[];
  clientPricing: any[];
  sows: any[];
  versions: any[];
  catalog?: any[];
  canManage: boolean;
}) {
  const queryClient = useQueryClient();
  const save = useServerFn(saveClientPrice);
  const remove = useServerFn(deleteClientPrice);

  const [clientId, setClientId] = useState<string>(clients[0]?.id ?? "");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [label, setLabel] = useState("");
  const [serviceKey, setServiceKey] = useState("none");
  const [standard, setStandard] = useState("");
  const [contracted, setContracted] = useState("");
  const [note, setNote] = useState("");
  const [model, setModel] = useState("one_time");
  const [sowId, setSowId] = useState("none");
  const [versionId, setVersionId] = useState("none");
  const [effective, setEffective] = useState("");

  const published = versions.filter((v: any) => v.status === "published");
  const rows = clientPricing.filter((p: any) => p.client_id === clientId);
  const clientSows = sows.filter((s: any) => s.client_id === clientId);

  const reset = () => {
    setEditingId(null);
    setLabel("");
    setServiceKey("none");
    setStandard("");
    setContracted("");
    setNote("");
    setModel("one_time");
    setSowId("none");
    setVersionId("none");
    setEffective("");
  };

  const saveMutation = useMutation({
    mutationFn: () =>
      save({
        data: {
          ...(editingId ? { id: editingId } : {}),
          client_id: clientId,
          sow_id: sowId === "none" ? null : sowId,
          service_key: serviceKey === "none" ? "" : serviceKey,
          label: label.trim(),
          standard_cents: toCents(standard),
          contracted_cents: toCents(contracted),
          discount_note: note,
          pricing_model: model,
          version_id: versionId === "none" ? null : versionId,
          effective_date: effective,
        } as any,
      }),
    onSuccess: () => {
      toast.success("Contracted rate saved.");
      reset();
      queryClient.invalidateQueries({ queryKey: ["pricing-board"] });
    },
    onError: (e: any) => toast.error(e?.message ?? "That didn't save."),
  });

  const removeMutation = useMutation({
    mutationFn: (id: string) => remove({ data: { id } }),
    onSuccess: () => {
      toast.success("Rate removed.");
      queryClient.invalidateQueries({ queryKey: ["pricing-board"] });
    },
    onError: (e: any) => toast.error(e?.message ?? "That didn't work."),
  });

  if (!clients.length) {
    return (
      <p className="text-sm text-muted-foreground">
        No clients recorded yet. Add one under Clients and scope first.
      </p>
    );
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base">Contracted rates</CardTitle>
        <CardDescription>
          What this client actually pays. Anything not listed here follows the published rate card.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="max-w-sm">
          <Label>Client</Label>
          <Select value={clientId} onValueChange={(v) => { setClientId(v); reset(); }}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {clients.map((c: any) => (
                <SelectItem key={c.id} value={c.id}>
                  {c.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="divide-y rounded-md border">
          {rows.length ? (
            rows.map((row: any) => (
              <div key={row.id} className="flex flex-wrap items-start gap-3 p-3">
                <div className="min-w-56">
                  <p className="text-sm font-medium">{row.label}</p>
                  <p className="text-xs text-muted-foreground">
                    {PRICING_MODELS.find((m) => m.value === row.pricing_model)?.label ??
                      row.pricing_model}
                    {row.effective_date ? ` · from ${row.effective_date}` : ""}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {row.service_key
                      ? `Bills the service: ${
                          catalog.find((s: any) => s.key === row.service_key)?.name ?? row.service_key
                        }`
                      : "Not linked to a service — it won't appear on a prepared invoice."}
                  </p>
                  {row.discount_note ? (
                    <p className="text-xs text-muted-foreground">{row.discount_note}</p>
                  ) : null}
                </div>
                <div className="text-sm">
                  <span className="text-muted-foreground line-through">
                    {money(row.standard_cents)}
                  </span>
                  <span className="ml-2 font-medium">{money(row.contracted_cents)}</span>
                </div>
                {canManage ? (
                  <div className="ml-auto flex gap-2">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => {
                        setEditingId(row.id);
                        setLabel(row.label);
                        setServiceKey(row.service_key ?? "none");
                        setStandard(row.standard_cents === null ? "" : String(row.standard_cents / 100));
                        setContracted(
                          row.contracted_cents === null ? "" : String(row.contracted_cents / 100),
                        );
                        setNote(row.discount_note ?? "");
                        setModel(row.pricing_model ?? "one_time");
                        setSowId(row.sow_id ?? "none");
                        setVersionId(row.version_id ?? "none");
                        setEffective(row.effective_date ?? "");
                      }}
                    >
                      Edit
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => removeMutation.mutate(row.id)}
                      disabled={removeMutation.isPending}
                    >
                      Remove
                    </Button>
                  </div>
                ) : null}
              </div>
            ))
          ) : (
            <p className="p-3 text-sm text-muted-foreground">
              No client-specific rates. This client follows the published rate card.
            </p>
          )}
        </div>

        {canManage ? (
          <div className="grid gap-3 rounded-md border p-3 md:grid-cols-2">
            <div className="md:col-span-2">
              <Label htmlFor="cp-label">Fee name</Label>
              <Input
                id="cp-label"
                value={label}
                onChange={(e) => setLabel(e.target.value)}
                placeholder="SPV formation and administration"
              />
            </div>
            <div className="md:col-span-2">
              <Label>Service it bills</Label>
              <Select value={serviceKey} onValueChange={setServiceKey}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Not linked to a service</SelectItem>
                  {catalog.map((s: any) => (
                    <SelectItem key={s.key} value={s.key}>
                      {s.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="pt-1 text-xs text-muted-foreground">
                A rate only lands on a prepared invoice when it bills a service that is in the
                client's active scope.
              </p>
            </div>
            <div>
              <Label htmlFor="cp-standard">Standard amount (USD)</Label>
              <Input
                id="cp-standard"
                inputMode="decimal"
                value={standard}
                onChange={(e) => setStandard(e.target.value)}
              />
            </div>
            <div>
              <Label htmlFor="cp-contracted">Contracted amount (USD)</Label>
              <Input
                id="cp-contracted"
                inputMode="decimal"
                value={contracted}
                onChange={(e) => setContracted(e.target.value)}
              />
            </div>
            <div>
              <Label>How it's charged</Label>
              <Select value={model} onValueChange={setModel}>
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
              <Label htmlFor="cp-date">Starts on</Label>
              <Input
                id="cp-date"
                type="date"
                value={effective}
                onChange={(e) => setEffective(e.target.value)}
              />
            </div>
            <div>
              <Label>Statement of work</Label>
              <Select value={sowId} onValueChange={setSowId}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Not tied to one</SelectItem>
                  {clientSows.map((s: any) => (
                    <SelectItem key={s.id} value={s.id}>
                      {s.title}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Rate card version</Label>
              <Select value={versionId} onValueChange={setVersionId}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Not tied to one</SelectItem>
                  {published.map((v: any) => (
                    <SelectItem key={v.id} value={v.id}>
                      {v.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="md:col-span-2">
              <Label htmlFor="cp-note">Why it differs</Label>
              <Input
                id="cp-note"
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="Volume arrangement agreed in the SOW"
              />
            </div>
            <div className="flex gap-2 md:col-span-2">
              <Button
                onClick={() => saveMutation.mutate()}
                disabled={label.trim().length < 2 || saveMutation.isPending}
              >
                {editingId ? "Save changes" : "Add contracted rate"}
              </Button>
              {editingId ? (
                <Button variant="ghost" onClick={reset}>
                  Cancel
                </Button>
              ) : null}
            </div>
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}
