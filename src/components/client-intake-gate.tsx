import type { ReactNode } from "react";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";

import { ClientIntakeForm } from "@/components/client-intake-form";
import { getIntakeRequirement } from "@/lib/client-intake.functions";

/** A new client's main contacts tell us about their fund before the portal opens. */
export function ClientIntakeGate({ children }: { children: ReactNode }) {
  const load = useServerFn(getIntakeRequirement);
  const qc = useQueryClient();

  const { data, isPending, isError } = useQuery({
    queryKey: ["client-intake"],
    queryFn: () => load(),
    staleTime: 30_000,
    retry: 1,
  });

  if (isPending) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center text-sm text-muted-foreground">
        Loading…
      </div>
    );
  }

  if (isError || !data?.required || !data.clientId) return <>{children}</>;

  return (
    <ClientIntakeForm
      clientId={data.clientId}
      clientName={data.clientName ?? null}
      initial={data.draft?.details ?? null}
      onDone={() => {
        void qc.invalidateQueries({ queryKey: ["client-intake"] });
      }}
    />
  );
}
