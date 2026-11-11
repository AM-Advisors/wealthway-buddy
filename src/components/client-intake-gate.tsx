import { useState, type ReactNode } from "react";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";

import { FundRequestEngine } from "@/components/fund-request-engine";
import { getIntakeRequirement } from "@/lib/client-intake.functions";

/** A new client's main contacts tell us about their first fund before the portal opens. */
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
  return <FirstFundRequest clientId={data.clientId} draftId={data.draft?.id ?? null} onDone={() => { void qc.invalidateQueries({ queryKey: ["client-intake"] }); }} />;
}

function FirstFundRequest({ clientId, draftId, onDone }: { clientId: string; draftId: string | null; onDone: () => void }) {
  // The draft is read once; later refreshes never reload it over what is being typed.
  const [initialDraft] = useState(draftId);

  // The same Add Fund or SPV form every client uses, so the answers land in the new fund's Setup.
  return (
    <main className="mx-auto max-w-5xl bg-background px-4 py-6">
      <FundRequestEngine
        clientId={clientId}
        draft={initialDraft ?? undefined}
        mode="client"
        onSubmitted={onDone}
      />
    </main>
  );
}
