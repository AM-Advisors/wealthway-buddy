import { ExternalLink } from "lucide-react";

import { Badge } from "@/components/ui/badge";

/**
 * Marks an action that depends on someone outside Harmonious, so no screen
 * implies Harmonious controls or guarantees the outcome.
 */
export function ThirdPartyBadge({ provider }: { provider: string }) {
  return (
    <Badge variant="outline" className="gap-1 font-normal">
      <ExternalLink className="h-3 w-3" />
      Depends on {provider}
    </Badge>
  );
}

export function ThirdPartyNote({ provider }: { provider: string }) {
  return (
    <p className="text-xs text-muted-foreground">
      {provider} performs this step independently. Harmonious prepares and submits the request and
      tracks it, but cannot guarantee the timing or the outcome.
    </p>
  );
}
