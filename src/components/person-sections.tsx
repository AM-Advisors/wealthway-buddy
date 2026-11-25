import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { investmentPartiesFn, inviteCoOwnerFn } from "@/lib/investment-parties.functions";
import { investmentIdentityFn } from "@/lib/person-id-cards.functions";
import { sendKycLinkFn } from "@/lib/person-records.functions";
import { mergeTrustPeople } from "@/lib/trust-people-model";

const STATUS: Record<string, string> = { approved: "Done", review: "In review", pending: "In progress", not_started: "Not started" };

/** One dropdown per person: their checks and actions ("actions") or their recorded activity ("activity").
 * Actions reuse existing staff-only senders; the server still decides who may trigger them. */
export function PersonSections({ onboardingId, variant, staff }: { onboardingId: string; variant: "actions" | "activity"; staff: boolean }) {
  const list = useServerFn(investmentPartiesFn);
  const ident = useServerFn(investmentIdentityFn);
  const invite = useServerFn(inviteCoOwnerFn);
  const sendKyc = useServerFn(sendKycLinkFn);
  const qc = useQueryClient();
  const pKey = ["investment-parties", onboardingId];
  const parties = useQuery({ queryKey: pKey, queryFn: () => list({ data: { onboardingId } }), retry: false });
  const identity = useQuery({ queryKey: ["investment-identity", onboardingId], queryFn: () => ident({ data: { onboardingId } }), retry: false, enabled: staff });
  if (parties.isError || !parties.data || parties.data.parties.length === 0) return null;
  const people = mergeTrustPeople(parties.data.parties as any, (identity.data as any)?.people ?? null);
  const act = async (fn: () => Promise<unknown>, ok: string) => { try { await fn(); toast.success(ok); qc.invalidateQueries({ queryKey: pKey }); } catch (e: any) { toast.error(e?.message ?? "Couldn't do that."); } };

  return (
    <Card>
      <CardHeader><CardTitle className="text-base">{variant === "actions" ? "By person" : "Activity by person"}</CardTitle>
        <p className="text-sm text-muted-foreground">Open a person to see {variant === "actions" ? "their checks and what to do next" : "what's been recorded for them"}.</p>
      </CardHeader>
      <CardContent className="space-y-2">
        {people.map((p) => (
          <details key={p.personId} className="rounded-md border">
            <summary className="flex cursor-pointer flex-wrap items-center gap-2 p-3">
              <span className="font-medium">{p.name}</span>
              {p.roles.map((r) => <Badge key={r} variant="secondary" className="capitalize">{r}</Badge>)}
              <span className="ml-auto text-sm text-muted-foreground">{variant === "actions" ? `ID ${STATUS[p.kyc] ?? p.kyc} · Background ${STATUS[p.aml] ?? p.aml}` : `${p.activity.length} event${p.activity.length === 1 ? "" : "s"}`}</span>
            </summary>
            <div className="space-y-2 border-t p-3 text-sm">
              {variant === "actions" ? <>
                <div className="grid gap-1 sm:grid-cols-2">
                  <span>ID check: {STATUS[p.kyc] ?? p.kyc}</span><span>Background: {STATUS[p.aml] ?? p.aml}</span>
                  <span>Email: {p.email ?? "Needed"}</span><span>Login: {p.login}</span><span>SSN: {p.ssnLabel}</span>
                  {p.signer ? <span>Signer{p.w9Signer ? " · signs the W-9" : ""}</span> : null}
                </div>
                {p.documents.length ? <ul>{p.documents.map((d, i) => <li key={i}>{d.title}: {d.status}</li>)}</ul> : null}
                <div className="flex flex-wrap gap-2">
                  {staff && p.kyc !== "approved" && p.email ? <Button size="sm" variant="outline" onClick={() => act(() => sendKyc({ data: { personId: p.personId } }), `ID check link sent to ${p.email}`)}>Send ID check link</Button> : null}
                  {staff && p.nextAction === "invite" ? <Button size="sm" variant="outline" onClick={() => act(() => invite({ data: { onboardingId, personId: p.personId } }), `Sign-up invite sent to ${p.email}`)}>Send sign-up invite</Button> : null}
                  {p.kyc === "approved" && p.nextAction !== "invite" ? <span className="text-muted-foreground">Nothing to do for {p.name} right now.</span> : null}
                </div>
              </> : p.activity.length ? <ul className="space-y-0.5">{p.activity.map((a, i) => <li key={i}>{new Date(a.at).toLocaleString()} · {a.text}</li>)}</ul> : <p className="text-muted-foreground">Nothing recorded for {p.name} yet.</p>}
            </div>
          </details>
        ))}
      </CardContent>
    </Card>
  );
}
