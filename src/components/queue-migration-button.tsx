import { useServerFn } from "@tanstack/react-start";
import { useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { queueMigrationRequest } from "@/lib/migration-requests.functions";

/** Puts a Wix fund or Drive gap into the Migrations approval queue. Creates nothing else. */
export function QueueMigrationButton({ source, sourceRef, fundName }: { source: "wix" | "drive"; sourceRef: string; fundName: string }) {
  const queue = useServerFn(queueMigrationRequest);
  const qc = useQueryClient();
  const [busy, setBusy] = useState(false);
  return (
    <Button size="sm" disabled={busy} onClick={async () => {
      setBusy(true);
      try { await queue({ data: { source, sourceRef, fundName } }); toast.success("Sent to Migrations for approval"); qc.invalidateQueries({ queryKey: ["migration-requests"] }); }
      catch (e) { toast.error((e as Error).message); } finally { setBusy(false); }
    }}>Send to Migrations for approval</Button>
  );
}
