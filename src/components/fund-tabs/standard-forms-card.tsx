import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { generateStandardFormFn, standardFormsFn, uploadStandardFormFn } from "@/lib/standard-forms.functions";
import { fmtDate } from "./shared";

const ILPA = [
  { title: "ILPA Model LPA (whole-of-fund and deal-by-deal)", url: "https://ilpa.org/industry-guidance/model-limited-partnership-agreement/" },
  { title: "ILPA Reporting Template and other model documents", url: "https://ilpa.org/industry-guidance/templates-standards-model-documents/" },
];
const FIELDS = "fund_name, legal_name, entity_type, state_formed, fund_type, min_investment, management_fee_pct, management_fee_basis, carry_pct, hurdle_pct, manager_name, manager_email, date";

export function StandardFormsCard({ fundId, onGenerated }: { fundId: string; onGenerated: () => void }) {
  const qc = useQueryClient();
  const load = useServerFn(standardFormsFn);
  const gen = useServerFn(generateStandardFormFn);
  const q = useQuery({ queryKey: ["standard-forms", fundId], queryFn: () => load({ data: { fundId } }) });
  const [editing, setEditing] = useState<{ key: string; title: string } | null>(null);
  const m = useMutation({
    mutationFn: (key: any) => gen({ data: { fundId, key } }),
    onSuccess: (r) => {
      toast.success(r.missing.length ? `Draft created. Fill in: ${r.missing.join(", ")}` : "Draft created in Documents");
      onGenerated();
    },
    onError: (e: Error) => toast.error(e.message),
  });
  if (!q.data) return null;
  const d = q.data;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">{d.isSpv ? "SPV documents" : "ILPA templates"}</CardTitle>
        <CardDescription>
          {d.isSpv
            ? "Harmonious's standard Subscription Agreement, Operating Agreement and PPM, filled in with this SPV's details. Review before sending."
            : "Regular funds use ILPA's model documents. Download from ILPA, complete with counsel, then upload the final version above."}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-2">
        {d.isSpv ? d.forms.map((f) => (
          <div key={f.key} className="flex flex-wrap items-center justify-between gap-2 rounded-md border p-3 text-sm">
            <div>
              <p className="font-medium">{f.title}</p>
              <p className="text-xs text-muted-foreground">{f.version ? `Harmonious form v${f.version} · updated ${fmtDate(f.updatedAt)}` : "Not uploaded by Harmonious yet"}</p>
            </div>
            <div className="flex gap-2">
              {d.staff && <Button size="sm" variant="ghost" onClick={() => setEditing(f)}>{f.version ? "Upload new version" : "Upload form"}</Button>}
              {f.version ? <Button size="sm" variant="outline" disabled={m.isPending} onClick={() => m.mutate(f.key)}>Generate</Button> : <Badge variant="outline">Waiting on Harmonious</Badge>}
            </div>
          </div>
        )) : ILPA.map((l) => (
          <a key={l.url} href={l.url} target="_blank" rel="noreferrer" className="flex items-center justify-between rounded-md border p-3 text-sm hover:bg-muted">
            <span className="font-medium">{l.title}</span><span className="text-xs text-muted-foreground">Open on ilpa.org</span>
          </a>
        ))}
      </CardContent>
      {editing && <UploadDialog form={editing} onClose={() => { setEditing(null); qc.invalidateQueries({ queryKey: ["standard-forms", fundId] }); }} />}
    </Card>
  );
}

function UploadDialog({ form, onClose }: { form: { key: string; title: string }; onClose: () => void }) {
  const up = useServerFn(uploadStandardFormFn);
  const [body, setBody] = useState("");
  const [note, setNote] = useState("");
  const m = useMutation({
    mutationFn: () => up({ data: { key: form.key as any, body, note } }),
    onSuccess: (r) => { toast.success(`Saved as version ${r.version}`); onClose(); },
    onError: (e: Error) => toast.error(e.message),
  });
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Harmonious {form.title}</DialogTitle>
          <DialogDescription>Paste the form text or load a .txt/.md file. Use {"{{field}}"} where SPV details go: {FIELDS}. Each upload is a new version used for every SPV; earlier versions are kept.</DialogDescription>
        </DialogHeader>
        <input type="file" accept=".txt,.md,text/plain,text/markdown" onChange={async (e) => { const f = e.target.files?.[0]; if (f) setBody(await f.text()); }} />
        <Textarea rows={14} value={body} onChange={(e) => setBody(e.target.value)} placeholder="This Subscription Agreement is entered into with {{legal_name}}..." />
        <Input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Version note (optional)" />
        <DialogFooter><Button variant="outline" onClick={onClose}>Cancel</Button><Button disabled={m.isPending || body.trim().length < 20} onClick={() => m.mutate()}>Save version</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
