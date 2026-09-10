import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";

import { ActivityPanel } from "@/components/activity-panel";
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
import { Textarea } from "@/components/ui/textarea";
import { listProviders, saveProvider } from "@/lib/contracts.functions";
import { listExpenses, setProviderRetired } from "@/lib/expenses.functions";

const money = (cents: number) =>
  (cents / 100).toLocaleString("en-US", { style: "currency", currency: "USD" });

const PROVIDER_TYPES = [
  "bank",
  "payments",
  "identity",
  "signing",
  "storage",
  "tax",
  "filings",
  "fund administration",
  "technology",
  "other",
];

const CONTRACT_STATUSES = ["active", "in negotiation", "expired", "terminated"];
const OPERATING_STATUSES = [
  { value: "operational", label: "Operational" },
  { value: "degraded", label: "Degraded" },
  { value: "down", label: "Unavailable" },
  { value: "retired", label: "Retired" },
];

type Draft = {
  id?: string;
  name: string;
  provider_type: string;
  service_dependency: string;
  data_categories: string;
  contract_status: string;
  security_doc_url: string;
  sla: string;
  status: string;
  outage_note: string;
};

const emptyDraft: Draft = {
  name: "",
  provider_type: "bank",
  service_dependency: "",
  data_categories: "",
  contract_status: "active",
  security_doc_url: "",
  sla: "",
  status: "operational",
  outage_note: "",
};

const statusTone = (status: string) =>
  status === "operational" ? "outline" : status === "retired" ? "secondary" : "destructive";

/** Third-party providers Harmonious depends on, and their current operating status. */
export function ProvidersBoard({ canManage }: { canManage: boolean }) {
  const queryClient = useQueryClient();
  const load = useServerFn(listProviders);
  const save = useServerFn(saveProvider);

  const [draft, setDraft] = useState<Draft | null>(null);

  const { data, isLoading, error } = useQuery({
    queryKey: ["third-party-providers"],
    queryFn: () => load(),
    retry: false,
  });

  const saveMutation = useMutation({
    mutationFn: (input: Draft) =>
      save({
        data: {
          ...(input.id ? { id: input.id } : {}),
          name: input.name.trim(),
          provider_type: input.provider_type,
          service_dependency: input.service_dependency,
          data_categories: input.data_categories
            .split(",")
            .map((s) => s.trim())
            .filter(Boolean),
          contract_status: input.contract_status,
          security_doc_url: input.security_doc_url,
          sla: input.sla,
          status: input.status,
          outage_note: input.outage_note,
        },
      }),
    onSuccess: () => {
      toast.success("Provider record saved.");
      setDraft(null);
      queryClient.invalidateQueries({ queryKey: ["third-party-providers"] });
    },
    onError: (e: any) => toast.error(e?.message ?? "That provider couldn't be saved."),
  });

  const providers = useMemo(() => {
    const rows = ((data?.providers ?? []) as any[]).slice();
    const rank = (s: string) => (s === "down" ? 0 : s === "degraded" ? 1 : s === "retired" ? 3 : 2);
    return rows.sort(
      (a, b) => rank(a.status) - rank(b.status) || String(a.name).localeCompare(String(b.name)),
    );
  }, [data]);

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader className="flex flex-row items-start justify-between gap-4">
          <div>
            <CardTitle>Third-party providers</CardTitle>
            <CardDescription>
              Services Harmonious depends on to deliver contracted work. Availability and timing of
              these providers is outside Harmonious's control.
            </CardDescription>
          </div>
          {canManage ? (
            <Button size="sm" onClick={() => setDraft({ ...emptyDraft })}>
              Add provider
            </Button>
          ) : null}
        </CardHeader>
        <CardContent className="space-y-3">
          {isLoading ? <p className="text-sm text-muted-foreground">Loading providers…</p> : null}
          {error ? (
            <p className="text-sm text-muted-foreground">
              {(error as any)?.message ?? "Provider records aren't available to you."}
            </p>
          ) : null}
          {!isLoading && !error && providers.length === 0 ? (
            <p className="text-sm text-muted-foreground">No provider records yet.</p>
          ) : null}

          {providers.map((p) => (
            <div key={p.id} className="rounded-lg border p-4 space-y-2">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-sm font-medium">{p.name}</span>
                <Badge variant="outline">{p.provider_type}</Badge>
                <Badge variant={statusTone(p.status) as any}>
                  {OPERATING_STATUSES.find((s) => s.value === p.status)?.label ?? p.status}
                </Badge>
                <Badge variant="secondary">Contract: {p.contract_status}</Badge>
                {canManage ? (
                  <Button
                    className="ml-auto"
                    size="sm"
                    variant="ghost"
                    onClick={() =>
                      setDraft({
                        id: p.id,
                        name: p.name ?? "",
                        provider_type: p.provider_type ?? "other",
                        service_dependency: p.service_dependency ?? "",
                        data_categories: (p.data_categories ?? []).join(", "),
                        contract_status: p.contract_status ?? "active",
                        security_doc_url: p.security_doc_url ?? "",
                        sla: p.sla ?? "",
                        status: p.status ?? "operational",
                        outage_note: p.outage_note ?? "",
                      })
                    }
                  >
                    Edit
                  </Button>
                ) : null}
              </div>
              {p.service_dependency ? (
                <p className="text-sm text-muted-foreground">Supports: {p.service_dependency}</p>
              ) : null}
              {(p.data_categories ?? []).length > 0 ? (
                <p className="text-sm text-muted-foreground">
                  Data handled: {(p.data_categories ?? []).join(", ")}
                </p>
              ) : null}
              {p.sla ? <p className="text-sm text-muted-foreground">Service level: {p.sla}</p> : null}
              {p.outage_note ? (
                <p className="text-sm text-muted-foreground">Note: {p.outage_note}</p>
              ) : null}
              {p.security_doc_url ? (
                <a
                  className="text-sm underline"
                  href={p.security_doc_url}
                  target="_blank"
                  rel="noreferrer"
                >
                  Security documentation
                </a>
              ) : null}
            </div>
          ))}
        </CardContent>
      </Card>

      {draft && canManage ? (
        <Card>
          <CardHeader>
            <CardTitle>{draft.id ? "Edit provider" : "New provider"}</CardTitle>
            <CardDescription>Record the dependency and its current status only.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label>Name</Label>
                <Input
                  value={draft.name}
                  onChange={(e) => setDraft({ ...draft, name: e.target.value })}
                  placeholder="Provider name"
                />
              </div>
              <div className="space-y-2">
                <Label>Type</Label>
                <Select
                  value={draft.provider_type}
                  onValueChange={(v) => setDraft({ ...draft, provider_type: v })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {PROVIDER_TYPES.map((t) => (
                      <SelectItem key={t} value={t}>
                        {t}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Contract status</Label>
                <Select
                  value={draft.contract_status}
                  onValueChange={(v) => setDraft({ ...draft, contract_status: v })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {CONTRACT_STATUSES.map((t) => (
                      <SelectItem key={t} value={t}>
                        {t}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Operating status</Label>
                <Select value={draft.status} onValueChange={(v) => setDraft({ ...draft, status: v })}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {OPERATING_STATUSES.map((t) => (
                      <SelectItem key={t.value} value={t.value}>
                        {t.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Supports which service</Label>
                <Input
                  value={draft.service_dependency}
                  onChange={(e) => setDraft({ ...draft, service_dependency: e.target.value })}
                  placeholder="e.g. Investor funding and wire settlement"
                />
              </div>
              <div className="space-y-2">
                <Label>Data handled (comma separated)</Label>
                <Input
                  value={draft.data_categories}
                  onChange={(e) => setDraft({ ...draft, data_categories: e.target.value })}
                  placeholder="identity documents, bank details"
                />
              </div>
              <div className="space-y-2">
                <Label>Service level</Label>
                <Input
                  value={draft.sla}
                  onChange={(e) => setDraft({ ...draft, sla: e.target.value })}
                  placeholder="e.g. Same-business-day processing"
                />
              </div>
              <div className="space-y-2">
                <Label>Security documentation link</Label>
                <Input
                  value={draft.security_doc_url}
                  onChange={(e) => setDraft({ ...draft, security_doc_url: e.target.value })}
                  placeholder="https://"
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label>Status note</Label>
              <Textarea
                value={draft.outage_note}
                onChange={(e) => setDraft({ ...draft, outage_note: e.target.value })}
                placeholder="Current disruption or context, if any."
              />
            </div>
            <div className="flex gap-2">
              <Button
                disabled={saveMutation.isPending || draft.name.trim().length < 2}
                onClick={() => saveMutation.mutate(draft)}
              >
                {saveMutation.isPending ? "Saving…" : "Save provider"}
              </Button>
              <Button variant="ghost" onClick={() => setDraft(null)}>
                Cancel
              </Button>
            </div>
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}
