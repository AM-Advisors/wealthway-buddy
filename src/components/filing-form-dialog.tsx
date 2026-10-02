import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Copy, Download } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { getFilingForm } from "@/lib/close-filings.functions";
import type { FilingForm } from "@/lib/filing-forms";

async function downloadPdf(form: FilingForm, fileName: string) {
  const { renderFilingPdf } = await import("@/lib/filing-pdf");
  const bytes = await renderFilingPdf(form);
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([bytes as BlobPart], { type: "application/pdf" }));
  a.download = fileName;
  a.click();
  URL.revokeObjectURL(a.href);
}

export function FilingFormDialog({ filingId, fileName, open, onOpenChange }: { filingId: string; fileName: string; open: boolean; onOpenChange: (o: boolean) => void }) {
  const load = useServerFn(getFilingForm);
  const q = useQuery({ queryKey: ["filing-form", filingId], queryFn: () => load({ data: { id: filingId } }), enabled: open });
  const form = q.data as FilingForm | undefined;
  const missing = form?.sections.reduce((n, s) => n + s.fields.filter((x) => x.needsEntry).length, 0) ?? 0;
  const copy = (v: string) => navigator.clipboard.writeText(v).then(() => toast.success("Copied"));

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] max-w-3xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{form?.title ?? "Filing form"}</DialogTitle>
          <DialogDescription>{form ? `${form.subtitle}. ${form.where}` : "Loading..."}</DialogDescription>
        </DialogHeader>
        {q.error && <p className="text-sm text-destructive">{(q.error as Error).message}</p>}
        {form && (
          <div className="space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              {missing ? <Badge variant="destructive">{missing} field{missing === 1 ? "" : "s"} need entry</Badge> : <Badge variant="secondary">All fields filled</Badge>}
              <Button size="sm" onClick={() => downloadPdf(form, fileName).catch(() => toast.error("Couldn't create the PDF."))}><Download className="mr-1 h-4 w-4" />Download PDF</Button>
            </div>
            {form.sections.map((s) => (
              <div key={s.title} className="rounded border">
                <p className="bg-muted px-3 py-1.5 text-sm font-medium">{s.title}</p>
                <dl className="divide-y">
                  {s.fields.map((fld, i) => (
                    <div key={i} className="grid grid-cols-[1fr_1fr_auto] items-center gap-2 px-3 py-1.5 text-xs">
                      <dt className="text-muted-foreground">{fld.label}</dt>
                      <dd className={fld.needsEntry ? "font-medium text-destructive" : "font-medium"}>{fld.needsEntry ? "Needs entry" : fld.value}</dd>
                      {fld.needsEntry || !fld.value ? <span /> : <Button size="icon" variant="ghost" className="h-6 w-6" aria-label={`Copy ${fld.label}`} onClick={() => copy(fld.value)}><Copy className="h-3 w-3" /></Button>}
                    </div>
                  ))}
                </dl>
              </div>
            ))}
            {form.notices.map((n) => <p key={n} className="text-xs text-muted-foreground">{n}</p>)}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
