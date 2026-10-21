import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { accreditationFileUrlFn, decideAccreditationFn, listPendingAccreditationsFn } from "@/lib/accreditation-step.functions";

/** Fund → Approvals: 506(c) accreditation paperwork the manager (or Harmonious) verifies. */
export function AccreditationReviews({ offeringId }: { offeringId: string }) {
  const qc = useQueryClient();
  const list = useServerFn(listPendingAccreditationsFn);
  const open = useServerFn(accreditationFileUrlFn);
  const decide = useServerFn(decideAccreditationFn);
  const [notes, setNotes] = useState<Record<string, string>>({});
  const q = useQuery({ queryKey: ["accreditation-reviews", offeringId], queryFn: () => list({ data: { offeringId } }), retry: false });
  if (!q.data?.length) return null;
  const run = async (applicationId: string, decision: "approved" | "rejected") => {
    try {
      await decide({ data: { applicationId, decision, notes: notes[applicationId] ?? "" } });
      toast.success(decision === "approved" ? "Accreditation verified" : "Sent back to the investor");
      qc.invalidateQueries({ queryKey: ["accreditation-reviews", offeringId] });
    } catch (e) { toast.error((e as Error).message); }
  };
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Accreditation to verify</CardTitle>
        <CardDescription>This fund requires verified accreditation. Review each investor's paperwork, then verify or send it back.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {q.data.map((r) => (
          <div key={r.applicationId} className="space-y-2 rounded-md border p-3 text-sm">
            <div className="font-medium">{r.investor}</div>
            <div className="flex flex-wrap gap-2">
              {r.documents.length ? r.documents.map((doc) => (
                <Button key={doc.id} size="sm" variant="link" className="px-0" onClick={async () => {
                  try { const { url } = await open({ data: { documentId: doc.id } }); window.open(url, "_blank", "noopener"); } catch (e) { toast.error((e as Error).message); }
                }}>{doc.name}</Button>
              )) : <span className="text-muted-foreground">No files uploaded.</span>}
            </div>
            <Input placeholder="Note (required to send back)" value={notes[r.applicationId] ?? ""} onChange={(e) => setNotes({ ...notes, [r.applicationId]: e.target.value })} />
            <div className="flex gap-2">
              <Button size="sm" onClick={() => run(r.applicationId, "approved")}>Verify</Button>
              <Button size="sm" variant="outline" onClick={() => run(r.applicationId, "rejected")}>Send back</Button>
            </div>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
