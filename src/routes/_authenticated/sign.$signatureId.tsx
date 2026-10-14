import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { getSignatureFn, signDocumentFn } from "@/lib/fund-file-signing.functions";

export const Route = createFileRoute("/_authenticated/sign/$signatureId")({
  head: () => ({
    meta: [
      { title: "Sign document - Harmonious" },
      { name: "description", content: "Review and sign a fund document in Harmonious." },
      { property: "og:title", content: "Sign document - Harmonious" },
      { property: "og:description", content: "Review and sign your fund document." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: SignPage,
});

function SignPage() {
  const { signatureId } = Route.useParams();
  const qc = useQueryClient();
  const load = useServerFn(getSignatureFn);
  const sign = useServerFn(signDocumentFn);
  const key = ["sign-doc", signatureId];
  const q = useQuery({ queryKey: key, queryFn: () => load({ data: { id: signatureId } }), retry: false });
  const [name, setName] = useState("");
  const [ok, setOk] = useState(false);
  const m = useMutation({
    mutationFn: () => sign({ data: { id: signatureId, signedName: name, consent: true, userAgent: navigator.userAgent } }),
    onSuccess: (r) => { toast.success(r.done ? "Signed. The document is now fully signed." : "Signed. The fund manager will be asked to countersign."); qc.invalidateQueries({ queryKey: key }); },
    onError: (e: Error) => toast.error(e.message),
  });

  if (q.isPending) return <div className="mx-auto max-w-3xl p-6"><div className="h-40 animate-pulse rounded-xl bg-muted" /></div>;
  if (q.isError) return <div className="mx-auto max-w-3xl p-6 text-sm text-destructive">{(q.error as Error).message}</div>;
  const s = q.data;
  return (
    <div className="mx-auto max-w-3xl space-y-5 bg-background p-6">
      <div>
        <p className="text-sm text-muted-foreground">{s.fundName}</p>
        <h1 className="text-2xl font-semibold">{s.title}</h1>
      </div>
      <ol className="space-y-1 rounded-xl border p-4 text-sm">
        {(s.signers as any[]).map((r) => (
          <li key={r.signing_order} className="flex justify-between gap-2">
            <span>{r.signing_order}. {r.signer_role === "investor" ? "Investor" : "Fund manager"} — {r.signer_name}</span>
            <span className="text-muted-foreground">{r.status === "signed" ? `Signed ${new Date(r.signed_at).toLocaleDateString()}` : "Not signed yet"}</span>
          </li>
        ))}
      </ol>
      <div className="max-h-[60vh] overflow-y-auto whitespace-pre-wrap rounded-xl border p-5 text-sm leading-relaxed">{s.body || "This document has no text to show."}</div>
      {s.status === "signed" ? (
        <p className="rounded-xl border p-4 text-sm">You signed this on {new Date(s.signedAt!).toLocaleString()}.</p>
      ) : !s.yourTurn ? (
        <p className="rounded-xl border p-4 text-sm">The investor needs to sign first. We'll email you when it's your turn.</p>
      ) : (
        <div className="space-y-3 rounded-xl border p-4">
          <label className="flex items-start gap-2 text-sm"><input type="checkbox" className="mt-1" checked={ok} onChange={(e) => setOk(e.target.checked)} />I've read this document and agree that typing my name below is my legal signature.</label>
          <Input placeholder="Type your full name" value={name} onChange={(e) => setName(e.target.value)} />
          <div className="flex justify-end"><Button disabled={!ok || name.trim().length < 2 || m.isPending} onClick={() => m.mutate()}>{m.isPending ? "Signing…" : "Sign document"}</Button></div>
        </div>
      )}
    </div>
  );
}
