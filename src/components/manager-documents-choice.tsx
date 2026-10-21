import { useState, type ReactNode } from "react";

import { Button } from "@/components/ui/button";
import { FundTypeDocumentsCard } from "@/components/fund-tabs/fund-type-documents-card";
import { TemplateDocumentsCard } from "@/components/fund-tabs/template-documents-card";

/** Fund managers choose: generate offering documents from Harmonious templates, or upload their own. */
export function ManagerDocumentsChoice({ offeringId, upload }: { offeringId: string; upload: ReactNode }) {
  const [mode, setMode] = useState<"templates" | "upload">("templates");
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2">
        <Button type="button" size="sm" variant={mode === "templates" ? "default" : "outline"} onClick={() => setMode("templates")}>Create from Harmonious templates</Button>
        <Button type="button" size="sm" variant={mode === "upload" ? "default" : "outline"} onClick={() => setMode("upload")}>Upload my own</Button>
      </div>
      {mode === "templates" ? (
        <>
          <p className="text-sm text-muted-foreground">We fill each document from your fund details. Review it, then sign it here.</p>
          <FundTypeDocumentsCard fundId={offeringId} />
          <TemplateDocumentsCard fundId={offeringId} />
        </>
      ) : upload}
    </div>
  );
}
