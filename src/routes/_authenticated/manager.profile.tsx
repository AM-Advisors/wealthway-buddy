import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import { getManagerProfile, saveManagerProfile } from "@/lib/manager-profile.functions";
import { getAlertPreference, setAlertPreference } from "@/lib/notification-preferences.functions";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";

export const Route = createFileRoute("/_authenticated/manager/profile")({
  head: () => ({
    meta: [
      { title: "Your Manager Profile — Harmonious" },
      {
        name: "description",
        content:
          "Update your contact details as a Harmonious fund manager and see every fund you are assigned to.",
      },
      { property: "og:title", content: "Your Manager Profile — Harmonious" },
      {
        property: "og:description",
        content: "Keep your manager details current and review your assigned funds.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: ManagerProfilePage,
});

function money(cents: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format((cents ?? 0) / 100);
}

const emptyForm = {
  legal_name: "",
  email: "",
  phone: "",
  entity_name: "",
  address_line1: "",
  address_line2: "",
  city: "",
  region: "",
  postal_code: "",
  country: "",
};

function ManagerProfilePage() {
  const queryClient = useQueryClient();
  const load = useServerFn(getManagerProfile);
  const save = useServerFn(saveManagerProfile);
  const loadAlerts = useServerFn(getAlertPreference);
  const saveAlerts = useServerFn(setAlertPreference);

  const { data, isLoading, isError } = useQuery({
    queryKey: ["manager-profile"],
    queryFn: () => load(),
    retry: false,
  });

  const { data: alerts } = useQuery({
    queryKey: ["alert-preference"],
    queryFn: () => loadAlerts(),
    retry: false,
  });

  const [form, setForm] = useState(emptyForm);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    if (data?.profile && !loaded) {
      const p = data.profile;
      setForm({
        legal_name: p.legal_name ?? "",
        email: p.email ?? "",
        phone: p.phone ?? "",
        entity_name: p.entity_name ?? "",
        address_line1: p.address_line1 ?? "",
        address_line2: p.address_line2 ?? "",
        city: p.city ?? "",
        region: p.region ?? "",
        postal_code: p.postal_code ?? "",
        country: p.country ?? "",
      });
      setLoaded(true);
    }
  }, [data, loaded]);

  const saveMutation = useMutation({
    mutationFn: () => save({ data: form }),
    onSuccess: () => {
      toast.success("Your details were saved.");
      queryClient.invalidateQueries({ queryKey: ["manager-profile"] });
    },
    onError: (e: any) => toast.error(e?.message ?? "Could not save your details."),
  });

  const alertMutation = useMutation({
    mutationFn: (enabled: boolean) => saveAlerts({ data: { alertsEnabled: enabled } }),
    onSuccess: () => {
      toast.success("Email preference updated.");
      queryClient.invalidateQueries({ queryKey: ["alert-preference"] });
    },
    onError: (e: any) => toast.error(e?.message ?? "Could not update that preference."),
  });

  function field(key: keyof typeof emptyForm) {
    return {
      value: form[key],
      onChange: (e: React.ChangeEvent<HTMLInputElement>) =>
        setForm((prev) => ({ ...prev, [key]: e.target.value })),
    };
  }

  const canSave = form.legal_name.trim().length > 0 && /.+@.+\..+/.test(form.email.trim());
  const funds = (data?.funds ?? []) as any[];

  if (isLoading) {
    return (
      <main className="mx-auto max-w-4xl px-4 py-10 text-sm text-muted-foreground">Loading…</main>
    );
  }

  if (isError || !data) {
    return (
      <main className="mx-auto max-w-2xl px-4 py-16">
        <Card>
          <CardHeader>
            <CardTitle>Profile unavailable</CardTitle>
            <CardDescription>Sign in with your manager account and try again.</CardDescription>
          </CardHeader>
        </Card>
      </main>
    );
  }

  return (
    <main className="mx-auto w-full max-w-4xl px-4 py-10">
      <header className="mb-6 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Your profile</h1>
          <p className="text-sm text-muted-foreground">
            Keep your details current — investors and the Harmonious team see this contact
            information.
          </p>
        </div>
        <Button asChild size="sm" variant="outline">
          <Link to="/manager">Back to panel</Link>
        </Button>
      </header>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Your details</CardTitle>
          <CardDescription>
            Signed in as {data.accountEmail ?? "your account"}
            {data.isAdmin ? " · Administrator" : " · Fund manager"}
            {data.profile.updated_at
              ? ` · last updated ${new Date(data.profile.updated_at).toLocaleDateString()}`
              : ""}
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1">
            <Label htmlFor="legal_name">Full name</Label>
            <Input id="legal_name" {...field("legal_name")} />
          </div>
          <div className="space-y-1">
            <Label htmlFor="entity_name">Firm (optional)</Label>
            <Input id="entity_name" {...field("entity_name")} />
          </div>
          <div className="space-y-1">
            <Label htmlFor="email">Contact email</Label>
            <Input id="email" type="email" {...field("email")} />
          </div>
          <div className="space-y-1">
            <Label htmlFor="phone">Phone</Label>
            <Input id="phone" {...field("phone")} />
          </div>
          <div className="space-y-1 sm:col-span-2">
            <Label htmlFor="address_line1">Address</Label>
            <Input id="address_line1" placeholder="Street address" {...field("address_line1")} />
          </div>
          <div className="space-y-1 sm:col-span-2">
            <Label htmlFor="address_line2">Address line 2 (optional)</Label>
            <Input id="address_line2" {...field("address_line2")} />
          </div>
          <div className="space-y-1">
            <Label htmlFor="city">City</Label>
            <Input id="city" {...field("city")} />
          </div>
          <div className="space-y-1">
            <Label htmlFor="region">State or region</Label>
            <Input id="region" {...field("region")} />
          </div>
          <div className="space-y-1">
            <Label htmlFor="postal_code">Postal code</Label>
            <Input id="postal_code" {...field("postal_code")} />
          </div>
          <div className="space-y-1">
            <Label htmlFor="country">Country</Label>
            <Input id="country" {...field("country")} />
          </div>
          <div className="sm:col-span-2">
            <Button disabled={!canSave || saveMutation.isPending} onClick={() => saveMutation.mutate()}>
              {saveMutation.isPending ? "Saving…" : "Save details"}
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card className="mt-6">
        <CardHeader>
          <CardTitle className="text-base">Email alerts</CardTitle>
          <CardDescription>
            Get an email when an investor changes status, sends a wire or uploads a document.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex items-center justify-between gap-4">
          <span className="text-sm">
            {alerts?.alertsEnabled === false ? "Alerts are off" : "Alerts are on"}
          </span>
          <Switch
            checked={alerts?.alertsEnabled !== false}
            disabled={alertMutation.isPending}
            onCheckedChange={(checked) => alertMutation.mutate(checked)}
          />
        </CardContent>
      </Card>

      <Card className="mt-6">
        <CardHeader>
          <CardTitle className="text-base">
            {data.isAdmin ? "All funds" : "Funds you are assigned to"}
          </CardTitle>
          <CardDescription>
            {data.isAdmin
              ? "As an administrator you can work on every fund."
              : "Ask an administrator if a fund is missing here."}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {funds.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              You are not assigned to a fund yet. An administrator can add you to one.
            </p>
          ) : (
            <ul className="space-y-3">
              {funds.map((fund) => (
                <li
                  key={fund.id}
                  className="flex flex-wrap items-center justify-between gap-3 rounded-lg border p-3"
                >
                  <div>
                    <p className="font-medium">{fund.name}</p>
                    <p className="text-xs text-muted-foreground">
                      Reg D {fund.regType} · {fund.investorCount} investor
                      {fund.investorCount === 1 ? "" : "s"} · {money(fund.committedCents)} committed
                      {fund.assignedAt
                        ? ` · assigned ${new Date(fund.assignedAt).toLocaleDateString()}`
                        : ""}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge variant={fund.isOpen ? "secondary" : "outline"}>
                      {fund.isOpen ? "Open" : "Closed"}
                    </Badge>
                    <Button asChild size="sm" variant="outline">
                      <Link to="/manager/investors">Investors</Link>
                    </Button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </main>
  );
}
