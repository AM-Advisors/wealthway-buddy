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
import { EXEMPTIONS, FUND_TYPES, PROFESSIONAL_DETERMINATION_NOTE, REQUEST_GROUPS, coreServicesFor, defaultVehicle, eligibilityFor, setupSchemaFor } from "@/lib/client-portal-model";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { CalendarIcon } from "lucide-react";
import { format, parseISO } from "date-fns";

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
                  onClick={() => { setIntent(i!.value); const a: Record<string, string> = {}; if (i!.value === "launch_spv") a["vehicle_structure"] = defaultVehicle(i!.value); setAnswers(a); setPicked(coreServicesFor(a["vehicle_structure"])); }}
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

  const setField = (key: string, v: string) => {
    const a = { ...answers, [key]: v };
    if (key === "offering_exemption") a["investor_eligibility"] = eligibilityFor(v);
    setAnswers(a);
    if (key === "vehicle_structure" || key === "offering_exemption") {
      const before = coreServicesFor(answers["vehicle_structure"], answers["offering_exemption"]);
      const after = coreServicesFor(a["vehicle_structure"], a["offering_exemption"]);
      setPicked((p) => Array.from(new Set([...p.filter((k) => !before.includes(k)), ...after])));
    }
  };
  const coreKeys = coreServicesFor(answers["vehicle_structure"], answers["offering_exemption"]);
  const all = catalogue.data?.services ?? [];
  const core = all.filter((s) => coreKeys.includes(s.key));
  const addOns = [...suggested, ...rest].filter((s) => !coreKeys.includes(s.key));

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
              <Select value={answers["fund_type"] ?? ""} onValueChange={(v) => { const a: Record<string, string> = { ...answers, fund_type: v, vehicle_structure: defaultVehicle("launch_fund", v) }; setAnswers(a); setPicked(coreServicesFor(a["vehicle_structure"], a["offering_exemption"])); }}>
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
              <FieldInput field={q} value={answers[q.key] ?? ""} onChange={(v) => setField(q.key, v)} />
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
        <CardContent className="space-y-4">
          {core.length > 0 && (
            <div className="space-y-2">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Included with your setup</p>
              {core.map((s) => <ServiceRow key={s.id} s={s} checked={picked.includes(s.key)} onToggle={() => toggle(s.key)} />)}
            </div>
          )}
          <div className="space-y-2">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{core.length > 0 ? "Add-ons (à la carte)" : "Services"}</p>
            {addOns.slice(0, 24).map((s) => <ServiceRow key={s.id} s={s} checked={picked.includes(s.key)} onToggle={() => toggle(s.key)} />)}
          </div>
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

function ServiceRow({ s, checked, onToggle }: { s: any; checked: boolean; onToggle: () => void }) {
  return (
    <label className="flex cursor-pointer items-start gap-3 rounded-md border p-3">
      <Checkbox checked={checked} onCheckedChange={onToggle} />
      <span className="text-sm">
        <span className="font-medium">{s.name}</span>
        <span className="block text-xs text-muted-foreground">
          {categoryLabel(s.category)}
          {s.standardPriceCents > 0 ? ` · from ${money(s.standardPriceCents)}` : ""}
        </span>
      </span>
    </label>
  );
}

function FieldInput({ field, value, onChange }: { field: any; value: string; onChange: (v: string) => void }) {
  if (field.kind === "choice" || field.kind === "exemption") {
    const options: string[] = field.kind === "exemption" ? EXEMPTIONS.map((e) => e.value) : field.options ?? [];
    const isOther = value && !options.includes(value);
    const sel = isOther ? "Other" : value;
    return (
      <div className="space-y-2">
        <Select value={sel} onValueChange={(v) => onChange(v)}>
          <SelectTrigger><SelectValue placeholder="Choose…" /></SelectTrigger>
          <SelectContent>
            {options.map((o) => <SelectItem key={o} value={o}>{o}</SelectItem>)}
          </SelectContent>
        </Select>
        {sel === "Other" && field.kind === "choice" && (
          <Input placeholder="Please describe" value={isOther ? value : ""} onChange={(e) => onChange(e.target.value || "Other")} />
        )}
        {field.kind === "exemption" && value && (
          <div className="rounded-md border bg-muted p-3 text-xs">
            <p className="font-medium">Who can invest</p>
            <p className="mt-1 text-muted-foreground">{eligibilityFor(value)}</p>
            <p className="mt-1 text-muted-foreground">General guidance — counsel confirms.</p>
          </div>
        )}
      </div>
    );
  }
  if (field.kind === "date") {
    const d = value ? parseISO(value) : undefined;
    return (
      <Popover>
        <PopoverTrigger asChild>
          <Button variant="outline" className="w-full justify-start font-normal">
            <CalendarIcon className="mr-2 size-4" />
            {d ? format(d, "PPP") : <span className="text-muted-foreground">Pick a date</span>}
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-auto p-0" align="start">
          <Calendar mode="single" selected={d} onSelect={(x) => onChange(x ? format(x, "yyyy-MM-dd") : "")} initialFocus className="pointer-events-auto p-3" />
        </PopoverContent>
      </Popover>
    );
  }
  if (field.kind === "fee") {
    const unit = value.startsWith("$") ? "$" : "%";
    const num = value.replace(/[$%]/g, "");
    const emit = (n: string, u: string) => onChange(n ? (u === "$" ? `$${n}` : `${n}%`) : "");
    return (
      <div className="flex gap-2">
        <Select value={unit} onValueChange={(u) => emit(num, u)}>
          <SelectTrigger className="w-20"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="%">%</SelectItem>
            <SelectItem value="$">$</SelectItem>
          </SelectContent>
        </Select>
        <Input inputMode="decimal" value={num} placeholder={unit === "%" ? "e.g. 2" : "e.g. 25000"} onChange={(e) => emit(e.target.value.replace(/[^0-9.]/g, ""), unit)} />
      </div>
    );
  }
  return (
    <Input
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={field.professional ? PROFESSIONAL_DETERMINATION_NOTE : undefined}
    />
  );
}
