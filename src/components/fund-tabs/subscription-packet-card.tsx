import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Download, FileText, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { downloadSubscriptionPacketFn } from "@/lib/fund-tabs.functions";

function deliver(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a"); a.href = url; a.download = name;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 30_000);
}

/** One branded PDF of the fund's current approved documents, form and tax forms. Generate first, then download (works on iPhone). */
export function SubscriptionPacketCard({ fundId }: { fundId: string }) {
  const build = useServerFn(downloadSubscriptionPacketFn);
  const [file, setFile] = useState<{ blob: Blob; name: string; missing: string[] } | null>(null);
  const m = useMutation({
    mutationFn: () => build({ data: { fundId } }),
    onSuccess: (r) => {
      const bin = atob(r.base64); const bytes = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
      setFile({ blob: new Blob([bytes], { type: "application/pdf" }), name: r.fileName, missing: r.missing });
    },
    onError: (e: Error) => toast.error(e.message || "Couldn't prepare the packet."),
  });
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base"><FileText className="h-5 w-5" aria-hidden />Subscription packet</CardTitle>
        <CardDescription>
          One PDF with a cover page, the fund at a glance, step-by-step instructions, every approved fund document, the Subscriber Information Form and the IRS tax forms. Wire instructions are not included.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {!file ? (
          <Button size="lg" disabled={m.isPending} onClick={() => m.mutate()}>
            {m.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <FileText className="mr-2 h-4 w-4" />}
            {m.isPending ? "Preparing packet…" : "Prepare subscription packet"}
          </Button>
        ) : (
          <div className="flex flex-wrap gap-2">
            <Button size="lg" onClick={() => deliver(file.blob, file.name)}><Download className="mr-2 h-4 w-4" />Download subscription packet</Button>
            <Button size="lg" variant="outline" onClick={() => { setFile(null); m.mutate(); }}>Prepare again</Button>
          </div>
        )}
        {file && file.missing.length > 0 && (
          <p className="text-sm text-muted-foreground">Not included yet because it still needs approval: {file.missing.join(", ")}.</p>
        )}
        <Button asChild variant="outline" className="whitespace-normal text-left">
          <a href="/downloads/Harmonious-Add-a-Paperwork-Helper.pdf" download><Download className="mr-2 h-4 w-4 shrink-0" aria-hidden />Client instructions: add a paperwork helper</a>
        </Button>
      </CardContent>
    </Card>
  );
}
