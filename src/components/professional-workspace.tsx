import type { ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";

import { getProfessionalOverview } from "@/lib/professional.functions";
import { AUTHORITY_LABELS, CAPABILITY_LABELS } from "@/lib/professional-model";

/**
 * One read for the whole workspace. Authorization is never cached: the query
 * refetches on mount and on focus, and every server call re-checks the
 * delegation, so a revoked grant disappears on the next interaction.
 */
export function useProfessionalOverview() {
  const load = useServerFn(getProfessionalOverview);
  return useQuery({
    queryKey: ["professional-overview"],
    queryFn: () => load(),
    staleTime: 0,
    gcTime: 0,
    refetchOnMount: "always",
    refetchOnWindowFocus: true,
    retry: false,
  });
}

export function WorkspaceSection({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children: ReactNode;
}) {
  return (
    <section className="rounded-lg border border-border p-5">
      <h2 className="text-lg">{title}</h2>
      {description ? <p className="mt-1 text-sm text-muted-foreground">{description}</p> : null}
      <div className="mt-4">{children}</div>
    </section>
  );
}

export function Empty({ children }: { children: ReactNode }) {
  return <p className="text-sm text-muted-foreground">{children}</p>;
}

/** Explicit, never silent: who you are acting for and under what authority. */
export function ActingOnBehalfBanner({
  principalName,
  organizationName,
  scopeLabel,
  authorityLevel,
  capabilities,
  expiresAt,
  onExit,
}: {
  principalName: string;
  organizationName: string | null;
  scopeLabel: string;
  authorityLevel: string;
  capabilities: string[];
  expiresAt?: string | null;
  onExit: () => void;
}) {
  return (
    <div className="rounded-lg border border-primary/40 bg-primary/5 p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-sm font-medium">Acting on behalf of {principalName}</p>
          <p className="text-sm text-muted-foreground">
            {organizationName ? `Through ${organizationName} — ` : ""}
            {scopeLabel} — {AUTHORITY_LABELS[authorityLevel] ?? authorityLevel}
            {expiresAt ? ` — until ${new Date(expiresAt).toLocaleDateString()}` : ""}
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            You can view {capabilities.map((c) => CAPABILITY_LABELS[c] ?? c).join(", ")}. Nothing can
            be changed, signed or paid from here.
          </p>
        </div>
        <button
          type="button"
          onClick={onExit}
          className="rounded-md border border-border px-3 py-1.5 text-sm"
        >
          Exit delegated access
        </button>
      </div>
    </div>
  );
}

/** Flattens the per-delegation views into one cross-client list. */
export function flatten<T>(views: any[] | undefined, pick: (view: any) => T[]): (T & { client: string; delegationId: string })[] {
  const out: any[] = [];
  for (const view of views ?? []) {
    for (const row of pick(view) ?? []) {
      out.push({ ...row, client: view.context.principalName, delegationId: view.context.delegationId });
    }
  }
  return out;
}
