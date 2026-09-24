import { useMutation, useQuery } from "@tanstack/react-query";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { REQUEST_INTENTS, getMyServices, submitIntakeRequest } from "@/lib/client-services.functions";
import { categoryLabel, listServiceCatalog } from "@/lib/service-catalog.functions";
import { Link } from "@tanstack/react-router";
import { HelpTip } from "@/components/help-tip";
import { FUND_TYPES, PROFESSIONAL_DETERMINATION_NOTE, REQUEST_GROUPS, setupSchemaFor } from "@/lib/client-portal-model";

export const Route = createFileRoute("/_authenticated/client/services/request")({
  head: () => ({
    meta: [
      { title: "What would you like to do? — Harmonious" },
      {
        name: "description",
        content:
          "Tell Harmonious what you need — launch a fund or SPV, add a service, add an entity, move across, file something or get transaction support.",
      },
      { property: "og:title", content: "What would you like to do? — Harmonious" },
      {
        property: "og:description",
        content: "Tell Harmonious what you need and we'll scope the right services.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: RequestRouter,
});

const money = (cents: number) =>
  `$${(cents / 100).toLocaleString("en-US", { maximumFractionDigits: 0 })}`;

function RequestRouter() {
  const navigate = useNavigate();
  const loadServices = useServerFn(getMyServices);
  const loadCatalogue = useServerFn(listServiceCatalog);
  const submit = useServerFn(submitIntakeRequest);

  const [intent, setIntent] = useState<string | null>(null);
  const [entityId, setEntityId] = useState<string>("none");
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [summary, setSummary] = useState("");
  const [picked, setPicked] = useState<string[]>([]);

  const mine = useQuery({ queryKey: ["my-services"], queryFn: () => loadServices() });
  const catalogue = useQuery({
    queryKey: ["service-catalogue"],
    queryFn: () => loadCatalogue({ data: {} }),
  });

  const chosen = REQUEST_INTENTS.find((i) => i.value === intent);

  const mutation = useMutation({
    mutationFn: () =>
      submit({
        data: {
          intent: intent as any,
          entityId: entityId === "none" ? null : entityId,
          summary,
          answers,
          requestedServiceKeys: picked,
        },
      }),
    onSuccess: () => {
      toast.success("Thanks — we'll come back with the services, cost and timing.");
      void navigate({ to: "/client/services" });
    },
    onError: (e: any) => toast.error(e?.message ?? "Could not send the request."),
  });

  if (!chosen) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">What would you like to do?</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Pick the closest option. We'll ask a few questions and suggest the right services.
          </p>
        </div>
        {REQUEST_GROUPS.map((g) => (
          <section key={g.key} className="space-y-2">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">{g.label}</h2>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {g.intents.map((v) => REQUEST_INTENTS.find((i) => i.value === v)).filter(Boolean).map((i) => (
                <button
                  key={i!.value}
                  type="button"
                  onClick={() => { setIntent(i!.value); setAnswers({}); }}
                  className="rounded-lg border p-4 text-left transition hover:border-primary hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <p className="font-medium">{i!.label}</p>
                  <p className="mt-1 text-sm text-muted-foreground">{i!.blurb}</p>
                </button>
              ))}
            </div>
          </section>
        ))}
      </div>
    );
  }

  const suggested = (catalogue.data?.services ?? []).filter((s) =>
    (chosen.suggests as readonly string[]).some((k) => s.key.includes(k) || s.category === k),
  );
  const rest = (catalogue.data?.services ?? []).filter((s) => !suggested.includes(s));

  const toggle = (key: string) =>
    setPicked((p) => (p.includes(key) ? p.filter((k) => k !== key) : [...p, key]));

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{chosen.label}</h1>
          <p className="mt-1 text-sm text-muted-foreground">{chosen.blurb}</p>
        </div>
        <Button size="sm" variant="ghost" onClick={() => setIntent(null)}>
          Choose something else
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">A few questions</CardTitle>
          <CardDescription>Only what we need to scope this properly.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {(mine.data?.entities ?? []).length > 0 && (
            <div>
              <Label className="text-xs">Which entity does this relate to?</Label>
              <Select value={entityId} onValueChange={setEntityId}>
                <SelectTrigger>
                  <SelectValue placeholder="Not tied to one entity" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Not tied to one entity</SelectItem>
                  {(mine.data?.entities ?? []).map((e) => (
                    <SelectItem key={e.id} value={e.id}>
                      {e.legalName}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
          {chosen.value === "launch_fund" || chosen.value === "launch_spv" ? (
            <div className="rounded-md border border-dashed p-3 text-sm">
              <p className="font-medium">I already have an MSA/SOW</p>
              <p className="text-xs text-muted-foreground">
                Pick an agreement we already hold, or upload one. Anything read from it is marked "Found in agreement" and must be confirmed.
              </p>
              <Button asChild size="sm" variant="outline" className="mt-2">
                <Link to="/client/agreements">Choose or upload an agreement</Link>
              </Button>
            </div>
          ) : null}
          {chosen.value === "launch_fund" ? (
            <div>
              <Label className="text-xs">What type of fund are you setting up?</Label>
              <Select value={answers["fund_type"] ?? ""} onValueChange={(v) => setAnswers({ ...answers, fund_type: v })}>
                <SelectTrigger><SelectValue placeholder="Choose a fund type" /></SelectTrigger>
                <SelectContent>
                  {FUND_TYPES.map((f) => <SelectItem key={f.value} value={f.value}>{f.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          ) : null}
          {(chosen.value === "launch_spv" || (chosen.value === "launch_fund" && answers["fund_type"])
            ? setupSchemaFor(chosen.value === "launch_spv" ? "spv" : "fund", answers["fund_type"])
            : chosen.questions
          ).map((q: any) => (
            <div key={q.key}>
              <Label className="text-xs">
                {q.label}
                {q.helpKey ? <HelpTip helpKey={q.helpKey} label={q.label} /> : null}
              </Label>
              <Input
                value={answers[q.key] ?? ""}
                onChange={(e) => setAnswers({ ...answers, [q.key]: e.target.value })}
                placeholder={q.professional ? PROFESSIONAL_DETERMINATION_NOTE : undefined}
              />
            </div>
          ))}
          <div>
            <Label className="text-xs">Anything else we should know?</Label>
            <Textarea
              rows={3}
              value={summary}
              onChange={(e) => setSummary(e.target.value)}
              placeholder="A sentence or two is plenty."
            />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Services you might need</CardTitle>
          <CardDescription>
            Tick anything that looks right — we'll confirm the final list and price before anything
            is agreed.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-2">
          {[...suggested, ...rest].slice(0, 24).map((s) => (
            <label
              key={s.id}
              className="flex cursor-pointer items-start gap-3 rounded-md border p-3"
            >
              <Checkbox checked={picked.includes(s.key)} onCheckedChange={() => toggle(s.key)} />
              <span className="text-sm">
                <span className="font-medium">{s.name}</span>
                <span className="block text-xs text-muted-foreground">
                  {categoryLabel(s.category)}
                  {s.standardPriceCents > 0 ? ` · from ${money(s.standardPriceCents)}` : ""}
                </span>
              </span>
            </label>
          ))}
        </CardContent>
      </Card>

      <Button
        disabled={mutation.isPending || summary.trim().length < 3}
        onClick={() => mutation.mutate()}
      >
        Send to Harmonious
      </Button>
    </div>
  );
}
