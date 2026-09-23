import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  createInvestmentProfile,
  getMyIdentity,
  saveMyPersonalInfo,
} from "@/lib/identity.functions";
import {
  INVESTMENT_PROFILE_LABELS,
  INVESTMENT_PROFILE_TYPES,
  type InvestmentProfileType,
} from "@/lib/identity-model";

const STATE_LABEL: Record<string, string> = {
  account_created: "Account created",
  profile_required: "Personal details needed",
  identity_required: "Identity verification needed",
  kyc_pending: "Identity check in progress",
  aml_pending: "Screening in progress",
  review_required: "In review",
  verified: "Verified",
  failed: "Needs attention",
  reverification_required: "Re-verification needed",
};

const CHECK_LABEL: Record<string, string> = {
  not_started: "Not started",
  pending: "In progress",
  review: "In review",
  approved: "On file",
  declined: "Needs attention",
};

function Section({ title, description, children }: { title: string; description?: string; children: React.ReactNode }) {
  return (
    <section className="rounded-lg border border-border p-5">
      <h2 className="text-lg">{title}</h2>
      {description ? <p className="mt-1 text-sm text-muted-foreground">{description}</p> : null}
      <div className="mt-4">{children}</div>
    </section>
  );
}

function ProfilePage() {
  const qc = useQueryClient();
  const load = useServerFn(getMyIdentity);
  const savePerson = useServerFn(saveMyPersonalInfo);
  const addProfile = useServerFn(createInvestmentProfile);

  const { data, isPending } = useQuery({ queryKey: ["my-identity"], queryFn: () => load() });
  const [newType, setNewType] = useState<InvestmentProfileType>("individual");
  const [newLabel, setNewLabel] = useState("");

  const personMutation = useMutation({
    mutationFn: (form: any) => savePerson({ data: form }),
    onSuccess: () => {
      toast.success("Your details were saved.");
      void qc.invalidateQueries({ queryKey: ["my-identity"] });
    },
    onError: (e: any) => toast.error(e?.message ?? "We could not save that."),
  });

  const profileMutation = useMutation({
    mutationFn: () =>
      addProfile({ data: { profile_type: newType, display_label: newLabel, legal_name: newLabel } }),
    onSuccess: () => {
      setNewLabel("");
      toast.success("Investment profile added.");
      void qc.invalidateQueries({ queryKey: ["my-identity"] });
    },
    onError: (e: any) => toast.error(e?.message ?? "We could not add that profile."),
  });

  if (isPending || !data) {
    return <main className="mx-auto max-w-4xl px-4 py-10 text-sm text-muted-foreground">Loading…</main>;
  }

  const person: any = data.person ?? {};
  const kybByProfile = new Map((data.entityVerifications as any[]).map((k) => [k.profile_id, k]));

  return (
    <main className="mx-auto max-w-4xl space-y-6 px-4 py-10">
      <header>
        <h1 className="text-3xl">My profile</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Your details are held once. You can invest through as many profiles as you need.
        </p>
        <p className="mt-3 text-sm">
          Status: <span className="font-medium">{STATE_LABEL[data.onboarding.state] ?? data.onboarding.state}</span>
          {data.onboarding.nextStep ? ` — next: ${data.onboarding.nextStep}` : ""}
        </p>
      </header>

      <Section title="Personal information" description="Your legal details, held once for every profile.">
        <form
          className="grid gap-3 sm:grid-cols-2"
          onSubmit={(e) => {
            e.preventDefault();
            const f = new FormData(e.currentTarget);
            personMutation.mutate(Object.fromEntries(f.entries()));
          }}
        >
          <div>
            <Label htmlFor="legal_first_name">Legal first name</Label>
            <Input id="legal_first_name" name="legal_first_name" defaultValue={person.legal_first_name ?? ""} required />
          </div>
          <div>
            <Label htmlFor="legal_last_name">Legal last name</Label>
            <Input id="legal_last_name" name="legal_last_name" defaultValue={person.legal_last_name ?? ""} required />
          </div>
          <div>
            <Label htmlFor="preferred_name">Preferred name</Label>
            <Input id="preferred_name" name="preferred_name" defaultValue={person.preferred_name ?? ""} />
          </div>
          <div>
            <Label htmlFor="phone">Phone</Label>
            <Input id="phone" name="phone" defaultValue={person.phone ?? ""} />
          </div>
          <div>
            <Label htmlFor="citizenship_country">Citizenship</Label>
            <Input id="citizenship_country" name="citizenship_country" defaultValue={person.citizenship_country ?? ""} />
          </div>
          <div>
            <Label htmlFor="residence_country">Country of residence</Label>
            <Input id="residence_country" name="residence_country" defaultValue={person.residence_country ?? ""} />
          </div>
          <div className="sm:col-span-2">
            <AddressInput
              idPrefix="profile-address"
              label="Residential address"
              countryMode="free"
              value={address}
              onChange={setAddress}
            />
            <input type="hidden" name="address_line1" value={address.line1} />
            <input type="hidden" name="address_line2" value={address.line2} />
            <input type="hidden" name="city" value={address.city} />
            <input type="hidden" name="region" value={address.region} />
            <input type="hidden" name="postal_code" value={address.postalCode} />
            <input type="hidden" name="country" value={address.country} />
          </div>
          <div className="sm:col-span-2">
            <Button type="submit" disabled={personMutation.isPending}>
              {personMutation.isPending ? "Saving…" : "Save details"}
            </Button>
          </div>
        </form>
      </Section>

      <Section title="Identity verification" description="What Harmonious holds for you, without the raw check data.">
        <dl className="grid gap-2 text-sm sm:grid-cols-2">
          <div>
            <dt className="text-muted-foreground">Identity check</dt>
            <dd>{CHECK_LABEL[person.kyc_status] ?? person.kyc_status}</dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Screening</dt>
            <dd>{CHECK_LABEL[person.aml_status] ?? person.aml_status}</dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Date of birth</dt>
            <dd>{person.date_of_birth_on_file ? "On file" : "Not provided"}</dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Tax identifier</dt>
            <dd>{person.tax_id_on_file ? `On file (ending ${person.tax_id_last4 ?? "••••"})` : "Not provided"}</dd>
          </div>
        </dl>
      </Section>

      <Section title="Investment profiles" description="Each profile is the legal subscriber for its own investments.">
        <ul className="space-y-2">
          {(data.profiles as any[]).map((p) => {
            const kyb = kybByProfile.get(p.id);
            return (
              <li key={p.id} className="rounded-md border border-border p-3 text-sm">
                <div className="flex items-center justify-between gap-3">
                  <span className="font-medium">{p.display_label}</span>
                  <span className="text-xs uppercase tracking-wide text-muted-foreground">
                    {INVESTMENT_PROFILE_LABELS[p.profile_type as InvestmentProfileType] ?? p.profile_type}
                  </span>
                </div>
                {kyb ? (
                  <p className="mt-1 text-xs text-muted-foreground">
                    Entity verification: {CHECK_LABEL[kyb.kyb_status] ?? kyb.kyb_status}
                  </p>
                ) : null}
              </li>
            );
          })}
        </ul>

        <div className="mt-4 grid gap-3 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
          <div>
            <Label htmlFor="new-label">New profile name</Label>
            <Input id="new-label" value={newLabel} onChange={(e) => setNewLabel(e.target.value)} placeholder="Smith Family Trust" />
          </div>
          <div>
            <Label>Type</Label>
            <Select value={newType} onValueChange={(v) => setNewType(v as InvestmentProfileType)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {INVESTMENT_PROFILE_TYPES.map((t) => (
                  <SelectItem key={t} value={t}>
                    {INVESTMENT_PROFILE_LABELS[t]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <Button
            onClick={() => profileMutation.mutate()}
            disabled={newLabel.trim().length < 2 || profileMutation.isPending}
          >
            Add profile
          </Button>
        </div>
      </Section>

      <Section title="Accreditation" description="Accreditation belongs to the profile that invests, not to you globally.">
        {(data.accreditations as any[]).length === 0 ? (
          <p className="text-sm text-muted-foreground">Nothing on file yet.</p>
        ) : (
          <ul className="space-y-1 text-sm">
            {(data.accreditations as any[]).map((a, i) => (
              <li key={i}>
                {CHECK_LABEL[a.status] ?? a.status}
                {a.basis ? ` — ${a.basis}` : ""}
                {a.expires_at ? ` — expires ${new Date(a.expires_at).toLocaleDateString()}` : ""}
              </li>
            ))}
          </ul>
        )}
      </Section>

      <Section title="Tax information" description="Tax residency and identifiers are stored but never shown in full.">
        <dl className="grid gap-2 text-sm sm:grid-cols-2">
          <div>
            <dt className="text-muted-foreground">Tax residency</dt>
            <dd>{person.tax_residency_country ?? "Not provided"}</dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Identifier</dt>
            <dd>{person.tax_id_on_file ? "On file" : "Not provided"}</dd>
          </div>
        </dl>
      </Section>

      <Section title="Documents" description="Documents you upload during verification appear with each profile.">
        <p className="text-sm text-muted-foreground">
          Identity and formation documents are handled inside each verification step.
        </p>
      </Section>

      <Section title="Security" description="How you sign in.">
        <p className="text-sm text-muted-foreground">
          Sign-in is managed through your email address and Google account.
        </p>
      </Section>

      <Section title="Activity" description="Every change to your verification status.">
        {(data.history as any[]).length === 0 ? (
          <p className="text-sm text-muted-foreground">No changes recorded yet.</p>
        ) : (
          <ul className="space-y-1 text-sm">
            {(data.history as any[]).map((h, i) => (
              <li key={i} className="text-muted-foreground">
                {new Date(h.created_at).toLocaleString()} — {STATE_LABEL[h.to_state] ?? h.to_state}
                {h.reason ? ` (${h.reason})` : ""}
              </li>
            ))}
          </ul>
        )}
      </Section>
    </main>
  );
}

export const Route = createFileRoute("/_authenticated/profile")({
  head: () => ({
    meta: [
      { title: "My profile — Harmonious" },
      {
        name: "description",
        content:
          "Your personal details, identity verification, investment profiles, accreditation, tax information and activity in one place.",
      },
      { property: "og:title", content: "My profile — Harmonious" },
      {
        property: "og:description",
        content: "One identity, many ways to invest: profiles, verification status and activity.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: ProfilePage,
});
