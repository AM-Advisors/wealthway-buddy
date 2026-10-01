import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { CheckCircle2, Circle, Clock } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { REQUEST_INTENTS, getMyIntakeRequest, updateIntakeAnswers } from "@/lib/client-services.functions";
import { setupSchemaFor } from "@/lib/client-portal-model";

export const Route = createFileRoute("/_authenticated/client/services/requests/$requestId")({
  head: () => ({
    meta: [
      { title: "Your request — Harmonious" },
      { name: "description", content: "Track and manage a request you sent to Harmonious." },
      { property: "og:title", content: "Your request — Harmonious" },
      { property: "og:description", content: "Track and manage a request you sent to Harmonious." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: RequestDetail,
});

const ORDER = ["submitted", "in_review", "scoped", "converted"];
// reached = status index at which the step counts as done
const STEPS = [
  { label: "Request received", owner: "You", reached: 0 },
  { label: "Harmonious scoping", owner: "Harmonious", reached: 2 },
  { label: "Proposal / SOW sent", owner: "Harmonious", reached: 2 },
  { label: "Client approval", owner: "You", reached: 3 },
  { label: "Setup started", owner: "Harmonious", reached: 3 },
];

function RequestDetail() {
  const { requestId } = Route.useParams();
  const qc = useQueryClient();
  const load = useServerFn(getMyIntakeRequest);
  const save = useServerFn(updateIntakeAnswers);
  const q = useQuery({ queryKey: ["my-intake", requestId], queryFn: () => load({ data: { id: requestId } }) });
  const [answers, setAnswers] = useState<Record<string, string>>({});
  useEffect(() => {
    if (q.data) setAnswers((q.data.request.answers ?? {}) as Record<string, string>);
  }, [q.data]);

  const m = useMutation({
    mutationFn: () =>
      save({ data: { id: requestId, answers, requestedServiceKeys: q.data?.request.requested_service_keys ?? [] } }),
    onSuccess: () => {
      toast.success("Changes saved.");
      void qc.invalidateQueries({ queryKey: ["my-intake", requestId] });
    },
    onError: (e: any) => toast.error(e?.message ?? "Could not save."),
  });

  if (q.isLoading) return <p className="text-sm text-muted-foreground">Loading…</p>;
  if (q.error || !q.data) return <p className="text-sm text-destructive">Couldn't load this request.</p>;
  const r = q.data.request;
  const declined = r.status === "declined";
  const idx = ORDER.indexOf(r.status);
  const editable = r.status === "submitted";
  const label = REQUEST_INTENTS.find((i) => i.value === r.intent)?.label ?? r.intent;
  const schema =
    r.intent === "launch_spv" || r.intent === "launch_fund"
      ? setupSchemaFor(r.intent === "launch_spv" ? "spv" : "fund", (r.answers ?? {})["fund_type"])
      : [];
  const labelOf = (k: string) =>
    schema.find((f) => f.key === k)?.label ??
    (k === "investor_eligibility" ? "Investor eligibility (from exemption)" : k.replace(/_/g, " "));
  const keys = Array.from(new Set([...schema.map((f) => f.key), ...Object.keys(answers)])).filter((k) => k !== "fund_type");
  const firstOpen = STEPS.findIndex((s) => idx < s.reached);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <Link to="/client/services" className="text-xs text-muted-foreground hover:underline">← Your services</Link>
          <h1 className="text-2xl font-semibold tracking-tight">{label}</h1>
          {r.summary && <p className="mt-1 text-sm text-muted-foreground">{r.summary}</p>}
        </div>
        <Badge variant={declined ? "destructive" : "secondary"}>{String(r.status).replace("_", " ")}</Badge>
      </div>

      <Card>
        <CardHeader><CardTitle className="text-base">Progress</CardTitle></CardHeader>
        <CardContent className="space-y-2">
          {declined ? (
            <p className="text-sm text-muted-foreground">Harmonious closed this request. Send us a message if you'd like to revisit it.</p>
          ) : (
            STEPS.map((s, i) => {
              const done = idx >= s.reached;
              const current = i === firstOpen;
              return (
                <div key={s.label} className="flex items-center gap-3 text-sm">
                  {done ? <CheckCircle2 className="size-4 text-primary" /> : current ? <Clock className="size-4" /> : <Circle className="size-4 text-muted-foreground" />}
                  <span className={done ? "" : "text-muted-foreground"}>{s.label}</span>
                  {current && <Badge variant="outline">{s.owner === "Harmonious" ? "Harmonious — pending" : "Waiting on you"}</Badge>}
                </div>
              );
            })
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Your details</CardTitle>
          <CardDescription>
            {editable
              ? "You can update these until Harmonious starts scoping. Every change is kept on record."
              : "Harmonious has started — send a message to change anything."}
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-3 sm:grid-cols-2">
          {keys.map((k) => (
            <div key={k}>
              <Label className="text-xs capitalize">{labelOf(k)}</Label>
              {editable && k !== "investor_eligibility" ? (
                <Input value={answers[k] ?? ""} onChange={(e) => setAnswers({ ...answers, [k]: e.target.value })} />
              ) : (
                <p className="text-sm">{answers[k] || "—"}</p>
              )}
            </div>
          ))}
          {editable && (
            <div className="sm:col-span-2">
              <Button size="sm" onClick={() => m.mutate()} disabled={m.isPending}>Save changes</Button>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-base">Services requested</CardTitle></CardHeader>
        <CardContent className="flex flex-wrap gap-2">
          {(r.requested_service_keys ?? []).length === 0 ? (
            <p className="text-sm text-muted-foreground">None picked — Harmonious will suggest.</p>
          ) : (
            (r.requested_service_keys as string[]).map((k) => <Badge key={k} variant="secondary">{k.replace(/_/g, " ")}</Badge>)
          )}
        </CardContent>
      </Card>
    </div>
  );
}
