import { Download, Eye, EyeOff } from "lucide-react";
import { useState } from "react";

import { Button } from "@/components/ui/button";

export type ReaderSection = { no?: string | number | null; title?: string | null; body: string };

/** Builds a plain PDF of the exact text being signed and saves it. */
export async function downloadAgreementPdf(title: string, sections: ReaderSection[], filename: string) {
  const { jsPDF } = await import("jspdf");
  const doc = new jsPDF({ unit: "pt", format: "letter" });
  const margin = 54;
  const width = doc.internal.pageSize.getWidth() - margin * 2;
  const bottom = doc.internal.pageSize.getHeight() - margin;
  let y = margin;
  const write = (text: string, size: number, bold = false) => {
    doc.setFont("helvetica", bold ? "bold" : "normal");
    doc.setFontSize(size);
    for (const line of doc.splitTextToSize(text, width) as string[]) {
      if (y + size > bottom) { doc.addPage(); y = margin; }
      doc.text(line, margin, y);
      y += size * 1.4;
    }
  };
  write(title, 15, true);
  y += 8;
  for (const s of sections) {
    const head = [s.no ? `${s.no}.` : "", s.title ?? ""].join(" ").trim();
    if (head) write(head, 11, true);
    write(s.body ?? "", 10);
    y += 8;
  }
  doc.save(filename);
}

/**
 * Inline, optional reader: opening it is never required to sign, and the text
 * scrolls inside a fixed-height box so long agreements don't stretch the page.
 */
export function AgreementReader({ title, sections, filename }: { title: string; sections: ReaderSection[]; filename: string }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-2">
        <Button type="button" size="sm" variant="outline" onClick={() => setOpen((v) => !v)}>
          {open ? <EyeOff className="mr-2 h-4 w-4" /> : <Eye className="mr-2 h-4 w-4" />}
          {open ? "Hide" : "Read"}
        </Button>
        <Button type="button" size="sm" variant="outline" onClick={() => void downloadAgreementPdf(title, sections, filename)}>
          <Download className="mr-2 h-4 w-4" />Download PDF
        </Button>
      </div>
      {open && (
        <div className="max-h-96 space-y-3 overflow-y-auto rounded-md border bg-muted/30 p-3 text-sm">
          {sections.map((x, i) => (
            <div key={i}>
              {(x.no || x.title) && <p className="font-semibold">{x.no ? `${x.no}. ` : ""}{x.title}</p>}
              <p className="whitespace-pre-wrap">{x.body}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
