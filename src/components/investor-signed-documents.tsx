import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Download } from "lucide-react";
import { toast } from "sonner";
import { investorSignedCopyFn, investorSignedDocumentsFn } from "@/lib/investor-signed-documents.functions";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { LoadError } from "@/components/load-error";

export function InvestorSignedDocuments({ onboardingId }: { onboardingId: string }) {
  const load = useServerFn(investorSignedDocumentsFn);
  const download = useServerFn(investorSignedCopyFn);
  const [busy, setBusy] = useState<string | null>(null);
  const q = useQuery({ queryKey: ["investor-signed-documents", onboardingId], queryFn: () => load({ data: { onboardingId } }) });
  if (q.isPending) return <p className="text-sm text-muted-foreground">Loading signed documents…</p>;
  if (q.error) return <LoadError audience="account" error={q.error} what="Your signed documents" onRetry={() => void q.refetch()} />;
  if (!q.data?.length) return null;
  const open = async (signatureId: string) => {
    setBusy(signatureId);
    try {
      const result = await download({ data: { onboardingId, signatureId } });
      const link = document.createElement("a");
      link.href = result.url; link.download = ""; link.rel = "noreferrer"; link.click();
    } catch (error) { toast.error(error instanceof Error ? error.message : "Your signed copy could not be opened."); }
    finally { setBusy(null); }
  };
  return <section className="space-y-3" aria-label="Your signed documents">
    <h2 className="text-lg font-semibold">Your signed documents</h2>
    {q.data.map((d) => <div key={d.id} className="flex flex-wrap items-center justify-between gap-3 rounded-md border p-4">
      <div className="min-w-0 space-y-1">
        <p className="break-words font-medium">{d.title}</p>
        <p className="text-sm text-muted-foreground">{d.version != null ? `Version ${d.version}` : "Version not recorded"}{d.snapshotVersion != null ? ` · Signed record ${d.snapshotVersion}` : ""}{d.signedAt ? ` · ${new Date(d.signedAt).toLocaleDateString("en-US")}` : ""}</p>
        {d.replaced && <Badge variant="outline">Replaced · retained copy</Badge>}
      </div>
      {d.hasCopy ? <Button size="sm" variant="outline" disabled={busy !== null} onClick={() => void open(d.id)}><Download className="mr-2 h-4 w-4" />{busy === d.id ? "Opening…" : "Download signed copy"}</Button> : <span className="text-sm text-muted-foreground">Signed copy pending</span>}
    </div>)}
  </section>;
}