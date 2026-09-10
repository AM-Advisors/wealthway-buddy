import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
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
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { saveSow } from "@/lib/contracts.functions";
import { listEligibilityRules } from "@/lib/eligibility.functions";

const SOW_TYPES = [
  { value: "spv", label: "SPV" },
  { value: "fund", label: "Fund" },
  { value: "administration", label: "Administration" },
  { value: "other", label: "Other" },
];

const STATUSES = [
  { value: "draft", label: "Draft" },
  { value: "active", label: "Active" },
  { value: "terminated", label: "Terminated" },
];

type Draft = {
  id?: string;
  client_id: string;
  offering_id: string;
  title: string;
  sow_type: string;
  status: string;
  effective_date: string;
  termination_date: string;
  notice_days: string;
  signed_by: string;
  signed_on: string;
  notes: string;
  eligibility: Record<string, unknown>;
};

const blank = (clientId: string): Draft => ({
  client_id: clientId,
  offering_id: "none",
  title: "",
  sow_type: "spv",
  status: "draft",
  effective_date: "",
  termination_date: "",
  notice_days: "60",
  signed_by: "",
  signed_on: "",
  notes: "",
  eligibility: {},
});

/** Full editor for each engagement's statement of work, including its own conditions. */
export function SowEditor({
  clients,
  sows,
  funds,
  canManage,
}: {
  clients: any[];
  sows: any[];
  funds: any[];
  canManage: boolean;
}) {
  const queryClient = useQueryClient();
  const save = useServerFn(saveSow);
  const loadRules = useServerFn(listEligibilityRules);

  const [clientId, setClientId] = useState<string>(clients[0]?.id ?? "");
  const [draft, setDraft] = useState<Draft>(blank(clients[0]?.id ?? ""));

  const rules = useQuery({
    queryKey: ["eligibility-rules"],
    queryFn: () => loadRules({ data: {} }),
    retry: false,
  });

  const clientSows = sows.filter((s: any) => s.client_id === clientId);
  const clientFunds = funds.filter((f: any) => f.client_id === clientId);

  const mutation = useMutation({
    mutationFn: () =>
      save({
        data: {
          ...(draft.id ? { id: draft.id } : {}),
          client_id: clientId,
          offering_id: draft.offering_id === "none" ? null : draft.offering_id,
          title: draft.title.trim(),
          sow_type: draft.sow_type,
          status: draft.status,
          effective_date: draft.effective_date,
          termination_date: draft.termination_date,
          notice_days: Number(draft.notice_days || 60),
          signed_by: draft.signed_by,
          signed_on: draft.signed_on,
          eligibility: draft.eligibility,
          notes: draft.notes,
        } as any,
      }),
    onSuccess: () => {
      toast.success(draft.id ? "Statement of work updated." : "Statement of work created.");
      setDraft(blank(clientId));
      queryClient.invalidateQueries({ queryKey: ["pricing-board"] });
    },
    onError: (e: any) => toast.error(e?.message ?? "That didn't save."),
  });

  const setOverride = (key: string, value: unknown) =>
    setDraft((d) => ({ ...d, eligibility: { ...d.eligibility, [key]: value } }));

  const clearOverride = (key: string) =>
    setDraft((d) => {
      const next = { ...d.eligibility };
      delete next[key];
      return { ...d, eligibility: next };
    });

  if (!clients.length) {
    return (
      <p className="text-sm text-muted-foreground">
        No clients recorded yet. Add one under Clients and scope first.
      </p>
    );
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Statements of work</CardTitle>
          <CardDescription>
            Each engagement's own terms. Services, conditions and dates come from here, so a change
            takes effect without touching the product.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="max-w-sm">
            <Label>Client</Label>
            <Select
              value={clientId}
              onValueChange={(v) => {
                setClientId(v);
                setDraft(blank(v));
              }}
            >
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
            {clientSows.length ? (
              clientSows.map((sow: any) => (
                <div key={sow.id} className="flex flex-wrap items-start gap-3 p-3">
                  <div className="min-w-64">
                    <p className="text-sm font-medium">{sow.title}</p>
                    <p className="text-xs text-muted-foreground">
                      {sow.sow_type} · {sow.effective_date ?? "no start date"} ·{" "}
                      {sow.notice_days}-day notice
                      {sow.termination_date ? ` · ends ${sow.termination_date}` : ""}
                    </p>
                    {Object.keys(sow.eligibility ?? {}).length ? (
                      <p className="text-xs text-muted-foreground">
                        {Object.keys(sow.eligibility).length} condition
                        {Object.keys(sow.eligibility).length === 1 ? "" : "s"} set for this
                        engagement
                      </p>
                    ) : null}
                  </div>
                  <Badge variant={sow.status === "active" ? "default" : "secondary"}>
                    {sow.status}
                  </Badge>
                  {canManage ? (
                    <Button
                      size="sm"
                      variant="outline"
                      className="ml-auto"
                      onClick={() =>
                        setDraft({
                          id: sow.id,
                          client_id: sow.client_id,
                          offering_id: sow.offering_id ?? "none",
                          title: sow.title,
                          sow_type: sow.sow_type,
                          status: sow.status,
                          effective_date: sow.effective_date ?? "",
                          termination_date: sow.termination_date ?? "",
                          notice_days: String(sow.notice_days ?? 60),
                          signed_by: sow.signed_by ?? "",
                          signed_on: sow.signed_on ?? "",
                          notes: sow.notes ?? "",
                          eligibility: (sow.eligibility ?? {}) as Record<string, unknown>,
                        })
                      }
                    >
                      Edit
                    </Button>
                  ) : null}
                </div>
              ))
            ) : (
              <p className="p-3 text-sm text-muted-foreground">
                No statement of work recorded for this client yet.
              </p>
            )}
          </div>
        </CardContent>
      </Card>

      {canManage ? (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">
              {draft.id ? "Edit statement of work" : "New statement of work"}
            </CardTitle>
            <CardDescription>
              Scope and fee summaries are recorded here and shown to the client on their fund pages.
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-3 md:grid-cols-2">
            <div className="md:col-span-2">
              <Label htmlFor="sow-title">Title</Label>
              <Input
                id="sow-title"
                value={draft.title}
                onChange={(e) => setDraft({ ...draft, title: e.target.value })}
                placeholder="SPV Statement of Work — Growth Fund II"
              />
            </div>
            <div>
              <Label>Type</Label>
              <Select
                value={draft.sow_type}
                onValueChange={(v) => setDraft({ ...draft, sow_type: v })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {SOW_TYPES.map((t) => (
                    <SelectItem key={t.value} value={t.value}>
                      {t.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Status</Label>
              <Select value={draft.status} onValueChange={(v) => setDraft({ ...draft, status: v })}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {STATUSES.map((s) => (
                    <SelectItem key={s.value} value={s.value}>
                      {s.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Fund it covers</Label>
              <Select
                value={draft.offering_id}
                onValueChange={(v) => setDraft({ ...draft, offering_id: v })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">All of this client's funds</SelectItem>
                  {clientFunds.map((f: any) => (
                    <SelectItem key={f.id} value={f.id}>
                      {f.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label htmlFor="sow-notice">Notice period (days)</Label>
              <Input
                id="sow-notice"
                inputMode="numeric"
                value={draft.notice_days}
                onChange={(e) => setDraft({ ...draft, notice_days: e.target.value })}
              />
            </div>
            <div>
              <Label htmlFor="sow-start">Effective date</Label>
              <Input
                id="sow-start"
                type="date"
                value={draft.effective_date}
                onChange={(e) => setDraft({ ...draft, effective_date: e.target.value })}
              />
            </div>
            <div>
              <Label htmlFor="sow-end">Termination date</Label>
              <Input
                id="sow-end"
                type="date"
                value={draft.termination_date}
                onChange={(e) => setDraft({ ...draft, termination_date: e.target.value })}
              />
            </div>
            <div>
              <Label htmlFor="sow-signer">Signed by</Label>
              <Input
                id="sow-signer"
                value={draft.signed_by}
                onChange={(e) => setDraft({ ...draft, signed_by: e.target.value })}
              />
            </div>
            <div>
              <Label htmlFor="sow-signed">Signed on</Label>
              <Input
                id="sow-signed"
                type="date"
                value={draft.signed_on}
                onChange={(e) => setDraft({ ...draft, signed_on: e.target.value })}
              />
            </div>
            <div className="md:col-span-2">
              <Label htmlFor="sow-notes">Scope, deliverables, fees and timing</Label>
              <Textarea
                id="sow-notes"
                rows={5}
                value={draft.notes}
                onChange={(e) => setDraft({ ...draft, notes: e.target.value })}
                placeholder="Formation, EIN coordination, investor records and funding support. Form D and Blue Sky filings prepared from client-supplied information. Tax coordination with the client's preparer."
              />
            </div>

            <div className="space-y-2 md:col-span-2">
              <p className="text-sm font-medium">Conditions for this engagement</p>
              <p className="text-xs text-muted-foreground">
                Leave a condition untouched to use the platform default. Anything set here applies
                only to this client.
              </p>
              {rules.data?.rules.map((rule: any) => {
                const overridden = rule.key in draft.eligibility;
                const value = overridden ? draft.eligibility[rule.key] : rule.value;
                return (
                  <div
                    key={rule.key}
                    className="flex flex-wrap items-center gap-3 rounded-md border p-3"
                  >
                    <div className="min-w-64">
                      <p className="text-sm">{rule.label}</p>
                      <p className="text-xs text-muted-foreground">
                        Default: {JSON.stringify(rule.value)}
                        {rule.blocking ? " · blocking" : ""}
                      </p>
                    </div>
                    <div className="ml-auto flex items-center gap-2">
                      {rule.ruleType === "boolean" ? (
                        <Switch
                          checked={!!value}
                          onCheckedChange={(v) => setOverride(rule.key, v)}
                        />
                      ) : rule.ruleType === "number" ? (
                        <Input
                          className="w-28"
                          inputMode="numeric"
                          value={String(value ?? "")}
                          onChange={(e) => setOverride(rule.key, Number(e.target.value || 0))}
                        />
                      ) : (
                        <Input
                          className="w-56"
                          value={Array.isArray(value) ? value.join(", ") : String(value ?? "")}
                          onChange={(e) =>
                            setOverride(
                              rule.key,
                              e.target.value
                                .split(",")
                                .map((v) => v.trim())
                                .filter(Boolean),
                            )
                          }
                        />
                      )}
                      {overridden ? (
                        <Button size="sm" variant="ghost" onClick={() => clearOverride(rule.key)}>
                          Use default
                        </Button>
                      ) : null}
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="flex gap-2 md:col-span-2">
              <Button
                onClick={() => mutation.mutate()}
                disabled={draft.title.trim().length < 2 || mutation.isPending}
              >
                {draft.id ? "Save statement of work" : "Create statement of work"}
              </Button>
              {draft.id ? (
                <Button variant="ghost" onClick={() => setDraft(blank(clientId))}>
                  Cancel
                </Button>
              ) : null}
            </div>
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}
