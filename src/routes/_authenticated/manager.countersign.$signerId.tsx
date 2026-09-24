import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { countersignDetailFn } from "@/lib/fund-onboarding.functions";
import { SIGNING_STAGE_LABELS } from "@/lib/fund-onboarding-model";

export const Route = createFileRoute("/_authenticated/manager/countersign/$signerId")({
  head: () => ({
    meta: [
      { title: "Review & countersign — Harmonious" },
      { name: "description", content: "Countersign an investor's fund document after they have signed." },
      { property: "og:title", content: "Review & countersign — Harmonious" },
      { property: "og:description", content: "Countersign a fund document as the authorized fund signatory." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: CountersignPage,
});

function CountersignPage() {
  const { signerId } = Route.useParams();
  const load = useServerFn(countersignDetailFn);
  const [opening, setOpening] = useState(false);
  const q = useQuery({ queryKey: ["countersign", signerId], queryFn: () => load({ data: { signerId } }), retry: false });

  const open = async () => {
    setOpening(true);
    try {
      const r = await load({ data: { signerId, open: true } });
      if (r.url) window.location.href = r.url;
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not open signing.");
    } finally {
      setOpening(false);
    }
  };

  return (
    <main className="mx-auto max-w-2xl px-4 py-10">
      <Card>
        <CardHeader>
          <CardTitle>Review &amp; Countersign</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {q.isLoading && <p className="text-sm text-muted-foreground">Loading…</p>}
          {q.error && <p className="text-sm text-muted-foreground">{(q.error as Error).message}</p>}
          {q.data && (
            <>
              <dl className="grid gap-2 text-sm">
                <div><dt className="text-muted-foreground">Fund</dt><dd>{q.data.fundName}</dd></div>
                <div><dt className="text-muted-foreground">Document</dt><dd>{q.data.documentTitle}</dd></div>
                <div><dt className="text-muted-foreground">Investor</dt><dd>{q.data.investorName}</dd></div>
              </dl>
              <Badge variant="secondary">{SIGNING_STAGE_LABELS[q.data.stage]}</Badge>
              {q.data.canSign ? (
                <Button onClick={open} disabled={opening}>{opening ? "Opening…" : "Review & Countersign"}</Button>
              ) : (
                <p className="text-sm text-muted-foreground">{q.data.reason}</p>
              )}
              <p className="text-xs text-muted-foreground">
                You'll only see the document and the fields assigned to you. The document becomes fully executed once Box confirms both signatures.
              </p>
            </>
          )}
          <Link to="/portal" className="text-sm underline">Back</Link>
        </CardContent>
      </Card>
    </main>
  );
}
