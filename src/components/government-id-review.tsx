import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { getGovernmentIdReview, getGovernmentIdReviewUrl } from "@/lib/government-id.functions";
import { ID_SIDE_LABELS, maskDocumentNumber, type IdSide } from "@/lib/government-id";
import { projectGovernmentIdReview } from "@/lib/government-id-review-model";
import { verificationLabel } from "@/lib/verification-status";

const TYPE_LABEL: Record<string, string> = {
  passport: "Passport",
  drivers_license: "Driver's license",
  state_id: "State ID",
};

/** Harmonious reviewers only; renders nothing for anyone the server refuses. */
export function GovernmentIdReview({ investorUserId }: { investorUserId: string }) {
  const load = useServerFn(getGovernmentIdReview);
  const open = useServerFn(getGovernmentIdReviewUrl);
  const { data, isError } = useQuery({
    queryKey: ["government-id-review", investorUserId],
    queryFn: () => load({ data: { investorUserId } }),
    retry: false,
  });
  if (isError || !data || data.items.length === 0) return null;

  async function view(id: string) {
    try {
      const { url } = await open({ data: { id } });
      window.open(url, "_blank", "noopener,noreferrer");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not open that file.");
    }
  }

  return (
    <Card className="mx-auto mt-6 max-w-6xl">
      <CardHeader>
        <CardTitle><h2 className="font-semibold leading-none tracking-tight">Government ID review</h2></CardTitle>
        <CardDescription>Restricted to Harmonious identity reviewers. Links expire after two minutes.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {projectGovernmentIdReview(data.items).map((item) => {
          const active = item.files.filter((f) => f.status === "active");
          const history = item.files.filter((f) => f.status === "superseded");
          return (
            <div key={item.applicationId} className="rounded-md border p-4 text-sm">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="font-medium">{item.fund}</p>
                <Badge variant="secondary">Review: {verificationLabel(item.reviewStatus)}</Badge>
              </div>
              <dl className="mt-3 grid gap-2 sm:grid-cols-3">
                <Row k="Document type" v={item.documentType ? TYPE_LABEL[item.documentType] ?? item.documentType : "Not recorded"} />
                <Row k="Issuing country" v={item.issuingCountry ?? "Not recorded"} />
                <Row k="Expiration" v={item.expiration ?? "Not recorded"} />
                <Row k="Document number" v={maskDocumentNumber(item.last4)} />
                <Row k="ID evidence" v={item.usesLogin ? "Approved login identity check" : active.length ? "Uploaded copy" : item.providedByVerification ? "Provided through verification" : "Not recorded"} />
                <Row k="Verification" v={verificationLabel(item.providerStatus)} />
              </dl>
              {item.usesLogin && (
                <details className="mt-3 text-xs text-muted-foreground">
                  <summary className="cursor-pointer">Original investment check</summary>
                  <p className="mt-2">Recorded status: {verificationLabel(item.originalProviderStatus)}. Identity is satisfied by the approved login check.</p>
                </details>
              )}
              {active.length > 0 && (
                <div className="mt-3 flex flex-wrap gap-2">
                  {active.map((f) => (
                    <Button key={f.id} size="sm" variant="outline" onClick={() => view(f.id)}>
                      View ID · {ID_SIDE_LABELS[f.side as IdSide] ?? f.side}
                    </Button>
                  ))}
                </div>
              )}
              {history.length > 0 && (
                <p className="mt-3 text-xs text-muted-foreground">
                  {history.length} earlier file{history.length === 1 ? "" : "s"} replaced and kept on record.
                </p>
              )}
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}

function Row({ k, v }: { k: string; v: string }) {
  return (
    <div>
      <dt className="text-xs text-muted-foreground">{k}</dt>
      <dd>{v}</dd>
    </div>
  );
}
