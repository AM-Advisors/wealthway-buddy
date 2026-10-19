import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { FileText } from "lucide-react";

import { acceptDealReviewNda, getDealReview, openDealReviewDocument } from "@/lib/deal-review.functions";
import { askDiligenceQuestion } from "@/lib/diligence.functions";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";

const money = (c: number | null | undefined) => (c == null ? null : `$${Math.round(c / 100).toLocaleString("en-US")}`);
const pct = (b: number | null | undefined) => (b == null ? null : `${b / 100}%`);
const yrs = (v: number | null | undefined) => (v == null ? null : `${v} years`);

/** Signed-in deal review on the investor link: asset, terms, documents and questions before committing. */
export function DealReview({ slug }: { slug: string }) {
  const qc = useQueryClient();
  const load = useServerFn(getDealReview);
  const accept = useServerFn(acceptDealReviewNda);
  const open = useServerFn(openDealReviewDocument);
  const ask = useServerFn(askDiligenceQuestion);
  const q = useQuery({ queryKey: ["deal-review", slug], queryFn: () => load({ data: { slug } }) });
  const [name, setName] = useState("");
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");

  const sign = useMutation({
    mutationFn: () => accept({ data: { slug, signer_name: name } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["deal-review", slug] }),
    onError: (e: any) => toast.error(e.message),
  });
  const view = useMutation({
    mutationFn: (id: string) => open({ data: { slug, id } }),
    onSuccess: (r) => window.open(r.url, "_blank", "noopener"),
    onError: (e: any) => toast.error(e.message),
  });
  const question = useMutation({
    mutationFn: () => ask({ data: { offering_id: q.data!.offeringId, subject, body } }),
    onSuccess: () => { toast.success("Your question was sent to the fund manager"); setSubject(""); setBody(""); },
    onError: () => toast.error("Questions open once you start your investment."),
  });

  if (q.isLoading) return <p className="text-sm text-muted-foreground">Loading the deal…</p>;
  if (q.isError || !q.data) return null;
  const d = q.data;
  const s: any = d.statement;
  const terms: [string, string | null][] = s ? [
    ["What you receive", s.security_type], ["Target raise", money(s.target_raise_cents)],
    ["Minimum investment", money(s.min_investment_cents)], ["Maximum investment", money(s.max_investment_cents)],
    ["Management fee", pct(s.management_fee_bps)], ["Carried interest", pct(s.carried_interest_bps)],
    ["Preferred return", pct(s.preferred_return_bps)], ["Fund term", yrs(s.fund_term_years)],
    ["Investment period", yrs(s.investment_period_years)],
  ] : [];
  const sections: [string, string | null][] = s ? [
    ["Capital calls", s.capital_call_terms], ["Distributions", s.distribution_policy],
    ["Fees and expenses", s.fees_and_expenses], ["Transfers", s.transfer_restrictions], ["Other terms", s.other_terms],
  ] : [];

  return (
    <div className="space-y-4">
      {d.closed ? <p role="status" className="rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm">This fund is closed to new investments.</p> : null}
      {d.intro ? <p className="whitespace-pre-wrap text-sm">{d.intro}</p> : null}

      {d.assets.length > 0 && (
        <Card>
          <CardHeader><CardTitle className="text-base">What the fund invests in</CardTitle></CardHeader>
          <CardContent className="space-y-2">
            {d.assets.map((a: any) => (
              <div key={a.id} className="rounded-md border p-3 text-sm">
                <p className="font-medium">{a.asset_name ?? a.issuer_name}</p>
                <p className="text-muted-foreground">{[a.issuer_name !== a.asset_name ? a.issuer_name : null, a.instrument, a.asset_class].filter(Boolean).join(" · ")}</p>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {s && (
        <Card>
          <CardHeader><CardTitle className="text-base">{s.headline || "Key terms"}</CardTitle>
            {s.summary ? <CardDescription className="whitespace-pre-wrap">{s.summary}</CardDescription> : null}
          </CardHeader>
          <CardContent className="space-y-4">
            <dl className="grid gap-3 sm:grid-cols-3">
              {terms.filter(([, v]) => v).map(([k, v]) => (
                <div key={k}><dt className="text-xs uppercase tracking-wide text-muted-foreground">{k}</dt><dd className="text-sm font-medium">{v}</dd></div>
              ))}
            </dl>
            {sections.filter(([, v]) => v?.trim()).map(([k, v]) => (
              <div key={k}><h3 className="text-sm font-semibold">{k}</h3><p className="whitespace-pre-wrap text-sm text-muted-foreground">{v}</p></div>
            ))}
          </CardContent>
        </Card>
      )}

      {d.hasRoom && !d.closed && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Fund documents</CardTitle>
            <CardDescription>Review only. Nothing here signs or commits you.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {d.ndaRequired && !d.ndaAccepted ? (
              <div className="space-y-3">
                <p className="max-h-48 overflow-y-auto whitespace-pre-wrap rounded-md border p-3 text-xs">{d.ndaText}</p>
                <Label htmlFor="deal-nda-name">Type your full legal name to accept</Label>
                <Input id="deal-nda-name" value={name} onChange={(e) => setName(e.target.value)} />
                <Button disabled={name.trim().length < 2 || sign.isPending} onClick={() => sign.mutate()}>Accept and view documents</Button>
              </div>
            ) : d.documents.length === 0 ? (
              <p className="text-sm text-muted-foreground">The fund manager hasn't shared documents for review yet.</p>
            ) : (
              d.documents.map((doc: any) => (
                <div key={doc.id} className="flex flex-wrap items-center justify-between gap-2 rounded-md border p-3">
                  <span className="flex items-start gap-2 text-sm"><FileText className="mt-0.5 h-4 w-4 shrink-0" />
                    <span>{doc.title}{doc.description ? <span className="block text-xs text-muted-foreground">{doc.description}</span> : null}</span>
                  </span>
                  <Button size="sm" variant="outline" disabled={view.isPending} onClick={() => view.mutate(doc.id)}>Open</Button>
                </div>
              ))
            )}
          </CardContent>
        </Card>
      )}

      {d.hasRoom && (
        <Card>
          <CardHeader><CardTitle className="text-base">Ask the fund manager</CardTitle></CardHeader>
          <CardContent className="space-y-2">
            <Input placeholder="Subject" value={subject} onChange={(e) => setSubject(e.target.value)} />
            <Textarea placeholder="Your question" value={body} onChange={(e) => setBody(e.target.value)} />
            <Button size="sm" disabled={subject.trim().length < 3 || body.trim().length < 3 || question.isPending} onClick={() => question.mutate()}>Send question</Button>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
