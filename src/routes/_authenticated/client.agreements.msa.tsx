import { useQuery } from "@tanstack/react-query";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { ArrowLeft } from "lucide-react";

import { MsaSigningPanel } from "@/components/msa-signing-panel";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { getAgreementsHome, getMsaWorkspace } from "@/lib/agreements.functions";

export const Route = createFileRoute("/_authenticated/client/agreements/msa")({
  component: MsaPage,
});

function MsaPage() {
  const home = useServerFn(getAgreementsHome);
  const loadMsa = useServerFn(getMsaWorkspace);
  const navigate = useNavigate();

  const { data: homeData } = useQuery({
    queryKey: ["agreements-home"],
    queryFn: () => home({ data: {} }),
  });
  const clientId = homeData?.clientId ?? null;

  const { data } = useQuery({
    queryKey: ["msa-workspace", clientId],
    queryFn: () => loadMsa({ data: { clientId: clientId! } }),
    enabled: Boolean(clientId),
  });

  const executed = Boolean(data?.agreement?.executedAt);
  const clientSigned = !executed && data?.agreement?.status === "client_signed";

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <Button asChild variant="ghost" size="sm" className="-ml-2 mb-1">
            <Link to="/client/agreements">
              <ArrowLeft className="mr-1 h-4 w-4" /> Agreements
            </Link>
          </Button>
          <h1 className="text-2xl font-semibold tracking-tight">Master Services Agreement</h1>
          {data && (
            <p className="text-sm text-muted-foreground">
              Effective {new Date(data.version.effectiveDate).toLocaleDateString("en-US")}
            </p>
          )}
        </div>
        {data && (
          <Badge variant={executed ? "secondary" : "default"}>
            {executed ? "Active: signed by both" : clientSigned ? "Waiting on Harmonious countersignature" : "Review needed"}
          </Badge>
        )}
      </div>

      {clientId && (
        <MsaSigningPanel
          clientId={clientId}
          onSigned={() => navigate({ to: "/client/agreements" })}
        />
      )}
    </div>
  );
}
