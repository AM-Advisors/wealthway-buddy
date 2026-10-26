import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { cancelProfessionalRequestFn, createProfessionalRequestFn, listProfessionalRequestsFn, resendProfessionalRequestFn } from "@/lib/accreditation-professional.functions";
import { PROFESSIONAL_ROLES, type ProfessionalRole } from "@/lib/accreditation-evidence-options";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

const STATUS: Record<string, string> = { requested: "Sent", uploaded: "Uploaded", expired: "Expired", canceled: "Canceled" };

/** Ask a CPA, attorney, adviser or broker-dealer to upload the letter directly. */
export function ProfessionalRequestPanel({ onboardingId }: { onboardingId: string | undefined }) {
  const qc = useQueryClient();
  const list = useServerFn(listProfessionalRequestsFn);
  const create = useServerFn(createProfessionalRequestFn);
  const resend = useServerFn(resendProfessionalRequestFn);
  const cancel = useServerFn(cancelProfessionalRequestFn);
  const key = ["accreditation-pro-requests", onboardingId];
  const q = useQuery({ queryKey: key, queryFn: () => list({ data: { onboardingId: onboardingId! } }), enabled: !!onboardingId });
  const [f, setF] = useState({ name: "", firm: "", role: "" as ProfessionalRole | "", email: "" });
  const [busy, setBusy] = useState<string | null>(null);

  if (!onboardingId) return null;
  const run = async (id: string, fn: () => Promise<unknown>, ok: string) => {
    setBusy(id);
    try { await fn(); toast.success(ok); qc.invalidateQueries({ queryKey: key }); qc.invalidateQueries({ queryKey: ["accreditation"] }); }
    catch (e) { toast.error(e instanceof Error ? e.message : "Something went wrong"); }
    finally { setBusy(null); }
  };
  const send = () => {
    if (!f.role || f.name.trim().length < 2 || !/^\S+@\S+\.\S+$/.test(f.email)) { toast.error("Add their name, role and email."); return; }
    void run("new", () => create({ data: { onboardingId, name: f.name, firm: f.firm, role: f.role as ProfessionalRole, email: f.email } }), "Request sent.").then(() => setF({ name: "", firm: "", role: "", email: "" }));
  };

  return (
    <div className="space-y-4 rounded-md border p-4">
      <div>
        <p className="text-sm font-medium">Ask my CPA, lawyer or adviser to send it</p>
        <p className="text-sm text-muted-foreground">We'll email them a private link to upload a signed letter. They don't need an account, and they only see your name and the fund name.</p>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1"><Label htmlFor="pro-name">Their name</Label><Input id="pro-name" maxLength={160} value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} /></div>
        <div className="space-y-1"><Label htmlFor="pro-firm">Firm</Label><Input id="pro-firm" maxLength={160} value={f.firm} onChange={(e) => setF({ ...f, firm: e.target.value })} /></div>
        <div className="space-y-1"><Label>Role</Label>
          <Select value={f.role} onValueChange={(v) => setF({ ...f, role: v as ProfessionalRole })}>
            <SelectTrigger><SelectValue placeholder="Select role" /></SelectTrigger>
            <SelectContent>{Object.entries(PROFESSIONAL_ROLES).map(([v, l]) => <SelectItem key={v} value={v}>{l}</SelectItem>)}</SelectContent>
          </Select>
        </div>
        <div className="space-y-1"><Label htmlFor="pro-email">Their email</Label><Input id="pro-email" type="email" maxLength={254} value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} /></div>
      </div>
      <Button type="button" size="sm" disabled={busy === "new"} onClick={send}>{busy === "new" ? "Sending…" : "Send request"}</Button>
      {(q.data ?? []).length > 0 ? (
        <ul className="divide-y rounded-md border text-sm">
          {(q.data ?? []).map((r: any) => (
            <li key={r.id} className="flex flex-wrap items-center justify-between gap-2 p-3">
              <span><span className="font-medium">{r.professional_name}</span> <span className="text-muted-foreground">{r.professional_email}</span></span>
              <span className="flex items-center gap-2">
                <Badge variant={r.status === "uploaded" ? "default" : "secondary"}>{STATUS[r.status] ?? r.status}</Badge>
                {r.status === "requested" || r.status === "expired" ? <Button type="button" size="sm" variant="outline" disabled={busy === r.id} onClick={() => run(r.id, () => resend({ data: { requestId: r.id } }), "Request resent.")}>Resend</Button> : null}
                {r.status === "requested" ? <Button type="button" size="sm" variant="ghost" disabled={busy === r.id} onClick={() => run(r.id, () => cancel({ data: { requestId: r.id } }), "Request canceled.")}>Cancel</Button> : null}
              </span>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
