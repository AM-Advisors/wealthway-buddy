import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { requestService } from "@/lib/contracts.functions";

export type ScopeService = {
  key: string;
  name: string;
  category: string;
  description?: string | null;
  status: string;
  material?: boolean;
  harmoniousHandles?: string | null;
  clientHandles?: string | null;
  thirdPartyHandles?: string | null;
  thirdPartyDependency?: string | null;
  requiredDocuments?: string[];
  requiredApprovals?: string[];
  requiredChecks?: string[];
  note?: string | null;
};

export function statusLabel(status: string) {
  switch (status) {
    case "included":
      return "Included in scope";
    case "optional":
      return "Optional";
    case "requested":
      return "Pending approval";
    case "not_included":
      return "Not in scope";
    default:
      return "Scope not recorded";
  }
}

export function statusTone(status: string): "default" | "secondary" | "outline" | "destructive" {
  if (status === "included") return "default";
  if (status === "requested") return "secondary";
  if (status === "not_included") return "destructive";
  return "outline";
}

/**
 * Wraps any service area. Children only render when the service is included
 * in the active statement of work (or when scope has not been recorded yet,
 * so existing funds keep working until their scope is entered).
 */
export function ServiceGate({
  service,
  clientId,
  offeringId,
  children,
}: {
  service: ScopeService | undefined;
  clientId?: string | null;
  offeringId?: string | null;
  children: React.ReactNode;
}) {
  if (!service || service.status === "included" || service.status === "unset") {
    return <>{children}</>;
  }
  return (
    <RequestServiceCard service={service} clientId={clientId ?? null} offeringId={offeringId ?? null} />
  );
}

export function RequestServiceCard({
  service,
  clientId,
  offeringId,
}: {
  service: ScopeService;
  clientId?: string | null;
  offeringId?: string | null;
}) {
  const [note, setNote] = useState("");
  const [open, setOpen] = useState(false);
  const send = useServerFn(requestService);
  const queryClient = useQueryClient();

  const mutation = useMutation({
    mutationFn: () =>
      send({
        data: {
          clientId: clientId as string,
          offeringId: offeringId ?? null,
          serviceKey: service.key,
          note,
        },
      }),
    onSuccess: () => {
      toast.success("Request sent to Harmonious.");
      setOpen(false);
      setNote("");
      queryClient.invalidateQueries();
    },
    onError: (error: any) => toast.error(error?.message ?? "That didn't send."),
  });

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div>
            <CardTitle className="text-base">{service.name}</CardTitle>
            <CardDescription>
              This service is not currently included in your active scope.
            </CardDescription>
          </div>
          <Badge variant={statusTone(service.status)}>{statusLabel(service.status)}</Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {service.status === "requested" ? (
          <p className="text-sm text-muted-foreground">
            Harmonious is reviewing this request. It becomes available once the scope and fee are
            agreed in writing.
          </p>
        ) : !clientId ? (
          <p className="text-sm text-muted-foreground">
            Ask your Harmonious contact to add this service to your statement of work.
          </p>
        ) : open ? (
          <div className="space-y-2">
            <Textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Tell us what you need and by when."
              rows={3}
            />
            <div className="flex gap-2">
              <Button size="sm" disabled={mutation.isPending} onClick={() => mutation.mutate()}>
                Send request
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setOpen(false)}>
                Cancel
              </Button>
            </div>
          </div>
        ) : (
          <Button size="sm" variant="outline" onClick={() => setOpen(true)}>
            Request service
          </Button>
        )}
      </CardContent>
    </Card>
  );
}
