import { useMemo, useState } from "react";
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
import { grantReadOnlyAccess, listProfessionalDirectory } from "@/lib/access-manager.functions";
import { getMyIdentity } from "@/lib/identity.functions";
import {
  CAPABILITY_LABELS,
  DEFAULT_CAPABILITIES,
  PHASE_3A_CAPABILITIES,
  SCOPE_LABELS,
  SENSITIVE_CAPABILITIES,
} from "@/lib/professional-model";

const STEPS = [
  "Who are you authorising?",
  "Which firm?",
  "What scope?",
  "What may they view?",
  "Authority level",
  "Dates",
  "Review and confirm",
];

export function GrantAccessWizard({ onDone }: { onDone: () => void }) {
  const qc = useQueryClient();
  const directoryFn = useServerFn(listProfessionalDirectory);
  const identityFn = useServerFn(getMyIdentity);
  const grantFn = useServerFn(grantReadOnlyAccess);

  const { data: directory } = useQuery({
    queryKey: ["professional-directory"],
    queryFn: () => directoryFn(),
  });
  const { data: identity } = useQuery({ queryKey: ["my-identity"], queryFn: () => identityFn() });

  const [step, setStep] = useState(0);
  const [organizationId, setOrganizationId] = useState<string>("");
  const [delegateUserId, setDelegateUserId] = useState<string>("");
  const [scopeType, setScopeType] = useState<string>("person");
  const [scopeId, setScopeId] = useState<string>("");
  const [capabilities, setCapabilities] = useState<string[]>([...DEFAULT_CAPABILITIES]);
  const [expiresAt, setExpiresAt] = useState<string>("");

  const professionals = useMemo(
    () =>
      (directory?.professionals ?? []).filter((p: any) =>
        organizationId ? p.organizationId === organizationId : true,
      ),
    [directory, organizationId],
  );

  const grant = useMutation({
    mutationFn: () =>
      grantFn({
        data: {
          delegate_user_id: delegateUserId,
          organization_id: organizationId || null,
          scope_type: scopeType as any,
          scope_id: scopeType === "person" ? null : scopeId || null,
          capabilities,
          expires_at: expiresAt ? new Date(expiresAt).toISOString() : null,
        },
      }),
    onSuccess: () => {
      toast.success("Access granted.");
      void qc.invalidateQueries({ queryKey: ["access-grants"] });
      onDone();
    },
    onError: (e: any) => toast.error(e?.message ?? "We could not grant that access."),
  });

  const toggle = (cap: string) =>
    setCapabilities((prev) => (prev.includes(cap) ? prev.filter((c) => c !== cap) : [...prev, cap]));

  return (
    <div className="rounded-lg border border-border p-5">
      <p className="text-xs uppercase tracking-wide text-muted-foreground">
        Step {step + 1} of {STEPS.length}
      </p>
      <h3 className="mt-1 text-lg">{STEPS[step]}</h3>

      <div className="mt-4 space-y-4 text-sm">
        {step === 0 && (
          <div>
            <Label>Professional</Label>
            <Select value={delegateUserId} onValueChange={setDelegateUserId}>
              <SelectTrigger>
                <SelectValue placeholder="Choose a professional" />
              </SelectTrigger>
              <SelectContent>
                {professionals.map((p: any) => (
                  <SelectItem key={p.userId} value={p.userId}>
                    {p.email ?? p.userId}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}

        {step === 1 && (
          <div>
            <Label>Professional organization</Label>
            <Select value={organizationId} onValueChange={setOrganizationId}>
              <SelectTrigger>
                <SelectValue placeholder="Choose a firm" />
              </SelectTrigger>
              <SelectContent>
                {(directory?.organizations ?? []).map((o: any) => (
                  <SelectItem key={o.id} value={o.id}>
                    {o.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="mt-2 text-xs text-muted-foreground">
              Membership of a firm gives no access on its own — only this authorisation does.
            </p>
          </div>
        )}

        {step === 2 && (
          <div className="space-y-3">
            <div>
              <Label>Scope</Label>
              <Select value={scopeType} onValueChange={setScopeType}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(SCOPE_LABELS).map(([value, label]) => (
                    <SelectItem key={value} value={value}>
                      {label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {scopeType === "investment_profile" && (
              <div>
                <Label>Which profile?</Label>
                <Select value={scopeId} onValueChange={setScopeId}>
                  <SelectTrigger>
                    <SelectValue placeholder="Choose a profile" />
                  </SelectTrigger>
                  <SelectContent>
                    {((identity?.profiles ?? []) as any[]).map((p) => (
                      <SelectItem key={p.id} value={p.id}>
                        {p.display_label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
            {(scopeType === "fund" || scopeType === "investment" || scopeType === "data_category") && (
              <div>
                <Label htmlFor="scope-id">Reference</Label>
                <Input
                  id="scope-id"
                  value={scopeId}
                  onChange={(e) => setScopeId(e.target.value)}
                  placeholder="Identifier"
                />
              </div>
            )}
          </div>
        )}

        {step === 3 && (
          <div className="space-y-2">
            {PHASE_3A_CAPABILITIES.map((cap) => {
              const sensitive = SENSITIVE_CAPABILITIES.includes(cap);
              return (
                <label
                  key={cap}
                  className={cn("flex items-start gap-2", sensitive && "opacity-60")}
                >
                  <input
                    type="checkbox"
                    className="mt-1"
                    disabled={sensitive}
                    checked={capabilities.includes(cap)}
                    onChange={() => toggle(cap)}
                  />
                  <span>
                    {CAPABILITY_LABELS[cap] ?? cap}
                    {sensitive ? (
                      <span className="ml-2 text-xs text-muted-foreground">
                        needs a signed authorisation — not available yet
                      </span>
                    ) : null}
                  </span>
                </label>
              );
            })}
          </div>
        )}

        {step === 4 && (
          <p className="text-muted-foreground">
            View only. Assisting, signing and moving money are not available yet, so this
            authorisation can never do more than look.
          </p>
        )}

        {step === 5 && (
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <Label>Effective</Label>
              <Input value="Immediately" readOnly />
            </div>
            <div>
              <Label htmlFor="expires">Expires (optional)</Label>
              <Input
                id="expires"
                type="date"
                value={expiresAt}
                onChange={(e) => setExpiresAt(e.target.value)}
              />
            </div>
          </div>
        )}

        {step === 6 && (
          <dl className="grid gap-2 sm:grid-cols-2">
            <div>
              <dt className="text-muted-foreground">Professional</dt>
              <dd>{professionals.find((p: any) => p.userId === delegateUserId)?.email ?? "—"}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Firm</dt>
              <dd>
                {(directory?.organizations ?? []).find((o: any) => o.id === organizationId)?.name ??
                  "None"}
              </dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Scope</dt>
              <dd>{SCOPE_LABELS[scopeType]}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Authority</dt>
              <dd>View only</dd>
            </div>
            <div className="sm:col-span-2">
              <dt className="text-muted-foreground">May view</dt>
              <dd>{capabilities.map((c) => CAPABILITY_LABELS[c] ?? c).join(", ")}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Expires</dt>
              <dd>{expiresAt ? new Date(expiresAt).toLocaleDateString() : "No expiry"}</dd>
            </div>
          </dl>
        )}
      </div>

      <div className="mt-5 flex flex-wrap gap-2">
        <Button variant="outline" onClick={() => (step === 0 ? onDone() : setStep(step - 1))}>
          {step === 0 ? "Cancel" : "Back"}
        </Button>
        {step < STEPS.length - 1 ? (
          <Button
            onClick={() => setStep(step + 1)}
            disabled={
              (step === 0 && !delegateUserId) ||
              (step === 3 && capabilities.length === 0) ||
              (step === 2 && scopeType !== "person" && !scopeId)
            }
          >
            Continue
          </Button>
        ) : (
          <Button onClick={() => grant.mutate()} disabled={grant.isPending}>
            {grant.isPending ? "Granting…" : "Grant access"}
          </Button>
        )}
      </div>
    </div>
  );
}
