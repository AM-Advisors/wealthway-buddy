import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import { supabase } from "@/integrations/supabase/client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  entityDocumentUploadUrl, listEntityDocuments, openEntityDocument, recordEntityDocument, retireEntityDocument,
} from "@/lib/entity-documents.functions";
import { ENTITY_DOC_BUCKET, ENTITY_DOC_KINDS, entityDocKindLabel, type EntityDocKind } from "@/lib/entity-document-model";

const fmtDate = (d: string | null) => (d ? new Date(`${d.slice(0, 10)}T12:00:00`).toLocaleDateString("en-US", { dateStyle: "medium" }) : null);

export function EntityDocumentsCard({ entityId }: { entityId: string }) {
  const qc = useQueryClient();
  const list = useServerFn(listEntityDocuments);
  const open = useServerFn(openEntityDocument);
  const uploadUrl = useServerFn(entityDocumentUploadUrl);
  const record = useServerFn(recordEntityDocument);
  const retire = useServerFn(retireEntityDocument);
  const key = ["entity-documents", entityId];
  const { data, isLoading, error } = useQuery({ queryKey: key, queryFn: () => list({ data: { entityId } }) });

  const [adding, setAdding] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [title, setTitle] = useState("");
  const [kind, setKind] = useState<EntityDocKind>("other");
  const [effective, setEffective] = useState("");
  const [removing, setRemoving] = useState<string | null>(null);
  const [reason, setReason] = useState("");

  const add = useMutation({
    mutationFn: async () => {
      if (!file) throw new Error("Choose a file first.");
      const { path, token } = await uploadUrl({ data: { entityId, fileName: file.name } });
      const up = await supabase.storage.from(ENTITY_DOC_BUCKET).uploadToSignedUrl(path, token, file);
      if (up.error) throw new Error("The file could not be uploaded. Please try again.");
      await record({ data: { entityId, path, fileName: file.name, title: title.trim() || file.name, docKind: kind, effectiveDate: effective || null } });
    },
    onSuccess: () => {
      toast.success("Document added");
      setAdding(false); setFile(null); setTitle(""); setKind("other"); setEffective("");
      qc.invalidateQueries({ queryKey: key });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const remove = useMutation({
    mutationFn: (id: string) => retire({ data: { documentId: id, reason } }),
    onSuccess: () => {
      toast.success("Document removed from this list. The file is still kept.");
      setRemoving(null); setReason("");
      qc.invalidateQueries({ queryKey: key });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const view = async (id: string) => {
    const tab = window.open("", "_blank");
    try {
      const { url } = await open({ data: { documentId: id } });
      if (tab) tab.location.href = url; else window.location.href = url;
    } catch (e) {
      tab?.close();
      toast.error((e as Error).message);
    }
  };

  return (
    <Card className="mb-4">
      <CardHeader>
        <CardTitle className="text-base">Documents</CardTitle>
        <CardDescription>Formation, tax and governing documents for this company. Only the Harmonious team sees them.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-2">
        {isLoading && <p className="text-sm text-muted-foreground">Loading documents…</p>}
        {error && <p className="text-sm text-destructive">{(error as Error).message}</p>}
        {data && data.documents.length === 0 && <p className="text-sm text-muted-foreground">No documents yet.</p>}
        {data?.documents.map((d) => (
          <div key={d.id} className="rounded-md border p-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="min-w-0">
                <p className="text-sm font-medium">{d.title}</p>
                <p className="text-xs text-muted-foreground">
                  {entityDocKindLabel(d.docKind)}
                  {d.effectiveDate ? ` · dated ${fmtDate(d.effectiveDate)}` : ""}
                  {` · added ${fmtDate(d.addedAt)}`}
                </p>
              </div>
              <div className="flex items-center gap-2">
                {d.source === "google_drive" && <Badge variant="secondary">From Drive</Badge>}
                <Button size="sm" variant="outline" onClick={() => view(d.id)}>Open</Button>
                {data.canManage && removing !== d.id && (
                  <Button size="sm" variant="ghost" onClick={() => { setRemoving(d.id); setReason(""); }}>Remove</Button>
                )}
              </div>
            </div>
            {removing === d.id && (
              <div className="mt-3 space-y-2">
                <Label htmlFor={`reason-${d.id}`}>Why remove it? The file stays on record.</Label>
                <Input id={`reason-${d.id}`} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="For example: duplicate copy" />
                <div className="flex gap-2">
                  <Button size="sm" variant="destructive" disabled={reason.trim().length < 3 || remove.isPending} onClick={() => remove.mutate(d.id)}>
                    Remove document
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => setRemoving(null)}>Cancel</Button>
                </div>
              </div>
            )}
          </div>
        ))}

        {data?.canManage && (
          adding ? (
            <div className="space-y-3 rounded-md border p-3">
              <div className="space-y-1">
                <Label htmlFor="entity-doc-file">File (PDF, Word, PNG or JPG)</Label>
                <Input id="entity-doc-file" type="file" accept=".pdf,.docx,.png,.jpg,.jpeg" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
              </div>
              <div className="space-y-1">
                <Label htmlFor="entity-doc-title">Name</Label>
                <Input id="entity-doc-title" value={title} onChange={(e) => setTitle(e.target.value)} placeholder={file?.name ?? "Document name"} />
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1">
                  <Label htmlFor="entity-doc-kind">Kind</Label>
                  <select id="entity-doc-kind" className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm" value={kind} onChange={(e) => setKind(e.target.value as EntityDocKind)}>
                    {ENTITY_DOC_KINDS.map((k) => <option key={k.value} value={k.value}>{k.label}</option>)}
                  </select>
                </div>
                <div className="space-y-1">
                  <Label htmlFor="entity-doc-date">Document date (optional)</Label>
                  <Input id="entity-doc-date" type="date" value={effective} onChange={(e) => setEffective(e.target.value)} />
                </div>
              </div>
              <div className="flex gap-2">
                <Button size="sm" disabled={!file || add.isPending} onClick={() => add.mutate()}>{add.isPending ? "Adding…" : "Add document"}</Button>
                <Button size="sm" variant="ghost" onClick={() => setAdding(false)}>Cancel</Button>
              </div>
            </div>
          ) : (
            <Button size="sm" variant="outline" onClick={() => setAdding(true)}>Add a document</Button>
          )
        )}
      </CardContent>
    </Card>
  );
}
