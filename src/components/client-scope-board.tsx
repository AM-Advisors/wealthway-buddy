import { useState } from "react";
import { Link } from "@tanstack/react-router";
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
import { Textarea } from "@/components/ui/textarea";
import { ResponsibilityMatrix } from "@/components/responsibility-matrix";
import { statusLabel, statusTone } from "@/components/service-gate";
import { money } from "@/lib/status";
import {
  ENTITLEMENT_STATUSES,
  SERVICE_CATEGORIES,
  getClientScope,
  saveSow,
  setEntitlement,
} from "@/lib/contracts.functions";

export function ClientScopeBoard({ clientId }: { clientId: string }) {
  const load = useServerFn(getClientScope);
  const setScope = useServerFn(setEntitlement);
  const addSow = useServerFn(saveSow);
  const queryClient = useQueryClient();

  const { data, isLoading, isError, error } = useQuery({
    queryKey: ["client-scope", clientId],
    queryFn: () => load({ data: { clientId } }),
    retry: false,
  });

  const [sowTitle, setSowTitle] = useState("");
  const [sowType, setSowType] = useState("spv");
  const [effective, setEffective] = useState("");
  const [expanded, setExpanded] = useState<string | null>(null);

  const createSow = useMutation({
    mutationFn: () =>
      addSow({
        data: {
          client_id: clientId,
          title: sowTitle,
          sow_type: sowType,
          status: "active",
          effective_date: effective,
          notice_days: 60,
          eligibility: {},
        } as any,
      }),
    onSuccess: () => {
      toast.success("Statement of work added.");
      setSowTitle("");
      queryClient.invalidateQueries({ queryKey: ["client-scope", clientId] });
    },
    onError: (e: any) => toast.error(e?.message ?? "That didn't save."),
  });

  const change = useMutation({
    mutationFn: (vars: { serviceKey: string; status: string; sowId: string | null }) =>
      setScope({
        data: {
          client_id: clientId,
          service_key: vars.serviceKey,
          status: vars.status,
          sow_id: vars.sowId,
        } as any,
      }),
    onSuccess: () => {
      toast.success("Scope updated.");
      queryClient.invalidateQueries({ queryKey: ["client-scope", clientId] });
    },
    onError: (e: any) => toast.error(e?.message ?? "That didn't save."),
  });

  if (isLoading) return <p className="text-sm text-muted-foreground">Loading…</p>;
  if (isError || !data) {
    return (
      <p className="text-sm text-muted-foreground">
        {(error as any)?.message ?? "That client isn't available."}
      </p>
    );
  }

  const activeSow = (data.sows ?? []).find((s: any) => s.status === "active") ?? null;
  const included = data.services.filter((s: any) => s.status === "included").length;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-3xl">{data.client.name}</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            {data.client.msa_signed_on
              ? `Master agreement signed ${data.client.msa_signed_on}. `
              : "Master agreement date not recorded. "}
            {included} service{included === 1 ? "" : "s"} in scope.
          </p>
        </div>
        <Button asChild variant="outline" size="sm">
          <Link to="/admin/contracts">Back to clients</Link>
        </Button>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Statements of work</CardTitle>
          <CardDescription>
            Each engagement is governed by its own statement of work. Ending one leaves the others
            running.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {(data.sows ?? []).map((sow: any) => (
            <div key={sow.id} className="flex flex-wrap items-center gap-2 rounded-md border p-3">
              <div>
                <p className="text-sm font-medium">{sow.title}</p>
                <p className="text-xs text-muted-foreground">
                  {sow.sow_type} · {sow.effective_date ?? "no start date"} ·{" "}
                  {sow.notice_days}-day notice
                </p>
              </div>
              <Badge className="ml-auto" variant={sow.status === "active" ? "default" : "secondary"}>
                {sow.status}
              </Badge>
            </div>
          ))}
          <div className="grid gap-2 sm:grid-cols-4">
            <div className="sm:col-span-2">
              <Label htmlFor="sow-title">Title</Label>
              <Input
                id="sow-title"
                value={sowTitle}
                onChange={(e) => setSowTitle(e.target.value)}
                placeholder="SPV Statement of Work"
              />
            </div>
            <div>
              <Label>Type</Label>
              <Select value={sowType} onValueChange={setSowType}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="spv">SPV</SelectItem>
                  <SelectItem value="fund">Fund</SelectItem>
                  <SelectItem value="administration">Administration</SelectItem>
                  <SelectItem value="other">Other</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label htmlFor="sow-date">Start date</Label>
              <Input
                id="sow-date"
                type="date"
                value={effective}
                onChange={(e) => setEffective(e.target.value)}
              />
            </div>
            <div className="sm:col-span-4">
              <Button
                size="sm"
                disabled={sowTitle.trim().length < 2 || createSow.isPending}
                onClick={() => createSow.mutate()}
              >
                Add statement of work
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {SERVICE_CATEGORIES.map((category) => {
        const rows = data.services.filter((s: any) => s.category === category.key);
        if (!rows.length) return null;
        return (
          <section key={category.key} className="space-y-2">
            <h2 className="text-xl">{category.label}</h2>
            <div className="space-y-2">
              {rows.map((service: any) => (
                <div key={service.key} className="rounded-md border p-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <div className="min-w-48">
                      <p className="text-sm font-medium">{service.name}</p>
                      <p className="text-xs text-muted-foreground">{service.description}</p>
                    </div>
                    {service.material ? <Badge variant="outline">Material</Badge> : null}
                    <Badge variant={statusTone(service.status)}>{statusLabel(service.status)}</Badge>
                    <div className="ml-auto flex items-center gap-2">
                      <div className="w-44">
                        <Select
                          value={service.status === "unset" ? undefined : service.status}
                          onValueChange={(status) =>
                            change.mutate({
                              serviceKey: service.key,
                              status,
                              sowId: activeSow?.id ?? null,
                            })
                          }
                          disabled={!data.canManage}
                        >
                          <SelectTrigger>
                            <SelectValue placeholder="Set scope" />
                          </SelectTrigger>
                          <SelectContent>
                            {ENTITLEMENT_STATUSES.map((s) => (
                              <SelectItem key={s.value} value={s.value}>
                                {s.label}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() =>
                          setExpanded(expanded === service.key ? null : service.key)
                        }
                      >
                        {expanded === service.key ? "Hide" : "Who does what"}
                      </Button>
                    </div>
                  </div>
                  {expanded === service.key ? (
                    <div className="mt-3">
                      <ResponsibilityMatrix service={service} />
                    </div>
                  ) : null}
                </div>
              ))}
            </div>
          </section>
        );
      })}

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Contracted fees</CardTitle>
          <CardDescription>
            What this client actually pays, kept separate from the current published price list.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-2">
          {(data.pricing ?? []).length === 0 ? (
            <p className="text-sm text-muted-foreground">No contracted fees recorded yet.</p>
          ) : (
            (data.pricing ?? []).map((p: any) => (
              <div key={p.id} className="flex flex-wrap items-center gap-2 rounded-md border p-3">
                <span className="text-sm">{p.label}</span>
                <span className="ml-auto text-sm">
                  {money(p.contracted_cents)}{" "}
                  {p.standard_cents && p.standard_cents !== p.contracted_cents ? (
                    <span className="text-xs text-muted-foreground line-through">
                      {money(p.standard_cents)}
                    </span>
                  ) : null}
                </span>
              </div>
            ))
          )}
        </CardContent>
      </Card>

      {!data.canManage ? (
        <p className="text-xs text-muted-foreground">
          You can see this scope but not change it. Scope, pricing and entitlement changes need
          legal, compliance, finance, client success or admin authority.
        </p>
      ) : null}
    </div>
  );
}

export function ScopeNote() {
  return (
    <Textarea className="hidden" readOnly value="" aria-hidden />
  );
}
