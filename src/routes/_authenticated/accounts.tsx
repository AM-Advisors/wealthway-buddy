import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";

import {
  ACCOUNT_KINDS,
  ACCOUNT_KIND_LABELS,
  deleteAccount,
  listAccounts,
  saveAccount,
  setActiveAccount,
  type AccountInput,
  type InvestorAccount,
} from "@/lib/personas.functions";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { AddressInput, addressFromSnake, addressToSnake } from "@/components/address-input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export const Route = createFileRoute("/_authenticated/accounts")({
  head: () => ({
    meta: [
      { title: "Your Investing Accounts — Harmonious" },
      {
        name: "description",
        content:
          "Set up and switch between your investing accounts — individual, LLC, trust, IRA or joint — and see the funds each one is applying to.",
      },
      { property: "og:title", content: "Your Investing Accounts — Harmonious" },
      {
        property: "og:description",
        content: "Manage individual, entity, trust and retirement accounts in one place.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: AccountsPage,
});

type FormState = AccountInput;

const EMPTY: FormState = {
  kind: "individual",
  label: "",
  legal_name: "",
  entity_name: "",
  tax_id: "",
  date_of_birth: "",
  phone: "",
  email: "",
  address_line1: "",
  address_line2: "",
  city: "",
  region: "",
  postal_code: "",
  country: "United States",
  is_default: false,
};

function money(cents: number | null | undefined) {
  if (!cents && cents !== 0) return "—";
  return `$${Math.round(cents / 100).toLocaleString("en-US")}`;
}

function fromAccount(account: InvestorAccount): FormState {
  return {
    id: account.id,
    kind: account.kind as FormState["kind"],
    label: account.label,
    legal_name: account.legal_name ?? "",
    entity_name: account.entity_name ?? "",
    tax_id: account.tax_id ?? "",
    date_of_birth: account.date_of_birth ?? "",
    phone: account.phone ?? "",
    email: account.email ?? "",
    address_line1: account.address_line1 ?? "",
    address_line2: account.address_line2 ?? "",
    city: account.city ?? "",
    region: account.region ?? "",
    postal_code: account.postal_code ?? "",
    country: account.country ?? "United States",
    is_default: account.is_default,
  };
}

function AccountsPage() {
  const load = useServerFn(listAccounts);
  const save = useServerFn(saveAccount);
  const choose = useServerFn(setActiveAccount);
  const remove = useServerFn(deleteAccount);
  const queryClient = useQueryClient();

  const { data, isLoading } = useQuery({ queryKey: ["investor-accounts"], queryFn: () => load() });
  const [form, setForm] = useState<FormState | null>(null);

  const refresh = async () => {
    await queryClient.invalidateQueries();
  };

  const saving = useMutation({
    mutationFn: (input: FormState) => save({ data: input }),
    onSuccess: async () => {
      setForm(null);
      await refresh();
      toast.success("Account saved");
    },
    onError: (error: unknown) =>
      toast.error(error instanceof Error ? error.message : "Could not save this account"),
  });

  const switching = useMutation({
    mutationFn: (accountId: string) => choose({ data: { accountId } }),
    onSuccess: async () => {
      await refresh();
      toast.success("Switched account");
    },
    onError: (error: unknown) =>
      toast.error(error instanceof Error ? error.message : "Could not switch account"),
  });

  const removing = useMutation({
    mutationFn: (accountId: string) => remove({ data: { accountId } }),
    onSuccess: async () => {
      await refresh();
      toast.success("Account removed");
    },
    onError: (error: unknown) =>
      toast.error(error instanceof Error ? error.message : "Could not remove this account"),
  });

  const accounts = data?.accounts ?? [];
  const set = (key: keyof FormState) => (value: string) =>
    setForm((f) => (f ? { ...f, [key]: value } : f));

  return (
    <div className="mx-auto w-full max-w-4xl space-y-6 px-4 py-8">
      <header className="space-y-2">
        <h1 className="text-2xl font-semibold tracking-tight">Your investing accounts</h1>
        <p className="text-muted-foreground">
          Invest as yourself, through an LLC, a trust, a retirement account, or jointly. Each
          account keeps its own details and its own applications, and you can have more than one
          application running at the same time.
        </p>
      </header>

      {isLoading ? <p className="text-muted-foreground">Loading your accounts…</p> : null}

      <div className="space-y-4">
        {accounts.map((account) => (
          <Card key={account.id} className={account.is_active ? "border-primary" : undefined}>
            <CardHeader className="flex flex-row flex-wrap items-start justify-between gap-3">
              <div className="space-y-1">
                <CardTitle className="flex flex-wrap items-center gap-2">
                  {account.label}
                  <Badge variant="secondary">
                    {ACCOUNT_KIND_LABELS[account.kind] ?? account.kind}
                  </Badge>
                  {account.is_active ? <Badge>In use</Badge> : null}
                  {account.is_default ? <Badge variant="outline">Default</Badge> : null}
                </CardTitle>
                <CardDescription>
                  {account.entity_name || account.legal_name || "Details not filled in yet"}
                </CardDescription>
              </div>
              <div className="flex flex-wrap gap-2">
                {!account.is_active ? (
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={switching.isPending}
                    onClick={() => switching.mutate(account.id)}
                  >
                    Use this account
                  </Button>
                ) : null}
                <Button size="sm" variant="ghost" onClick={() => setForm(fromAccount(account))}>
                  Edit
                </Button>
                {account.applications.length === 0 && accounts.length > 1 ? (
                  <Button
                    size="sm"
                    variant="ghost"
                    disabled={removing.isPending}
                    onClick={() => removing.mutate(account.id)}
                  >
                    Remove
                  </Button>
                ) : null}
              </div>
            </CardHeader>
            <CardContent className="space-y-3">
              {account.applications.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  No applications yet under this account.
                </p>
              ) : (
                <ul className="space-y-2">
                  {account.applications.map((application) => (
                    <li
                      key={application.application_id}
                      className="flex flex-wrap items-center justify-between gap-2 rounded-md border p-3 text-sm"
                    >
                      <div>
                        <p className="font-medium">{application.offering_name}</p>
                        <p className="text-muted-foreground">
                          Step: {application.current_step ?? "—"} · Status: {application.status} ·
                          Funding: {application.funding_status ?? "—"}
                        </p>
                      </div>
                      <span className="font-medium">{money(application.commitment_cents)}</span>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
        ))}
      </div>

      {form ? (
        <Card>
          <CardHeader>
            <CardTitle>{form.id ? "Edit account" : "Add an account"}</CardTitle>
            <CardDescription>
              These details are used for the identity check and the fund paperwork signed by this
              account.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label>Account type</Label>
                <Select value={form.kind} onValueChange={(v) => set("kind")(v)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {ACCOUNT_KINDS.map((kind) => (
                      <SelectItem key={kind} value={kind}>
                        {ACCOUNT_KIND_LABELS[kind]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="label">Account name</Label>
                <Input
                  id="label"
                  value={form.label}
                  placeholder="Smith Family Trust"
                  onChange={(e) => set("label")(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="legal_name">Legal name of the signer</Label>
                <Input
                  id="legal_name"
                  value={form.legal_name ?? ""}
                  onChange={(e) => set("legal_name")(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="entity_name">Entity name (if any)</Label>
                <Input
                  id="entity_name"
                  value={form.entity_name ?? ""}
                  onChange={(e) => set("entity_name")(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="tax_id">Tax ID (SSN/EIN)</Label>
                <Input
                  id="tax_id"
                  value={form.tax_id ?? ""}
                  onChange={(e) => set("tax_id")(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="date_of_birth">Date of birth / formation</Label>
                <Input
                  id="date_of_birth"
                  type="date"
                  value={form.date_of_birth ?? ""}
                  onChange={(e) => set("date_of_birth")(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="email">Contact email</Label>
                <Input
                  id="email"
                  value={form.email ?? ""}
                  onChange={(e) => set("email")(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="phone">Phone</Label>
                <Input
                  id="phone"
                  value={form.phone ?? ""}
                  onChange={(e) => set("phone")(e.target.value)}
                />
              </div>
              <div className="space-y-2 sm:col-span-2">
                <AddressInput
                  idPrefix="persona-address"
                  label="Address"
                  countryMode="free"
                  value={addressFromSnake(form as any)}
                  onChange={(next) => {
                    const snake = addressToSnake(next);
                    (Object.keys(snake) as Array<keyof typeof snake>).forEach((key) =>
                      set(key as any)(snake[key]),
                    );
                  }}
                />
              </div>
            </div>

            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={!!form.is_default}
                onChange={(e) => setForm((f) => (f ? { ...f, is_default: e.target.checked } : f))}
              />
              Make this my default account
            </label>

            <div className="flex flex-wrap gap-2">
              <Button disabled={saving.isPending} onClick={() => saving.mutate(form)}>
                {saving.isPending ? "Saving…" : "Save account"}
              </Button>
              <Button variant="ghost" onClick={() => setForm(null)}>
                Cancel
              </Button>
            </div>
          </CardContent>
        </Card>
      ) : (
        <div className="flex flex-wrap gap-2">
          <Button onClick={() => setForm({ ...EMPTY })}>Add an account</Button>
          <Button asChild variant="outline">
            <Link to="/portal">Back to your portal</Link>
          </Button>
        </div>
      )}
    </div>
  );
}
