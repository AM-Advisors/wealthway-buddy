import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Download, FileText, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { getMyPacketLink } from "@/lib/offering-packet.functions";

/**
 * Lets an investor pull the current offering packet straight from the room,
 * without waiting for someone to email them a link.
 */
export function PacketDownloadCard({ offeringId }: { offeringId: string }) {
  const getLink = useServerFn(getMyPacketLink);
  const [note, setNote] = useState<string | null>(null);

  const download = useMutation({
    mutationFn: () => getLink({ data: { fundId: offeringId } }),
    onSuccess: (result) => {
      setNote(
        result.includeWire
          ? "Your packet includes the fund documents and the wire instructions."
          : "Your packet includes the fund documents.",
      );
      window.open(result.url, "_blank", "noopener,noreferrer");
    },
    onError: (error) =>
      toast.error(error instanceof Error ? error.message : "Could not prepare the packet."),
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-lg">
          <FileText className="h-5 w-5" aria-hidden="true" />
          Offering packet
        </CardTitle>
        <CardDescription>
          One PDF with the fund summary, the documents you need to review, and — where we have
          shared them with you — the wire instructions.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <Button onClick={() => download.mutate()} disabled={download.isPending}>
          {download.isPending ? (
            <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" />
          ) : (
            <Download className="mr-2 h-4 w-4" aria-hidden="true" />
          )}
          Download the packet
        </Button>
        {note ? <p className="text-xs text-muted-foreground">{note}</p> : null}
        <p className="text-xs text-muted-foreground">
          The packet always reflects the latest documents. We will never email you a change of bank
          details — always confirm wire instructions by phone before sending funds.
        </p>
      </CardContent>
    </Card>
  );
}
