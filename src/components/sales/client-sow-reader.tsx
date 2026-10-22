import { Badge } from "@/components/ui/badge";
import { SOW_ROLE_DISCLAIMER } from "@/lib/agreement-templates";
import type { ClientSowSection } from "@/lib/client-sow-view";

export type ClientSowView = { title: string; status: string; effectiveDate: string | null; clientSignedAt: string | null; executedAt: string | null; sections: ClientSowSection[] };

export function ClientSowReader({ sow }: { sow: ClientSowView | null }) {
  if (!sow) return <section className="py-6"><h2 className="font-heading text-xl font-semibold">Statement of Work</h2><p className="mt-3 text-sm text-muted-foreground">The linked Statement of Work is not available for this version. Please contact your Harmonious representative.</p></section>;
  return <article className="space-y-6 py-5" aria-label="Statement of Work">
    <header className="space-y-2 border-b pb-5">
      <div className="flex flex-wrap items-center justify-between gap-2"><h2 className="font-heading text-xl font-semibold">Statement of Work</h2><Badge variant="outline">{sow.executedAt ? "Executed" : sow.clientSignedAt ? "Client signed" : "Proposed"}</Badge></div>
      <p className="break-words text-lg font-medium">{sow.title}</p>
      {sow.effectiveDate && <p className="text-sm text-muted-foreground">Effective date: {sow.effectiveDate}</p>}
    </header>
    {sow.sections.map(section => <section key={section.key} className="space-y-2"><h3 className="font-heading font-semibold text-primary">{section.title}</h3><p className="whitespace-pre-wrap break-words text-sm leading-relaxed">{section.body}</p></section>)}
    <section className="space-y-2 border-t pt-5"><h3 className="font-heading font-semibold">Signatures</h3>
      <p className="text-sm text-muted-foreground">Client: {sow.clientSignedAt ? `Signed on ${new Date(sow.clientSignedAt).toLocaleDateString("en-US")}` : "Pending"}</p>
      <p className="text-sm text-muted-foreground">Harmonious: {sow.executedAt ? `Executed on ${new Date(sow.executedAt).toLocaleDateString("en-US")}` : "Pending countersignature"}</p>
    </section>
    <section className="space-y-2"><h3 className="font-heading font-semibold">Harmonious's role</h3><p className="whitespace-pre-wrap text-xs leading-relaxed text-muted-foreground">{SOW_ROLE_DISCLAIMER}</p></section>
  </article>;
}