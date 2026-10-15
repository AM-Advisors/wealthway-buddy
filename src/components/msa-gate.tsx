import type { ReactNode } from "react";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";

import { MsaSigningPanel } from "@/components/msa-signing-panel";
import { getMsaGateStatus } from "@/lib/agreements.functions";

/**
 * Blocks the client portal until every client the user belongs to has signed
 * the current published MSA. New client users sign on first login; existing
 * clients re-sign when a new version is published. Staff and users with no
 * client membership are never gated.
 */
export function MsaGate({ children }: { children: ReactNode }) {
  const load = useServerFn(getMsaGateStatus);
  const qc = useQueryClient();

  const { data, isPending, isError } = useQuery({
    queryKey: ["msa-gate"],
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

  if (isError || !data?.gated) return <>{children}</>;

  return (
    <main className="mx-auto w-full max-w-3xl px-4 py-10">
      <div className="mb-6">
        <h1 className="text-2xl font-semibold tracking-tight">
          Review and sign the Master Services Agreement
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {data.clientName ? `${data.clientName} needs to accept` : "Your organisation needs to accept"}{" "}
          version {data.version} of the Harmonious Master Services Agreement before the portal
          opens. This takes a couple of minutes.
        </p>
      </div>
      <MsaSigningPanel
        clientId={data.clientId}
        onSigned={() => {
          void qc.invalidateQueries({ queryKey: ["msa-gate"] });
        }}
      />
    </main>
  );
}
