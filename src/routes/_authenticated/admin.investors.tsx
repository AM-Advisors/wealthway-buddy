import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { toast } from "sonner";

import {
  listInvestors,
  setInvestorCheck,
  STEP_LABELS,
  updateInvestorDetails,
  type InvestorRow,
} from "@/lib/investor-directory.functions";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

export const Route = createFileRoute("/_authenticated/admin/investors")({
  head: () => ({
    meta: [
      { title: "Investor Database — Harmonious Admin" },
      {
        name: "description",
        content:
          "Every investor on file with the onboarding step they are on, plus manual editing of their contact, entity and commitment details.",
      },
      { property: "og:title", content: "Investor Database — Harmonious Admin" },
      {
        property: "og:description",
        content: "See every investor's onboarding step and correct their details by hand.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: InvestorDatabase,
  errorComponent: () => (
    <main className="mx-auto max-w-3xl p-6">
      <h1 className="text-2xl">Investor database</h1>
      <p className="mt-2 text-muted-foreground">
        This page could not be loaded. It is available to administrators only.
      </p>
    </main>
  ),
  notFoundComponent: () => <p className="p-6">Page not found.</p>,
});

const INVESTOR_TYPES = ["individual", "joint", "entity", "trust", "ira"] as const;

function money(cents: number | null | undefined) {
  if (cents === null || cents === undefined) return "—";
  return `$${(cents / 100).toLocaleString("en-US")}`;
}

function stepTone(step: string) {
  if (step === "funded") return "default" as const;
  if (step === "accreditation_approval" || step === "manager_approval") return "destructive" as const;
  return "secondary" as const;
}

function InvestorDatabase() {
  const queryClient = useQueryClient();
  const load = useServerFn(listInvestors);
  const saveDetails = useServerFn(updateInvestorDetails);
  const setCheck = useServerFn(setInvestorCheck);

  const [search, setSearch] = useState("");
  const [fund, setFund] = useState("all");
  const [step, setStep] = useState("all");
  const [editing, setEditing] = useState<InvestorRow | null>(null);
  const [form, setForm] = useState<Record<string, string>>({});
  const [note, setNote] = useState("");

  const { data, isLoading } = useQuery({
    queryKey: ["investor-directory"],
    queryFn: () => load(),
    refetchInterval: 60000,
  });

  const investors: InvestorRow[] = (data as any)?.investors ?? [];
  const funds: { id: string; name: string }[] = (data as any)?.funds ?? [];

  const save = useMutation({
    mutationFn: () =>
      saveDetails({
        data: {
          user_id: editing!.user_id,
          application_id: editing!.application_id,
          legal_name: form['legal_name'] ?? null,
          email: form['email'] ? form['email'] : null,
          phone: form['phone'] ?? null,
          entity_name: form['entity_name'] ?? null,
          investor_type: (form['investor_type'] || null) as any,
          address_line1: form['address_line1'] ?? null,
          address_line2: form['address_line2'] ?? null,
          city: form['city'] ?? null,
          region: form['region'] ?? null,
          postal_code: form['postal_code'] ?? null,
          country: form['country'] ?? null,
          commitment_cents: form['commitment'］ ? Math.round(Number(form['commitment']) * 100) : null,
        },
      }),
    onSuccess: () => {
      toast.success("Details saved.");
      setEditing(null);
      queryClient.invalidateQueries({ queryKey: ["investor-directory"] });
    },
    onError: (e: any) => toast.error(e?.message ?? "Could not save those details."),
  });

  const decide = useMutation({
    mutationFn: (vars: { id: string; decision: "approved" | "declined" | "review" }) =>
      setCheck({
        data: {
          application_id: vars.id,
          area: "accreditation",
          decision: vars.decision,
          notes: note.trim() ? note.trim() : null,
        },
      }),
    onSuccess: (_r, vars) => {
      toast.success(
        vars.decision === "approved"
          ? "Accreditation approved — this investor can now reach the wire step."
          : vars.decision === "declined"
            ? "Accreditation declined."
            : "Sent back for more review.",
      );
      setNote("");
      queryClient.invalidateQueries({ queryKey: ["investor-directory"] });
    },
    onError: (e: any) => toast.error(e?.message ?? "Could not record that decision."),
  });

  const rows = useMemo(
    () =>
      investors.filter((i) => {
        if (fund !== "all" && i.offering_id !== fund) return false;
        if (step !== "all" && i.step !== step) return false;
        if (search.trim()) {
          const term = search.trim().toLowerCase();
          const hay = `${i.legal_name ?? ""} ${i.email ?? ""} ${i.entity_name ?? ""} ${i.offeringName ?? ""}`;
          if (!hay.toLowerCase().includes(term)) return false;
        }
        return true;
      }),
    [investors, fund, step, search],
  );

  const awaitingAccreditation = investors.filter((i) => i.step === "accreditation_approval");

  function openEditor(row: InvestorRow) {
    setEditing(row);
    setForm({
      legal_name: row.legal_name ?? "",
      email: row.email ?? "",
      phone: row.phone ?? "",
      entity_name: row.entity_name ?? "",
      investor_type: row.investor_type ?? "",
      address_line1: row.address_line1 ?? "",
      address_line2: row.address_line2 ?? "",
      city: row.city ?? "",
      region: row.region ?? "",
      postal_code: row.postal_code ?? "",
      country: row.country ?? "",
      commitment:
        row.commitment_cents === null || row.commitment_cents === undefined
          ? ""
          : String(row.commitment_cents / 100),
    });
  }

  const field = (key: string) => ({
    value: form[key] ?? "",
    onChange: (e: React.ChangeEvent<HTMLInputElement>) =>
      setForm((prev) => ({ ...prev, [key]: e.target.value })),
  });

  return (
    <main className="mx-auto max-w-6xl p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl">Investor database</h1>
          <p className="mt-1 text-muted-foreground">
            Everyone on file, the step they're on right now, and a way to fix their details by hand.
          </p>
        </div>
        <Button asChild size="sm" variant="outline">
          <Link to="/admin">Back to the review queue</Link>
        </Button>
      </div>

      <Card className="mt-6">
        <CardHeader>
          <CardTitle className="text-base">Accreditation waiting on you</CardTitle>
          <CardDescription>
            Nobody reaches the wire step until you approve their accredited status.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {awaitingAccreditation.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nothing waiting for approval.</p>
          ) : (
            <>
              <Textarea
                rows={2}
                value={note}
                placeholder="Optional note recorded with your decision"
                onChange={(e) => setNote(e.target.value)}
              />
              {awaitingAccreditation.map((i) => (
                <div
                  key={i.user_id}
                  className="flex flex-wrap items-center justify-between gap-3 rounded-md border p-3"
                >
                  <div className="min-w-0">
                    <p className="font-medium">{i.legal_name ?? i.email ?? "Investor"}</p>
                    <p className="text-sm text-muted-foreground">
                      {i.offeringName ?? "Fund"} · commitment {money(i.commitment_cents)}
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Button
                      size="sm"
                      disabled={decide.isPending}
                      onClick={() =>
                        decide.mutate({ id: i.application_id as string, decision: "approved" })
                      }
                    >
                      Approve accreditation
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={decide.isPending}
                      onClick={() =>
                        decide.mutate({ id: i.application_id as string, decision: "declined" })
                      }
                    >
                      Decline
                    </Button>
                    {i.application_id && (
                      <Button asChild size="sm" variant="ghost">
                        <Link
                          to="/admin/$applicationId"
                          params={{ applicationId: i.application_id }}
                        >
                          Open file
                        </Link>
                      </Button>
                    )}
                  </div>
                </div>
              ))}
            </>
          )}
        </CardContent>
      </Card>

      <Card className="mt-6">
        <CardHeader>
          <CardTitle className="text-base">All investors ({rows.length})</CardTitle>
          <CardDescription>Search by name, email, entity or fund.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-3">
            <div className="space-y-1">
              <Label htmlFor="inv-search">Search</Label>
              <Input
                id="inv-search"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Name, email or entity"
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="inv-fund">Fund</Label>
              <select
                id="inv-fund"
                className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                value={fund}
                onChange={(e) => setFund(e.target.value)}
              >
                <option value="all">All funds</option>
                {funds.map((f) => (
                  <option key={f.id} value={f.id}>
                    {f.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-1">
              <Label htmlFor="inv-step">Step</Label>
              <select
                id="inv-step"
                className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                value={step}
                onChange={(e) => setStep(e.target.value)}
              >
                <option value="all">Every step</option>
                {Object.entries(STEP_LABELS).map(([key, text]) => (
                  <option key={key} value={key}>
                    {text}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {isLoading && <p className="text-sm text-muted-foreground">Loading…</p>}
          {!isLoading && rows.length === 0 && (
            <p className="text-sm text-muted-foreground">No investors match those filters.</p>
          )}

          <div className="space-y-2">
            {rows.map((i) => (
              <div
                key={i.user_id}
                className="flex flex-wrap items-center justify-between gap-3 rounded-md border p-3"
              >
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-medium">{i.legal_name ?? "Unnamed investor"}</span>
                    <Badge variant={stepTone(i.step)}>{STEP_LABELS[i.step] ?? i.step}</Badge>
                  </div>
                  <p className="mt-1 text-sm text-muted-foreground">
                    {i.email ?? "no email"}
                    {i.entity_name ? ` · ${i.entity_name}` : ""}
                    {i.offeringName ? ` · ${i.offeringName}` : " · no fund"}
                    {" · "}
                    {money(i.commitment_cents)}
                  </p>
                </div>
                <div className="flex gap-2">
                  <Button size="sm" variant="outline" onClick={() => openEditor(i)}>
                    Edit details
                  </Button>
                  {i.application_id && (
                    <Button asChild size="sm" variant="ghost">
                      <Link to="/admin/$applicationId" params={{ applicationId: i.application_id }}>
                        Open file
                      </Link>
                    </Button>
                  )}
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      <Dialog open={Boolean(editing)} onOpenChange={(open) => !open && setEditing(null)}>
        <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Edit investor details</DialogTitle>
            <DialogDescription>
              Corrections here update what the investor and your team see everywhere.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1 sm:col-span-2">
              <Label htmlFor="ed-name">Full legal name</Label>
              <Input id="ed-name" {...field("legal_name")} />
            </div>
            <div className="space-y-1">
              <Label htmlFor="ed-email">Email</Label>
              <Input id="ed-email" type="email" {...field("email")} />
            </div>
            <div className="space-y-1">
              <Label htmlFor="ed-phone">Phone</Label>
              <Input id="ed-phone" {...field("phone")} />
            </div>
            <div className="space-y-1">
              <Label htmlFor="ed-entity">Entity name</Label>
              <Input id="ed-entity" {...field("entity_name")} />
            </div>
            <div className="space-y-1">
              <Label htmlFor="ed-type">Investor type</Label>
              <select
                id="ed-type"
                className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                value={form['investor_type'] ?? ""}
                onChange={(e) => setForm((p) => ({ ...p, investor_type: e.target.value }))}
              >
                <option value="">Not set</option>
                {INVESTOR_TYPES.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-1 sm:col-span-2">
              <Label htmlFor="ed-a1">Address</Label>
              <Input id="ed-a1" {...field("address_line1")} />
            </div>
            <div className="space-y-1 sm:col-span-2">
              <Label htmlFor="ed-a2">Address line 2</Label>
              <Input id="ed-a2" {...field("address_line2")} />
            </div>
            <div className="space-y-1">
              <Label htmlFor="ed-city">City</Label>
              <Input id="ed-city" {...field("city")} />
            </div>
            <div className="space-y-1">
              <Label htmlFor="ed-region">State or region</Label>
              <Input id="ed-region" {...field("region")} />
            </div>
            <div className="space-y-1">
              <Label htmlFor="ed-post">Postal code</Label>
              <Input id="ed-post" {...field("postal_code")} />
            </div>
            <div className="space-y-1">
              <Label htmlFor="ed-country">Country</Label>
              <Input id="ed-country" {...field("country")} />
            </div>
            {editing?.application_id && (
              <div className="space-y-1 sm:col-span-2">
                <Label htmlFor="ed-commit">Commitment amount (dollars)</Label>
                <Input id="ed-commit" inputMode="decimal" {...field("commitment")} />
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditing(null)}>
              Cancel
            </Button>
            <Button disabled={save.isPending} onClick={() => save.mutate()}>
              {save.isPending ? "Saving…" : "Save details"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </main>
  );
}
