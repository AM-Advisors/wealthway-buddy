import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Panel } from "@/components/sales/sales-ui";
import { MkPage, fmt, mkHead } from "@/components/marketing-ui";
import { AUDIENCE_SOURCES, SOURCE_LABEL, parseCsvEmails, type AudienceSource } from "@/lib/marketing-model";
import { createMarketingAudience, getMarketingAudiences } from "@/lib/marketing.functions";

export const Route = createFileRoute("/_authenticated/marketing_/audiences")({
  head: mkHead("Audiences", "Email lists built from sales contacts, clients, investors and imported lists."),
  component: Audiences,
});

function Audiences() {
  const qc = useQueryClient();
  const load = useServerFn(getMarketingAudiences);
  const create = useServerFn(createMarketingAudience);
  const q = useQuery({ queryKey: ["mk-audiences"], queryFn: () => load(), retry: false });
  const [name, setName] = useState("");
  const [sources, setSources] = useState<AudienceSource[]>([]);
  const [csv, setCsv] = useState("");
  const m = useMutation({
    mutationFn: () => create({ data: { name, sources, csv: sources.includes("csv") ? csv : null } }),
    onSuccess: (r) => { toast.success(`Audience created with ${r.members} people`); setName(""); setSources([]); setCsv(""); qc.invalidateQueries({ queryKey: ["mk-audiences"] }); },
    onError: (e) => toast.error((e as Error).message),
  });
  return (
    <MkPage title="Audiences" intro="Each audience is a snapshot of email addresses. Unsubscribed people are skipped automatically at send time.">
      <div className="grid gap-6 md:grid-cols-[1fr_360px]">
        <Panel title="Your audiences">
          {q.isLoading && <p className="text-sm text-muted-foreground">Loading…</p>}
          {q.error && <p className="text-sm text-destructive">{(q.error as Error).message}</p>}
          {q.data?.length === 0 && <p className="text-sm text-muted-foreground">No audiences yet.</p>}
          <ul className="divide-y">{(q.data ?? []).map((a: any) => (
            <li key={a.id} className="flex items-center justify-between py-2 text-sm">
              <div><p className="font-medium">{a.name}</p><p className="text-xs text-muted-foreground">{a.sources.map((s: AudienceSource) => SOURCE_LABEL[s]).join(", ")} · {fmt(a.created_at)}</p></div>
              <span>{a.members} people</span>
            </li>))}</ul>
        </Panel>
        <Panel title="New audience">
          <div className="space-y-3">
            <div><Label>Name</Label><Input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Fund managers – Q4 newsletter" /></div>
            <div className="space-y-2">{AUDIENCE_SOURCES.map((s) => (
              <label key={s} className="flex items-center gap-2 text-sm"><Checkbox checked={sources.includes(s)} onCheckedChange={(v) => setSources((x) => v ? [...x, s] : x.filter((y) => y !== s))} />{SOURCE_LABEL[s]}</label>
            ))}</div>
            {sources.includes("csv") && (<div>
              <Label>Paste CSV or upload</Label>
              <input type="file" accept=".csv,text/csv" className="mb-2 block text-sm" onChange={async (e) => { const f = e.target.files?.[0]; if (f) setCsv(await f.text()); }} />
              <Textarea rows={5} value={csv} onChange={(e) => setCsv(e.target.value)} placeholder="email,name" />
              <p className="mt-1 text-xs text-muted-foreground">{parseCsvEmails(csv).length} valid emails found. Only import people who agreed to hear from Harmonious.</p>
            </div>)}
            <Button onClick={() => m.mutate()} disabled={m.isPending || !name.trim() || sources.length === 0}>{m.isPending ? "Building…" : "Create audience"}</Button>
          </div>
        </Panel>
      </div>
    </MkPage>
  );
}
