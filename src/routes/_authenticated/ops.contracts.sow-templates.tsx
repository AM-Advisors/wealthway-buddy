import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { listSowTemplates, saveSowTemplate, setSowTemplateStatus } from "@/lib/client-admin.functions";

export const Route = createFileRoute("/_authenticated/ops/contracts/sow-templates")({
  head: () => ({
    meta: [
      { title: "SOW templates — Harmonious operations" },
      { name: "description", content: "Versioned Harmonious SOW templates: draft, approved/current and retired." },
      { property: "og:title", content: "SOW templates — Harmonious operations" },
      { property: "og:description", content: "Versioned Harmonious SOW templates used to prepare draft SOWs." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: SowTemplates,
});

const TYPES = [
  { value: "fund_administration", label: "Fund administration" },
  { value: "spv_administration", label: "SPV administration" },
  { value: "client_services", label: "Client-wide services" },
];

function SowTemplates() {
  const load = useServerFn(listSowTemplates);
  const save = useServerFn(saveSowTemplate);
  const setStatus = useServerFn(setSowTemplateStatus);
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ["sow-templates"], queryFn: () => load() });
  const [f, setF] = useState({ name: "", engagementType: "fund_administration", version: "1", effectiveDate: new Date().toISOString().slice(0, 10), body: "" });
  const refresh = () => qc.invalidateQueries({ queryKey: ["sow-templates"] });
  const err = (e: unknown) => toast.error((e as Error).message);
  if (q.isPending) return <Skeleton className="m-6 h-40" />;
  if (q.error) return <p className="p-6 text-sm text-destructive">{(q.error as Error).message}</p>;
  const { caps, me, templates } = q.data as any;
  return (
    <div className="space-y-4 p-6">
      <header>
        <h1 className="font-heading text-2xl font-semibold">SOW templates</h1>
        <p className="text-sm text-muted-foreground">Draft SOWs use the latest approved, current version for the engagement type. Drafts and retired versions are never used. Executed SOWs stay on the version they were signed under.</p>
      </header>
      {caps.includes("manage_sows") ? (
        <Card>
          <CardHeader><CardTitle className="text-base">New draft version</CardTitle><CardDescription>A different person with contract-approval permission must approve it.</CardDescription></CardHeader>
          <CardContent className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1"><Label htmlFor="t-name">Template name</Label><Input id="t-name" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} /></div>
            <div className="space-y-1"><Label htmlFor="t-type">Engagement type</Label>
              <select id="t-type" className="h-9 w-full rounded-md border bg-background px-2 text-sm" value={f.engagementType} onChange={(e) => setF({ ...f, engagementType: e.target.value })}>
                {TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
              </select>
            </div>
            <div className="space-y-1"><Label htmlFor="t-ver">Version</Label><Input id="t-ver" type="number" min="1" value={f.version} onChange={(e) => setF({ ...f, version: e.target.value })} /></div>
            <div className="space-y-1"><Label htmlFor="t-eff">Effective date</Label><Input id="t-eff" type="date" value={f.effectiveDate} onChange={(e) => setF({ ...f, effectiveDate: e.target.value })} /></div>
            <div className="space-y-1 sm:col-span-2"><Label htmlFor="t-body">Template wording</Label><Textarea id="t-body" rows={6} value={f.body} onChange={(e) => setF({ ...f, body: e.target.value })} /></div>
            <Button className="sm:col-span-2 sm:w-fit" disabled={f.name.trim().length < 2} onClick={() => save({ data: { ...f, engagementType: f.engagementType as any, version: Number(f.version) } }).then(() => { toast.success("Draft template saved."); refresh(); }, err)}>Save draft</Button>
          </CardContent>
        </Card>
      ) : null}
      <Card>
        <CardHeader><CardTitle className="text-base">All versions</CardTitle></CardHeader>
        <CardContent className="overflow-x-auto">
          {!templates.length ? <p className="text-sm text-muted-foreground">No templates yet. Until one is approved, new funds show "SOW required — no approved current template available".</p> : (
            <table className="w-full text-sm">
              <thead className="text-left text-xs text-muted-foreground"><tr><th className="py-1">Template</th><th>Type</th><th>Version</th><th>Effective</th><th>Status</th><th>Approved</th><th>Retired</th><th /></tr></thead>
              <tbody>
                {templates.map((t: any) => (
                  <tr key={t.id} className="border-t">
                    <td className="py-1.5">{t.name}</td>
                    <td>{TYPES.find((x) => x.value === t.engagement_type)?.label ?? t.engagement_type}</td>
                    <td>v{t.version}</td>
                    <td>{t.effective_date}</td>
                    <td><Badge variant={t.status === "approved" ? "default" : "secondary"}>{t.status === "approved" ? "Approved / Current" : t.status === "retired" ? "Retired" : "Draft"}</Badge></td>
                    <td>{t.approved_at ? t.approved_at.slice(0, 10) : "—"}</td>
                    <td>{t.retired_at ? t.retired_at.slice(0, 10) : "—"}</td>
                    <td className="space-x-1 text-right">
                      {caps.includes("approve_terms") && t.status === "draft" && t.created_by !== me ? <Button size="sm" onClick={() => setStatus({ data: { id: t.id, status: "approved" } }).then(refresh, err)}>Approve</Button> : null}
                      {caps.includes("approve_terms") && t.status === "approved" ? <Button size="sm" variant="ghost" onClick={() => setStatus({ data: { id: t.id, status: "retired" } }).then(refresh, err)}>Retire</Button> : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
