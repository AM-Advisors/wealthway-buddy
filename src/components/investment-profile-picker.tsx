import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Link } from "@tanstack/react-router";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { listEligibleProfiles } from "@/lib/identity.functions";
import { INVESTMENT_PROFILE_LABELS, type InvestmentProfileType } from "@/lib/identity-model";

/**
 * "Choose how you're investing". The profile picked here is the legal
 * subscriber for the investment.
 */
export function InvestmentProfilePicker({
  offeringId,
  selectedId,
  onSelect,
}: {
  offeringId: string;
  selectedId?: string | null;
  onSelect?: (profileId: string) => void;
}) {
  const load = useServerFn(listEligibleProfiles);
  const { data, isPending } = useQuery({
    queryKey: ["eligible-profiles", offeringId],
    queryFn: () => load({ data: { offeringId } }),
  });

  if (isPending) {
    return <p className="text-sm text-muted-foreground">Loading your investment profiles…</p>;
  }

  const profiles = data?.profiles ?? [];

  return (
    <div className="space-y-3">
      <h2 className="text-lg">Choose how you're investing</h2>
      {profiles.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          You have no investment profiles yet. Add one to continue.
        </p>
      ) : null}

      <ul className="space-y-2">
        {profiles.map((p) => {
          const ready = p.readiness.ready;
          return (
            <li key={p.id}>
              <button
                type="button"
                onClick={() => onSelect?.(p.id)}
                className={cn(
                  "flex w-full items-center justify-between gap-4 rounded-lg border p-3 text-left transition-colors hover:bg-muted/50",
                  selectedId === p.id ? "border-primary bg-muted/40" : "border-border",
                )}
              >
                <span>
                  <span className="block text-sm font-medium">{p.label}</span>
                  <span className="block text-xs text-muted-foreground">
                    {INVESTMENT_PROFILE_LABELS[p.type as InvestmentProfileType] ?? p.type}
                  </span>
                </span>
                <span
                  className={cn(
                    "text-xs uppercase tracking-wide",
                    ready ? "text-primary" : "text-muted-foreground",
                  )}
                >
                  {ready ? "Ready" : p.readiness.reasons.map((r) => r.message).join(" · ")}
                </span>
              </button>
            </li>
          );
        })}
      </ul>

      <Button asChild variant="outline" size="sm">
        <Link to="/profile">+ Add investment profile</Link>
      </Button>
    </div>
  );
}
