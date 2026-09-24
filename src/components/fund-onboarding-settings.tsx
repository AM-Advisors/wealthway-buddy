import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";

import { SignatureBlockEditor } from "@/components/signature-block-editor";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { APPLIES_TO_OPTIONS } from "@/lib/prepared-investor-workflow";
import { getFundOnboardingSettings, saveDocumentSigningConfig } from "@/lib/fund-onboarding.functions";

/** Investor Onboarding Settings for one fund. Verification and accreditation are read-only. */
export function FundOnboardingSettings({ fundId }: { fundId: string }) {
  const qc = useQueryClient();
  const load = useServerFn(getFundOnboardingSettings);
  const save = useServerFn(saveDocumentSigningConfig);
  const [open, setOpen] = useState(false);
  const [preparing, setPreparing] = useState<string | null>(null);
  const q = useQuery({ queryKey: ["fund-onboarding-settings", fundId], queryFn: () => load({ data: { offeringId: fundId } }), enabled: open, retry: false });

  const update = async (doc: any, patch: Partial<{ signingMode: "investor_only" | "dual"; countersignerUserId: string | null; investorRequired: boolean; appliesTo: string[] }>) => {
    try {
      await save({
        data: {
          documentId: doc.id,
          signingMode: patch.signingMode ?? doc.signingMode,
          countersignerUserId: patch.countersignerUserId !== undefined ? patch.countersignerUserId : doc.countersignerUserId,
          investorRequired: patch.investorRequired ?? doc.investorRequired,
          ...(patch.appliesTo ? { appliesTo: patch.appliesTo as any } : {}),
        },
      });
      toast.success("Saved");
      void qc.invalidateQueries({ queryKey: ["fund-onboarding-settings", fundId] });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not save");
    }
  };

  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between gap-3">
        <div>
          <CardTitle className="text-base">Investor Onboarding Settings</CardTitle>
          <CardDescription>What investors in this fund complete, who signs, and which wire instructions they see.</CardDescription>
        </div>
        <Button size="sm" variant="outline" onClick={() => setOpen(!open)}>{open ? "Hide" : "Open"}</Button>
      </CardHeader>
      {open && (
        <CardContent className="space-y-5 text-sm">
          {q.isLoading && <p className="text-muted-foreground">Loading…</p>}
          {q.error && <p className="text-muted-foreground">{(q.error as Error).message}</p>}
          {q.data && (
            <>
              <section><p className="font-medium">Verification</p><p className="text-muted-foreground">{q.data.verification}</p></section>
              <section><p className="font-medium">Accreditation</p><p className="text-muted-foreground">{q.data.accreditation} Set by the offering; it can't be weakened here.</p></section>
              <section className="space-y-2">
                <p className="font-medium">Documents &amp; signing</p>
                {q.data.documents.length === 0 && <p className="text-muted-foreground">No fund documents yet.</p>}
                {q.data.documents.map((doc) => (
                  <div key={doc.id} className="space-y-2 rounded-md border p-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span className="font-medium">{doc.title}</span>
                      {doc.requiresSignature ? (
                        <Badge variant={doc.readiness.ready ? "secondary" : "outline"}>{doc.readiness.ready ? `Ready · v${doc.templateVersion}` : "Needs preparation"}</Badge>
                      ) : <Badge variant="outline">For review only</Badge>}
                    </div>
                    <div className="flex flex-wrap items-center gap-1 text-xs">
                      <span className="text-muted-foreground">Applies to:</span>
                      {q.data.canConfigureApplicability ? (
                        <>
                          <Button size="sm" variant={doc.appliesTo.length === 0 ? "default" : "outline"} className="h-6 px-2 text-xs" onClick={() => update(doc, { appliesTo: [] })}>All investors</Button>
                          {APPLIES_TO_OPTIONS.map(([v, l]) => {
                            const on = doc.appliesTo.includes(v);
                            return <Button key={v} size="sm" variant={on ? "default" : "outline"} className="h-6 px-2 text-xs" onClick={() => update(doc, { appliesTo: on ? doc.appliesTo.filter((x: string) => x !== v) : [...doc.appliesTo, v] })}>{l}</Button>;
                          })}
                        </>
                      ) : <span>{doc.appliesTo.length ? doc.appliesTo.map((v: string) => APPLIES_TO_OPTIONS.find((o) => o[0] === v)?.[1] ?? v).join(", ") : "All investors"} (set by Harmonious)</span>}
                    </div>
                    {doc.requiresSignature && (
                      <div className="flex flex-wrap gap-2">
                        <Select value={doc.signingMode} onValueChange={(v) => update(doc, { signingMode: v as any })}>
                          <SelectTrigger className="w-56"><SelectValue /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="investor_only">Investor signature only</SelectItem>
                            <SelectItem value="dual">Investor, then Fund Manager</SelectItem>
                          </SelectContent>
                        </Select>
                        {doc.signingMode === "dual" && (
                          <Select value={doc.countersignerUserId ?? ""} onValueChange={(v) => update(doc, { countersignerUserId: v })}>
                            <SelectTrigger className="w-56"><SelectValue placeholder="Authorized signatory" /></SelectTrigger>
                            <SelectContent>
                              {q.data.countersigners.map((c) => <SelectItem key={c.userId} value={c.userId}>{c.name}</SelectItem>)}
                            </SelectContent>
                          </Select>
                        )}
                        <Button size="sm" variant="outline" onClick={() => setPreparing(preparing === doc.id ? null : doc.id)}>Prepare for Signature</Button>
                      </div>
                    )}
                    {!doc.readiness.ready && <p className="text-xs text-muted-foreground">Still needed: {doc.readiness.missing.join(", ")}.</p>}
                    {preparing === doc.id && <SignatureBlockEditor documentId={doc.id} onClose={() => { setPreparing(null); void qc.invalidateQueries({ queryKey: ["fund-onboarding-settings", fundId] }); }} />}
                  </div>
                ))}
              </section>
              <section>
                <p className="font-medium">Funding</p>
                {q.data.funding.released ? (
                  <p className="text-muted-foreground">Released instructions: {q.data.funding.bankName ?? "Bank"} {q.data.funding.accountMasked}. Changes go through Harmonious banking approval.</p>
                ) : (
                  <p className="text-muted-foreground">Wire instructions haven't been approved and released by Harmonious yet. Investors won't see a Fund step until they are.</p>
                )}
              </section>
            </>
          )}
        </CardContent>
      )}
    </Card>
  );
}
