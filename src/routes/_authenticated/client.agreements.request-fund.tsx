import { useMutation, useQuery } from "@tanstack/react-query";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { ArrowLeft } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { getAgreementsHome, requestNewFund } from "@/lib/agreements.functions";
import { listPricingCatalogue } from "@/lib/agreements-catalogue.functions";

export const Route = createFileRoute("/_authenticated/client/agreements/request-fund")({
  component: RequestFundPage,
});

function RequestFundPage() {
  const home = useServerFn(getAgreementsHome);
  const catalogue = useServerFn(listPricingCatalogue);
  const submit = useServerFn(requestNewFund);
  const navigate = useNavigate();

  const { data: homeData } = useQuery({
    queryKey: ["agreements-home"],
    queryFn: () => home({ data: {} }),
  });
  const { data: services } = useQuery({
    queryKey: ["agreement-catalogue"],
    queryFn: () => catalogue(),
  });

  const [form, setForm] = useState({
    fundName: "",
    entityType: "Delaware LLC",
    jurisdiction: "Delaware",
    fundType: "Single-asset SPV",
    targetRaise: "",
    expectedInvestors: "",
    expectedInvestments: "",
    expectedLaunchDate: "",
    contactName: "",
    contactEmail: "",
    notes: "",
  });
  const [chosen, setChosen] = useState<string[]>([]);

  const set = (key: keyof typeof form) => (value: string) =>
    setForm((prev) => ({ ...prev, [key]: value }));

  const mutation = useMutation({
    mutationFn: () =>
      submit({
        data: {
          clientId: homeData!.clientId!,
          fundName: form.fundName.trim(),
          entityType: form.entityType || null,
          jurisdiction: form.jurisdiction || null,
          fundType: form.fundType || null,
          targetRaiseCents: form.targetRaise ? Math.round(Number(form.targetRaise) * 100) : null,
          expectedInvestors: form.expectedInvestors ? Number(form.expectedInvestors) : null,
          expectedInvestments: form.expectedInvestments || null,
          expectedLaunchDate: form.expectedLaunchDate || null,
          contactName: form.contactName || null,
          contactEmail: form.contactEmail || null,
          services: chosen,
          notes: form.notes || null,
        },
      }),
    onSuccess: (result: any) => {
      toast.success("Statement of work prepared for your review.");
      navigate({ to: "/client/agreements/sow/$sowId", params: { sowId: result.sowId } });
    },
    onError: (error: any) => toast.error(error?.message ?? "Could not submit the request."),
  });

  const toggle = (key: string) =>
    setChosen((prev) => (prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key]));

  return (
    <div className="space-y-6">
      <div>
        <Button asChild variant="ghost" size="sm" className="-ml-2 mb-1">
          <Link to="/client/agreements">
            <ArrowLeft className="mr-1 h-4 w-4" /> Agreements
          </Link>
        </Button>
        <h1 className="text-2xl font-semibold tracking-tight">Request a new fund or SPV</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Tell us about the vehicle. We prepare a statement of work on our current pricing, and you
          review it section by section before anything is signed.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Vehicle details</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <Field label="Fund or SPV name" value={form.fundName} onChange={set("fundName")} />
          <Field label="Entity type" value={form.entityType} onChange={set("entityType")} />
          <Field label="Jurisdiction" value={form.jurisdiction} onChange={set("jurisdiction")} />
          <Field label="Vehicle type" value={form.fundType} onChange={set("fundType")} />
          <Field
            label="Target raise (USD)"
            value={form.targetRaise}
            onChange={set("targetRaise")}
            type="number"
          />
          <Field
            label="Expected investors"
            value={form.expectedInvestors}
            onChange={set("expectedInvestors")}
            type="number"
          />
          <Field
            label="Expected investments"
            value={form.expectedInvestments}
            onChange={set("expectedInvestments")}
          />
          <Field
            label="Expected launch date"
            value={form.expectedLaunchDate}
            onChange={set("expectedLaunchDate")}
            type="date"
          />
          <Field label="Primary contact" value={form.contactName} onChange={set("contactName")} />
          <Field
            label="Contact email"
            value={form.contactEmail}
            onChange={set("contactEmail")}
            type="email"
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Services you want included</CardTitle>
          <CardDescription>
            Leave everything unticked to receive our standard package. Anything you don't include
            stays outside your scope and can be requested later.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-2 sm:grid-cols-2">
          {(services ?? []).map((s: any) => (
            <label key={s.key} className="flex items-start gap-2 rounded-md border p-3 text-sm">
              <Checkbox checked={chosen.includes(s.key)} onCheckedChange={() => toggle(s.key)} />
              <span>
                <span className="font-medium">{s.label}</span>
                {s.amountLabel && (
                  <span className="block text-xs text-muted-foreground">{s.amountLabel}</span>
                )}
              </span>
            </label>
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Anything else we should know</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <Textarea
            value={form.notes}
            onChange={(e) => set("notes")(e.target.value)}
            rows={4}
            placeholder="Timing, investor profile, special terms you expect to negotiate…"
          />
          <Button
            disabled={form.fundName.trim().length < 2 || mutation.isPending || !homeData?.clientId}
            onClick={() => mutation.mutate()}
          >
            {mutation.isPending ? "Preparing your SOW…" : "Submit request"}
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}

function Field({
  label,
  value,
  onChange,
  type = "text",
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  type?: string;
}) {
  return (
    <div className="space-y-1">
      <Label>{label}</Label>
      <Input type={type} value={value} onChange={(e) => onChange(e.target.value)} />
    </div>
  );
}
