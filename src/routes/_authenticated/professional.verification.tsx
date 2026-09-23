import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  ORG_VERIFICATION_LABELS,
  credentialRequirement,
  type OrgVerificationStatus,
} from "@/lib/signatory-model";
import { getOrganizationVerification, saveOrganizationProfile } from "@/lib/signatory.functions";
import { AddressInput, addressFromSnake, addressToSnake } from "@/components/address-input";

const FIELDS = [
  ["legal_name", "Legal name"],
  ["dba_name", "Trading / display name"],
  ["website", "Website"],
  ["jurisdiction", "Jurisdiction"],
  ["business_identifier", "Business identifier (EIN)"],
  ["registration_number", "Registration number"],
  ["license_number", "Licence number"],
  ["primary_contact_name", "Primary contact"],
  ["primary_contact_email", "Contact email"],
  ["primary_contact_phone", "Contact phone"],
] as const;

function OrganizationVerification() {
  const load = useServerFn(getOrganizationVerification);
  const save = useServerFn(saveOrganizationProfile);
  const qc = useQueryClient();
  const [drafts, setDrafts] = useState<Record<string, Record<string, string>>>({});

  const { data, isPending } = useQuery({
    queryKey: ["org-verification"],
    queryFn: () => load(),
    staleTime: 0,
  });

  const mutation = useMutation({
    mutationFn: (input: { organization_id: string; patch: any; submit: boolean }) => save({ data: input }),
    onSuccess: () => {
      toast.success("Saved.");
      void qc.invalidateQueries({ queryKey: ["org-verification"] });
    },
    onError: (e: any) => toast.error(e?.message ?? "Could not save."),
  });

  if (isPending) return <p className="text-sm text-muted-foreground">Loading…</p>;

  const orgs = (data?.organizations ?? []) as any[];
  if (orgs.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        You do not hold an active seat at a firm, so there is nothing to verify here.
      </p>
    );
  }

  return (
    <div className="space-y-6">
      <p className="text-sm text-muted-foreground">
        Verification confirms who your firm is. It does not grant any authority on its own — what you
        may do always comes from a client's authorisation.
      </p>

      {orgs.map((org) => {
        const draft = drafts[org.id] ?? {};
        const value = (key: string) => draft[key] ?? org[key] ?? "";
        const status = (org.verification_status ?? "draft") as OrgVerificationStatus;
        const needed = credentialRequirement(org.org_type);

        return (
          <Card key={org.id}>
            <CardHeader className="flex-row items-center justify-between gap-3 space-y-0">
              <CardTitle className="text-lg">{org.name}</CardTitle>
              <Badge variant={status === "verified" ? "default" : "secondary"}>
                {ORG_VERIFICATION_LABELS[status] ?? status}
              </Badge>
            </CardHeader>
            <CardContent className="space-y-4">
              {needed.length > 0 ? (
                <p className="rounded-md bg-muted p-3 text-xs text-muted-foreground">
                  A firm of this kind also needs a verified personal credential from whoever signs.
                  Add yours under My credentials.
                </p>
              ) : null}

              <AddressInput
                idPrefix={`org-${org.id}-address`}
                label="Registered address"
                description="Where the firm is registered. Google finding the address does not evidence that the firm operates there."
                countryMode="free"
                value={addressFromSnake({
                  address_line1: value("address_line1"),
                  address_line2: value("address_line2"),
                  city: value("city"),
                  region: value("region"),
                  postal_code: value("postal_code"),
                  country: value("country"),
                })}
                onChange={(next) =>
                  setDrafts((prev) => ({
                    ...prev,
                    [org.id]: { ...(prev[org.id] ?? {}), ...addressToSnake(next) },
                  }))
                }
              />

              <div className="grid gap-3 sm:grid-cols-2">
                {FIELDS.map(([key, label]) => (
                  <div key={key} className="space-y-1">
                    <Label htmlFor={`${org.id}-${key}`} className="text-xs">
                      {label}
                    </Label>
                    <Input
                      id={`${org.id}-${key}`}
                      value={value(key)}
                      onChange={(e) =>
                        setDrafts((prev) => ({
                          ...prev,
                          [org.id]: { ...(prev[org.id] ?? {}), [key]: e.target.value },
                        }))
                      }
                    />
                  </div>
                ))}
              </div>

              <div className="flex flex-wrap gap-2">
                <Button
                  variant="outline"
                  disabled={mutation.isPending}
                  onClick={() =>
                    mutation.mutate({ organization_id: org.id, patch: draft, submit: false })
                  }
                >
                  Save
                </Button>
                <Button
                  disabled={mutation.isPending}
                  onClick={() =>
                    mutation.mutate({ organization_id: org.id, patch: draft, submit: true })
                  }
                >
                  Submit for verification
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">
                Harmonious reviews and marks a firm verified. A firm can never verify itself.
              </p>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}

export const Route = createFileRoute("/_authenticated/professional/verification")({
  head: () => ({
    meta: [
      { title: "Firm verification — Harmonious" },
      {
        name: "description",
        content: "Submit your firm's details for Harmonious verification before acting for clients.",
      },
      { property: "og:title", content: "Firm verification — Harmonious" },
      { property: "og:description", content: "Verify your professional firm with Harmonious." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: OrganizationVerification,
});
