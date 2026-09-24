import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";

import { getMyDocumentsForReview, getMyPreparedInfo, markDocumentReviewed, reviewPreparedField } from "@/lib/prepared-investor.functions";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";

const show = (k: string, v: unknown) =>
  v == null || v === "" ? "—" : k.endsWith("_cents") ? `$${(Number(v) / 100).toLocaleString("en-US")}` : String(v).replace(/_/g, " ");
const err = (e: any) => String(e?.message ?? e);

/** "Confirm Your Information" — shown only when the investment was prepared for the investor. */
export function ConfirmYourInformation({ onboardingId, onChanged }: { onboardingId: string; onChanged?: () => void }) {
  const qc = useQueryClient();
  const load = useServerFn(getMyPreparedInfo);
  const review = useServerFn(reviewPreparedField);
  const q = useQuery({ queryKey: ["prepared-info", onboardingId], queryFn: () => load({ data: { onboardingId } }) });
  const [editing, setEditing] = useState<string | null>(null);
  const [value, setValue] = useState("");
  const [updated, setUpdated] = useState(false);
  const m = useMutation({
    mutationFn: (v: { key: string; action: "confirm" | "correct"; value?: string | number }) => review({ data: { onboardingId, ...v } }),
    onSuccess: (r) => {
      setEditing(null);
      if (r.requirementsUpdated) setUpdated(true);
      void qc.invalidateQueries({ queryKey: ["prepared-info", onboardingId] });
      void qc.invalidateQueries({ queryKey: ["prepared-docs", onboardingId] });
      onChanged?.();
    },
    onError: (e) => toast.error(err(e)),
  });
  const d = q.data;
  if (!d || !d.hasPrepared) return null;
  if (d.complete && !updated) return null;

  return (
    <Card id="confirm">
      <CardHeader>
        <CardTitle className="text-lg">Confirm Your Information</CardTitle>
        <CardDescription>Some information was provided when your investment was prepared. Review it for accuracy before continuing.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        {updated ? (
          <div className="rounded-md border border-primary/40 bg-primary/5 p-3 text-sm">
            <p className="font-medium">Your onboarding requirements were updated</p>
            <p className="text-muted-foreground">Based on the information you changed, there are additional items to complete.</p>
          </div>
        ) : null}
        {d.groups.map((g: any) => (
          <section key={g.group} className="space-y-2">
            <h3 className="text-sm font-medium">{g.label}</h3>
            {g.fields.map((f: any) => (
              <div key={f.key} className="flex flex-col gap-2 rounded-md border p-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="min-w-0">
                  <p className="text-xs text-muted-foreground">{f.label}</p>
                  {editing === f.key ? (
                    <Input autoFocus value={value} onChange={(e) => setValue(e.target.value)} className="mt-1" aria-label={f.label} />
                  ) : <p className="break-words text-sm">{show(f.key, f.value)}</p>}
                </div>
                <div className="flex shrink-0 gap-2">
                  {editing === f.key ? (
                    <>
                      <Button size="sm" disabled={m.isPending} onClick={() => m.mutate({ key: f.key, action: "correct", value: f.key.endsWith("_cents") ? Math.round(Number(value.replace(/[,$]/g, "")) * 100) : value })}>Save</Button>
                      <Button size="sm" variant="ghost" onClick={() => setEditing(null)}>Cancel</Button>
                    </>
                  ) : f.reviewed ? <span className="text-xs text-muted-foreground">Reviewed</span> : (
                    <>
                      <Button size="sm" variant="outline" disabled={m.isPending} onClick={() => m.mutate({ key: f.key, action: "confirm" })}>Confirm</Button>
                      <Button size="sm" variant="ghost" onClick={() => { setEditing(f.key); setValue(f.key.endsWith("_cents") ? String(Number(f.value ?? 0) / 100) : String(f.value ?? "")); }}>Correct</Button>
                    </>
                  )}
                </div>
              </div>
            ))}
          </section>
        ))}
      </CardContent>
    </Card>
  );
}

/** Review Document — must happen before Continue to Sign. Reviewing is never a signature. */
export function ReviewPreparedDocuments({ onboardingId }: { onboardingId: string }) {
  const qc = useQueryClient();
  const load = useServerFn(getMyDocumentsForReview);
  const mark = useServerFn(markDocumentReviewed);
  const q = useQuery({ queryKey: ["prepared-docs", onboardingId], queryFn: () => load({ data: { onboardingId } }) });
  const [open, setOpen] = useState<string | null>(null);
  const m = useMutation({
    mutationFn: (snapshotId: string) => mark({ data: { onboardingId, snapshotId } }),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["prepared-docs", onboardingId] }),
    onError: (e) => toast.error(err(e)),
  });
  const docs = q.data?.documents ?? [];
  if (!docs.length) return null;
  return (
    <Card id="documents-review">
      <CardHeader><CardTitle className="text-lg">Review Document</CardTitle><CardDescription>Check each completed agreement before you continue to sign.</CardDescription></CardHeader>
      <CardContent className="space-y-3">
        {docs.map((d: any) => (
          <div key={d.documentId} className="space-y-2 rounded-md border p-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-sm font-medium">{d.title}</p>
              <span className="text-xs text-muted-foreground">{d.blocker ?? "Ready to sign"}</span>
            </div>
            {d.missing.length ? (
              <div className="text-sm">
                <p className="font-medium">Document needs information</p>
                <ul className="list-disc pl-5 text-muted-foreground">{d.missing.map((x: any) => <li key={x.field}>{x.message}</li>)}</ul>
                <Button size="sm" variant="outline" className="mt-2" onClick={() => document.getElementById("confirm")?.scrollIntoView({ behavior: "smooth" })}>Complete Information</Button>
              </div>
            ) : (
              <>
                <Button size="sm" variant="ghost" onClick={() => setOpen(open === d.documentId ? null : d.documentId)}>{open === d.documentId ? "Hide" : "View completed document"}</Button>
                {open === d.documentId ? (
                  <dl className="grid gap-1 rounded bg-muted/40 p-3 text-sm sm:grid-cols-2">
                    {Object.entries(d.values as Record<string, string>).filter(([, v]) => v).map(([k, v]) => (
                      <div key={k}><dt className="text-xs text-muted-foreground">{k.replace(/_/g, " ")}</dt><dd className="break-words">{v}</dd></div>
                    ))}
                  </dl>
                ) : null}
                {d.blocker === "Please review the document before continuing to sign" && d.snapshotId ? (
                  <Button size="sm" disabled={m.isPending || open !== d.documentId} onClick={() => m.mutate(d.snapshotId)}>I've reviewed this document</Button>
                ) : null}
              </>
            )}
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
