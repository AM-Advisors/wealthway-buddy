import { useMutation, useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { listVisibleImportedDocuments, openVisibleImportedDocument } from "@/lib/drive-import-docs.functions";

/**
 * Historical and imported records, shown alongside the other documents on the
 * page. The server decides what this person may see; nothing renders when
 * there's nothing for them.
 */
export function ImportedDocumentsList({ offeringId, title = "Historical records" }: { offeringId?: string; title?: string }) {
  const list = useServerFn(listVisibleImportedDocuments);
  const open = useServerFn(openVisibleImportedDocument);
  const [search, setSearch] = useState("");
  const { data } = useQuery({
    queryKey: ["imported-documents", offeringId ?? "all", search],
    queryFn: () => list({ data: { offeringId, search: search || undefined } }),
  });
  const rows = data?.rows ?? [];
  const opener = useMutation({
    mutationFn: (id: string) => open({ data: { id } }),
    onSuccess: (r) => window.open(r.url, "_blank", "noopener,noreferrer"),
    onError: (e: any) => toast.error(e?.message ?? "Could not open that document."),
  });
  if (!rows.length && !search) return null;

  return (
    <Card className="mt-6">
      <CardHeader>
        <CardTitle className="text-base">{title}</CardTitle>
        <CardDescription>Documents on file with Harmonious. Copies are kept unchanged; newer versions never replace older ones.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <Input placeholder="Search these documents" value={search} onChange={(e) => setSearch(e.target.value)} aria-label="Search historical records" />
        {rows.length === 0 ? <p className="text-sm text-muted-foreground">No matching documents.</p> : null}
        <ul className="divide-y">
          {rows.map((r) => (
            <li key={r.id} className="flex flex-col gap-2 py-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="min-w-0">
                <p className="truncate font-medium">{r.title}</p>
                <p className="text-sm text-muted-foreground">
                  {r.documentType} · {r.status}
                  {r.version > 1 ? ` · Version ${r.version}` : ""}
                  {r.date ? ` · ${new Date(r.date).toLocaleDateString()}` : ""}
                </p>
                <div className="mt-1 flex flex-wrap gap-1">
                  {r.execution ? <Badge variant="outline">{r.execution}</Badge> : null}
                  {r.review ? <Badge variant="secondary">{r.review}</Badge> : null}
                  {r.source ? (
                    <Badge variant="outline">
                      Source: {r.source.label} · Imported {new Date(r.source.importedAt).toLocaleDateString()} by {r.source.importedBy}
                      {r.source.history > 1 ? ` · ${r.source.history} versions` : ""}
                    </Badge>
                  ) : null}
                </div>
              </div>
              <Button size="sm" variant="outline" onClick={() => opener.mutate(r.id)} disabled={opener.isPending}>
                Open
              </Button>
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}
