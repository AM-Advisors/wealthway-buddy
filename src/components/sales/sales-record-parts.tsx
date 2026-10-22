import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Check } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Panel } from "@/components/sales/sales-ui";
import type { ProgressStep } from "@/lib/sales-progress";
import { logSalesLinkCopy, salesDocumentPersonLinks } from "@/lib/sales-documents.functions";

export function SalesProgress({ steps }: { steps: ProgressStep[] }) {
  return (
    <ol className="flex flex-wrap items-center gap-1 text-xs" aria-label="Progress">
      {steps.map((s, i) => (
        <li key={s.key} className="flex items-center gap-1">
          <span className={`flex items-center gap-1 rounded-full border px-2.5 py-1 ${s.done ? "border-primary bg-primary text-primary-foreground" : "text-muted-foreground"}`} title={s.at ? new Date(s.at).toLocaleString() : undefined}>
            {s.done && <Check className="h-3 w-3" />}{s.label}
          </span>
          {i < steps.length - 1 && <span className="h-px w-3 bg-border" />}
        </li>
      ))}
    </ol>
  );
}

/** Each recipient's personal link: signers open review-and-sign, others a view-only page. */
export function RecipientLinks({ documentId, addOn }: { documentId: string; addOn?: boolean }) {
  const load = useServerFn(salesDocumentPersonLinks);
  const log = useServerFn(logSalesLinkCopy);
  const q = useQuery({ queryKey: ["sales-person-links", documentId], queryFn: () => load({ data: { id: documentId } }) });
  const copy = async (url: string, email: string, kind: "sign" | "view") => {
    await navigator.clipboard.writeText(url);
    toast.success(kind === "sign" ? "Sign link copied" : "Review link copied");
    log({ data: { id: documentId, email, kind } }).catch(() => undefined);
  };
  return (
    <Panel title="Recipients & signing">
      {addOn && <Badge variant="secondary" className="mb-2">Adding services for a current client</Badge>}
      {q.isLoading ? <p className="text-sm text-muted-foreground">Loading…</p>
        : !q.data?.version ? <p className="text-sm text-muted-foreground">Personal links appear once this version is approved.</p>
        : !q.data.people.length ? <p className="text-sm text-muted-foreground">No client contacts with an email yet.</p>
        : (
          <ul className="space-y-3">
            {q.data.people.map((p) => (
              <li key={p.email} className="text-sm">
                <div className="flex items-center justify-between gap-2">
                  <span className="min-w-0"><span className="font-medium">{p.name}</span><span className="block truncate text-xs text-muted-foreground">{p.email}</span></span>
                  <Badge variant={p.signed ? "default" : "outline"}>{p.signed ? "Signed" : p.role === "signer" ? "Can sign" : "View only"}</Badge>
                </div>
                <div className="mt-1 flex gap-2">
                  {p.signUrl && <Button size="sm" variant="outline" onClick={() => copy(p.signUrl!, p.email, "sign")}>Copy sign link</Button>}
                  <Button size="sm" variant="ghost" onClick={() => copy(p.viewUrl, p.email, "view")}>Copy review link</Button>
                  {p.signUrl && <Button size="sm" variant="ghost" asChild><a href={p.signUrl} target="_blank" rel="noreferrer">Open</a></Button>}
                </div>
              </li>
            ))}
            <li className="text-xs text-muted-foreground">Version {q.data.version}. Links for older versions show that a newer one is available.</li>
          </ul>
        )}
    </Panel>
  );
}
