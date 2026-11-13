import { Download } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

/** Fixed, blank questionnaire files shipped with the app (public/downloads). Nothing here reads or stores fund data. */
export const PORTFOLIO_DDQ_FILES = [
  { href: "/downloads/Harmonious-Portfolio-Company-DDQ.docx", label: "Word", note: "Type answers directly into the document" },
  { href: "/downloads/Harmonious-Portfolio-Company-DDQ.pdf", label: "PDF", note: "Fill in on screen and sign" },
  { href: "/downloads/Harmonious-Portfolio-Company-DDQ.xlsx", label: "Excel", note: "Tracks answers and requested documents" },
] as const;

export function PortfolioCompanyDdqCard() {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Portfolio company due diligence questionnaire</CardTitle>
        <CardDescription>
          Send this to a company you are considering investing in. It covers 17 areas, from ownership and finances to legal, privacy and investor reporting, and marks which questions apply to companies at every stage.
        </CardDescription>
      </CardHeader>
      <CardContent className="grid gap-2 sm:grid-cols-3">
        {PORTFOLIO_DDQ_FILES.map((f) => (
          <Button key={f.href} asChild variant="outline" className="h-auto justify-start whitespace-normal py-3 text-left">
            <a href={f.href} download={f.href.split("/").pop()}>
              <Download className="mr-2 h-4 w-4 shrink-0" aria-hidden />
              <span>
                <span className="block font-medium">Download {f.label}</span>
                <span className="block text-xs font-normal text-muted-foreground">{f.note}</span>
              </span>
            </a>
          </Button>
        ))}
      </CardContent>
    </Card>
  );
}
