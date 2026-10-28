import { useQuery } from "@tanstack/react-query";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ViewAsPicker } from "@/components/view-as";
import { supabase } from "@/integrations/supabase/client";

/** Client 360 entry point to the existing read-only View As for each of the client's funds. */
export function ClientViewAsCard({ clientId }: { clientId: string }) {
  const q = useQuery({
    queryKey: ["client-view-as-funds", clientId],
    queryFn: async () => {
      const { data, error } = await supabase.from("offerings").select("id, name").eq("client_id", clientId).order("name");
      if (error) throw new Error("Funds could not be loaded.");
      return data ?? [];
    },
  });
  return (
    <Card>
      <CardHeader>
        <CardTitle>View as client</CardTitle>
        <CardDescription>See exactly what this client's people see. Read-only, logged and time-limited; nothing can be changed or approved for them.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-2">
        {q.isPending ? <p className="text-sm text-muted-foreground">Loading…</p>
          : q.isError ? <p className="text-sm text-destructive">Funds could not be loaded.</p>
          : !q.data.length ? <p className="text-sm text-muted-foreground">This client has no funds to preview yet.</p>
          : q.data.map((f) => (
            <div key={f.id} className="flex items-center justify-between gap-3 rounded-md border p-3">
              <span className="text-sm font-medium">{f.name}</span>
              <ViewAsPicker offeringId={f.id} label="View as client" />
            </div>
          ))}
      </CardContent>
    </Card>
  );
}
