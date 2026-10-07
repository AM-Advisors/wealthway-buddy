import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { myPrivacyRequests, submitPrivacyRequest } from "@/lib/privacy-requests.functions";

const KINDS = [
  { k: "access", l: "Download my data" },
  { k: "correction", l: "Correct my data" },
  { k: "deletion", l: "Delete my data" },
] as const;

export function PrivacyRequestsCard() {
  const qc = useQueryClient();
  const list = useServerFn(myPrivacyRequests);
  const submit = useServerFn(submitPrivacyRequest);
  const { data = [] } = useQuery({ queryKey: ["privacy-requests"], queryFn: () => list() });
  const [kind, setKind] = useState<(typeof KINDS)[number]["k"]>("access");
  const [details, setDetails] = useState("");
  const [busy, setBusy] = useState(false);
  return (
    <Card>
      <CardHeader>
        <CardTitle>Your privacy rights</CardTitle>
        <CardDescription>
          Ask for a copy of your data, a correction, or deletion. We reply within 30 days. Records we must keep by law (for example tax and fund records) are kept, and we'll tell you why.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex flex-wrap gap-2">
          {KINDS.map((x) => (
            <Button key={x.k} size="sm" variant={kind === x.k ? "default" : "outline"} onClick={() => setKind(x.k)}>{x.l}</Button>
          ))}
        </div>
        <Textarea placeholder="Anything we should know (optional)" value={details} maxLength={2000} onChange={(e) => setDetails(e.target.value)} />
        <Button
          disabled={busy}
          onClick={async () => {
            setBusy(true);
            try {
              await submit({ data: { kind, details } });
              setDetails("");
              toast.success("Request received. We'll reply within 30 days.");
              qc.invalidateQueries({ queryKey: ["privacy-requests"] });
            } catch (e) {
              toast.error((e as Error).message);
            } finally {
              setBusy(false);
            }
          }}
        >
          Send request
        </Button>
        {data.map((r) => (
          <div key={r.id} className="flex items-center justify-between border-t pt-2 text-sm">
            <span>{KINDS.find((x) => x.k === r.kind)?.l ?? r.kind} · {r.created_at.slice(0, 10)}</span>
            <Badge variant="secondary">{r.status.replace("_", " ")}</Badge>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
