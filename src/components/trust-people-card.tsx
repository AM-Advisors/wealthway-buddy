import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { FileImage } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { investmentPartiesFn, inviteCoOwnerFn } from "@/lib/investment-parties.functions";
import { investmentIdentityFn, personIdCardUrlFn } from "@/lib/person-id-cards.functions";
import { mergeTrustPeople } from "@/lib/trust-people-model";
import { Reveal, UploadId } from "@/components/investment-identity-card";

const STATUS: Record<string, string> = { approved: "Done", review: "In review", pending: "In progress", not_started: "Not started" };

/** One card per person on the investment: role, contact, SSN status, login, checks, ID cards and activity together.
 * "staff" adds full-number reveal and ID uploads (server still decides); "investor" is read-only. */
export function TrustPeopleCard({ onboardingId, mode = "staff", title = "People on this investment" }: { onboardingId: string; mode?: "staff" | "investor"; title?: string }) {
  const list = useServerFn(investmentPartiesFn);
  const ident = useServerFn(investmentIdentityFn);
  const openUrl = useServerFn(personIdCardUrlFn);
  const invite = useServerFn(inviteCoOwnerFn);
  const qc = useQueryClient();
  const pKey = ["investment-parties", onboardingId];
  const iKey = ["investment-identity", onboardingId];
  const parties = useQuery({ queryKey: pKey, queryFn: () => list({ data: { onboardingId } }), retry: false });
  const identity = useQuery({ queryKey: iKey, queryFn: () => ident({ data: { onboardingId } }), retry: false, enabled: mode === "staff" });
  if (parties.isError || !parties.data || parties.data.parties.length === 0) return null;
  const idData: any = identity.data ?? null;
  const people = mergeTrustPeople(parties.data.parties as any, idData?.people ?? null);
  const cardsFor = (id: string): any[] => idData?.people?.find((x: any) => x.personId === id)?.cards ?? [];

  return (
    <Card>
      <CardHeader><CardTitle className="text-lg">{title}</CardTitle>
        <p className="text-sm text-muted-foreground">{mode === "staff" ? "Each person once, with everything about them in one place. Viewing a full number or ID card is recorded." : "Everyone on this investment and what's still needed from each person."}</p>
      </CardHeader>
      <CardContent className="space-y-4">
        {mode === "staff" && idData?.entity ? (
          <div className="rounded-md border p-3"><div className="font-medium">{idData.entity.name}</div>
            <Reveal onboardingId={onboardingId} entity last4={idData.entity.einLast4} label="Tax ID" /></div>
        ) : null}
        {people.map((p) => (
          <div key={p.personId} className="space-y-2 rounded-md border p-3">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-base font-medium">{p.name}</span>
              {p.roles.map((r) => <Badge key={r} variant="secondary" className="capitalize">{r}</Badge>)}
              {p.ownershipPercent != null && <Badge variant="outline">{p.ownershipPercent}%</Badge>}
              {p.signer && <Badge variant="outline">Signer</Badge>}
              {p.w9Signer && <Badge variant="outline">Signs the W-9</Badge>}
            </div>
            <div className="grid gap-1 text-sm sm:grid-cols-2">
              <span>Email: {p.email ?? "Needed"}</span>
              <span>Login: {p.login}{mode === "staff" ? ` · ${p.accessLabel}` : ""}</span>
              <span>ID check: {STATUS[p.kyc] ?? p.kyc} · Background: {STATUS[p.aml] ?? p.aml}</span>
              {mode === "staff" && p.hasIdentity ? <Reveal onboardingId={onboardingId} personId={p.personId} last4={p.ssnLast4} label="SSN" /> : <span>SSN: {p.ssnLabel}</span>}
            </div>
            {p.documents.length > 0 && (
              <ul className="text-sm">{p.documents.map((d, i) => <li key={i}>{d.title}: <span className={d.status === "Signed" ? "text-primary" : "text-muted-foreground"}>{d.status}</span></li>)}</ul>
            )}
            {mode === "staff" && p.hasIdentity ? (
              <div className="space-y-1">
                {cardsFor(p.personId).length ? <ul className="space-y-1">{cardsFor(p.personId).map((c: any) => (
                  <li key={c.id} className="flex flex-wrap items-center gap-2 text-sm"><FileImage className="h-4 w-4 text-muted-foreground" />
                    <span>{c.label}{c.idLast4 ? ` · ending ${c.idLast4}` : ""}{c.expiresOn ? ` · expires ${c.expiresOn}` : ""}</span>
                    <Button size="sm" variant="link" onClick={async () => { try { const r = await openUrl({ data: { onboardingId, id: c.id } }); window.open(r.url, "_blank", "noopener"); } catch (e: any) { toast.error(e?.message ?? "Couldn't open the ID."); } }}>Open</Button>
                  </li>))}</ul> : <p className="text-sm text-muted-foreground">No ID card on file yet.</p>}
                <UploadId onboardingId={onboardingId} personId={p.personId} onDone={() => qc.invalidateQueries({ queryKey: iKey })} />
              </div>
            ) : null}
            {p.activity.length > 0 && (
              <details className="text-sm"><summary className="cursor-pointer text-muted-foreground">Recent activity (recorded events only)</summary>
                <ul className="mt-1 space-y-0.5">{p.activity.map((a, i) => <li key={i}>{new Date(a.at).toLocaleString()} · {a.text}</li>)}</ul>
              </details>
            )}
            {mode === "staff" && p.nextAction === "invite" && (
              <Button size="sm" onClick={async () => {
                try { const r: any = await invite({ data: { onboardingId, personId: p.personId } }); toast.success(r?.emailSent ? `Done and saved: invite sent to ${p.email}.` : "Saved, but the email didn't send."); qc.invalidateQueries({ queryKey: pKey }); }
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
