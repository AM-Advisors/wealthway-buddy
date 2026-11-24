import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { investmentPartiesFn, inviteCoOwnerFn } from "@/lib/investment-parties.functions";

const STATUS: Record<string, string> = { approved: "Done", review: "In review", pending: "In progress", not_started: "Not started" };

/** Everyone on a joint, trust or company investment: emails, access, checks, documents and activity. */
export function InvestmentPartiesCard({ onboardingId }: { onboardingId: string }) {
  const list = useServerFn(investmentPartiesFn);
  const invite = useServerFn(inviteCoOwnerFn);
  const qc = useQueryClient();
  const key = ["investment-parties", onboardingId];
  const q = useQuery({ queryKey: key, queryFn: () => list({ data: { onboardingId } }), retry: false });
  if (q.isError || !q.data || q.data.parties.length < 2) return null;
  return (
    <Card>
      <CardHeader><CardTitle className="text-lg">Parties on this investment</CardTitle>
        <p className="text-sm text-muted-foreground">Everyone connected to this account, what they can open and what's still waiting on them. Activity shows recorded events only.</p>
      </CardHeader>
      <CardContent className="space-y-4">
        {q.data.parties.map((p) => (
          <div key={p.personId} className="space-y-2 rounded-md border p-3">
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-medium">{p.name}</span>
              {p.roles.map((r) => <Badge key={r} variant="secondary" className="capitalize">{r}</Badge>)}
              {p.ownershipPercent != null && <Badge variant="outline">{p.ownershipPercent}%</Badge>}
              {p.signer && <Badge variant="outline">Signer</Badge>}
              {p.w9Signer && <Badge variant="outline">W-9 signer</Badge>}
            </div>
            <div className="grid gap-1 text-sm sm:grid-cols-2">
              <span>Email: {p.email ?? "none on file"}</span>
              <span>Login: {p.login}</span>
              <span>Access: {p.accessLabel}</span>
              <span>ID check: {STATUS[p.kyc] ?? p.kyc} · AML: {STATUS[p.aml] ?? p.aml}</span>
              <span>SSN: {p.ssnOnFile ? "On file" : "Not on file"} · ID card: {p.idCards ? "On file" : "None"}</span>
            </div>
            {p.documents.length > 0 && (
              <ul className="text-sm">{p.documents.map((d, i) => <li key={i}>{d.title}: <span className={d.status === "Signed" ? "text-primary" : "text-muted-foreground"}>{d.status}</span></li>)}</ul>
            )}
            {p.activity.length > 0 && (
              <details className="text-sm"><summary className="cursor-pointer text-muted-foreground">Recent activity</summary>
                <ul className="mt-1 space-y-0.5">{p.activity.map((a, i) => <li key={i}>{new Date(a.at).toLocaleString()} · {a.text}</li>)}</ul>
              </details>
            )}
            {p.nextAction === "invite" && (
              <Button size="sm" onClick={async () => {
                try { const r: any = await invite({ data: { onboardingId, personId: p.personId } }); toast.success(r?.emailSent ? `Done and saved: invite sent to ${p.email}.` : "Saved, but the email didn't send."); qc.invalidateQueries({ queryKey: key }); }
                catch (e: any) { toast.error(e?.message ?? "Couldn't send the invite."); }
              }}>Send sign-up invite</Button>
            )}
            {p.nextAction === "id_check" && <p className="text-sm text-muted-foreground">Next: ID check for {p.name}.</p>}
            {p.nextAction === "sign" && <p className="text-sm text-muted-foreground">Waiting on {p.name} to sign.</p>}
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
