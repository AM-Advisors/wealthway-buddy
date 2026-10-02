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
  const { PDFDocument, StandardFonts, rgb } = await import("pdf-lib");
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const W = 612, H = 792, M = 50, maxW = W - M * 2;
  let page = doc.addPage([W, H]);
  let y = H - M;
  const clean = (s: string) => s.replace(/[^\x20-\x7E]/g, "-");
  const wrap = (text: string, f: typeof font, size: number, width: number) => {
    const out: string[] = []; let line = "";
    for (const w of clean(text).split(" ")) {
      const t = line ? `${line} ${w}` : w;
      if (f.widthOfTextAtSize(t, size) > width && line) { out.push(line); line = w; } else line = t;
    }
    if (line) out.push(line);
    return out.length ? out : [""];
  };
  const need = (h: number) => { if (y - h < M) { page = doc.addPage([W, H]); y = H - M; } };
  const text = (s: string, f: typeof font, size: number, x = M, width = maxW, color = rgb(0.13, 0.12, 0.13)) => {
    for (const l of wrap(s, f, size, width)) { need(size + 4); page.drawText(l, { x, y: y - size, size, font: f, color }); y -= size + 4; }
  };
  text(form.title, bold, 15);
  text(form.subtitle, font, 11);
  y -= 4; text(form.where, font, 9);
  for (const n of form.notices) text(n, font, 9, M, maxW, rgb(0.6, 0.1, 0.1));
  for (const s of form.sections) {
    y -= 8; need(30);
    page.drawRectangle({ x: M, y: y - 16, width: maxW, height: 16, color: rgb(0.08, 0.15, 0.28) });
    page.drawText(clean(s.title), { x: M + 4, y: y - 12, size: 10, font: bold, color: rgb(1, 1, 1) });
    y -= 20;
    for (const fld of s.fields) {
      const labelLines = wrap(fld.label, font, 9, 250);
      const valueLines = fld.needsEntry ? ["NEEDS ENTRY"] : wrap(fld.value || "-", bold, 9, maxW - 262);
      const h = Math.max(labelLines.length, valueLines.length) * 12 + 4;
      need(h);
      labelLines.forEach((l, i) => page.drawText(l, { x: M, y: y - 10 - i * 12, size: 9, font, color: rgb(0.35, 0.35, 0.35) }));
      valueLines.forEach((l, i) => page.drawText(l, { x: M + 262, y: y - 10 - i * 12, size: 9, font: bold, color: fld.needsEntry ? rgb(0.75, 0.1, 0.1) : rgb(0.13, 0.12, 0.13) }));
      y -= h;
      page.drawLine({ start: { x: M, y: y + 1 }, end: { x: W - M, y: y + 1 }, thickness: 0.3, color: rgb(0.85, 0.85, 0.85) });
    }
  }
  const pages = doc.getPages();
  pages.forEach((p, i) => p.drawText(`Harmonious - prepared for manual filing - page ${i + 1} of ${pages.length}`, { x: M, y: 24, size: 7, font, color: rgb(0.5, 0.5, 0.5) }));
  const bytes = await doc.save();
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
