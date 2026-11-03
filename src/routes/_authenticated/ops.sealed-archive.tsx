import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { listSealedRecordsFn, openSealedRecordFn } from "@/lib/sealed-archive.functions";

export const Route = createFileRoute("/_authenticated/ops/sealed-archive")({
  head: () => ({
    meta: [
      { title: "Sealed archive | Harmonious Operations" },
      { name: "description", content: "Retained records hidden from every view. Super Admin access with a recorded reason." },
      { property: "og:title", content: "Sealed archive | Harmonious Operations" },
      { property: "og:description", content: "Retained records hidden from every view. Super Admin access with a recorded reason." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: SealedArchivePage,
});

function SealedArchivePage() {
  const load = useServerFn(listSealedRecordsFn);
  const open = useServerFn(openSealedRecordFn);
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ["sealed-archive"], queryFn: () => load(), retry: false });
  const [reason, setReason] = useState<Record<string, string>>({});
  const [err, setErr] = useState<string | null>(null);
  return (
    <div className="mx-auto max-w-3xl space-y-4 p-4">
      <div>
        <h1 className="text-2xl">Sealed archive</h1>
        <p className="text-base text-muted-foreground">These records are hidden everywhere on the platform. They are kept only for legal retention. Opening one requires a written reason and is recorded.</p>
      </div>
      {q.error && <p className="text-destructive">{(q.error as Error).message}</p>}
      {err && <p className="text-destructive">{err}</p>}
      {(q.data ?? []).map((r: any) => (
        <Card key={r.id}><CardContent className="space-y-2 p-4">
          <div className="font-medium">{r.label}</div>
          <p className="text-sm text-muted-foreground">{r.reason} · Sealed {new Date(r.sealed_at).toLocaleDateString()}</p>
          <Textarea placeholder="Why do you need to open this? (at least 10 characters)" value={reason[r.id] ?? ""} onChange={(e) => setReason({ ...reason, [r.id]: e.target.value })} />
          <Button disabled={(reason[r.id] ?? "").trim().length < 10} onClick={async () => {
            setErr(null);
            try { const { url } = await open({ data: { id: r.id, reason: reason[r.id]! } }); window.open(url, "_blank", "noopener"); qc.invalidateQueries({ queryKey: ["sealed-archive"] }); }
            catch (e) { setErr((e as Error).message); }
          }}>Open with reason</Button>
          {r.openings.length > 0 && <p className="text-sm text-muted-foreground">Opened {r.openings.length} time(s). Last: {new Date(r.openings[0].opened_at).toLocaleString()}</p>}
        </CardContent></Card>
      ))}
    </div>
  );
}
