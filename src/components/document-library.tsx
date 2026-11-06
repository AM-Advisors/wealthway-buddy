import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { addDocumentTag, getDocumentLibrary, removeDocumentTag } from "@/lib/document-library.functions";
import { SECTION_ORDER } from "@/lib/document-sections";

type Scope = { investorUserId: string } | { offeringId: string };

/** Sectioned documents with tags and a read-only clean check. Same records on Investor 360 and the fund Documents page. */
export function DocumentLibrary({ scope }: { scope: Scope }) {
  const load = useServerFn(getDocumentLibrary);
  const key = ["document-library", scope];
  const q = useQuery({ queryKey: key, queryFn: () => load({ data: scope }) });
  if (q.isPending) return <Skeleton className="h-40 w-full" />;
  if (q.error) return <p className="text-sm text-muted-foreground">{(q.error as Error).message}</p>;
  const { docs, issues, staff } = q.data;
  const byInvestor = "offeringId" in scope;

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Document check</CardTitle>
          <CardDescription>Report only. Nothing is changed automatically.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-2">
          {issues.length === 0 ? <p className="text-sm">All clean: no duplicate copies, misfiled documents or extra current versions.</p> : issues.map((i, n) => (
            <div key={n} className="rounded-md border p-2 text-sm">
              <Badge variant="outline" className="mr-2">{i.kind === "duplicate" ? "Duplicate" : i.kind === "wrong_party" ? "Wrong investor or fund" : "Multiple current"}</Badge>
              {i.message}
              <div className="mt-1 flex flex-wrap gap-2">{i.docs.map((d) => <DocLinks key={d.source + d.id} doc={d} />)}</div>
            </div>
          ))}
        </CardContent>
      </Card>
      {SECTION_ORDER.map((s) => {
        const rows = docs.filter((d) => d.section === s.id);
        if (!rows.length && s.id === "other") return null;
        const current = rows.filter((d) => !d.replaced);
        const past = rows.filter((d) => d.replaced);
        return (
          <Card key={s.id} id={`docs-${s.id}`}>
            <CardHeader><CardTitle className="text-base">{s.title} <span className="text-sm font-normal text-muted-foreground">({current.length})</span></CardTitle></CardHeader>
            <CardContent className="space-y-2">
              {!rows.length && <p className="text-sm text-muted-foreground">No documents yet.</p>}
              {current.map((d) => <DocRow key={d.source + d.id} doc={d} staff={staff} showInvestor={byInvestor} queryKey={key} />)}
              {past.length > 0 && (
                <details>
                  <summary className="cursor-pointer text-sm text-muted-foreground">Past versions ({past.length})</summary>
                  <div className="mt-2 space-y-2">{past.map((d) => <DocRow key={d.source + d.id} doc={d} staff={staff} showInvestor={byInvestor} queryKey={key} />)}</div>
                </details>
              )}
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}

function DocLinks({ doc }: { doc: { investorUserId: string | null; offeringId: string | null; onboardingId: string | null; title: string } }) {
  return (
    <span className="flex flex-wrap gap-2 text-xs">
      {doc.investorUserId && <Link className="underline" to="/ops/investors/$investorId" params={{ investorId: doc.investorUserId }} search={{ tab: "documents" } as never}>Investor 360</Link>}
      {doc.offeringId && doc.onboardingId && <Link className="underline" to="/ops/fund/$fundId/investor/$onboardingId" params={{ fundId: doc.offeringId, onboardingId: doc.onboardingId }} search={{}}>Investment</Link>}
    </span>
  );
}

function DocRow({ doc, staff, showInvestor, queryKey }: { doc: any; staff: boolean; showInvestor: boolean; queryKey: unknown[] }) {
  const qc = useQueryClient();
  const add = useServerFn(addDocumentTag);
  const remove = useServerFn(removeDocumentTag);
  const [tag, setTag] = useState("");
  const refresh = () => qc.invalidateQueries({ queryKey });
  return (
    <div className="flex flex-wrap items-center gap-2 rounded-md border p-2 text-sm">
      <span className="font-medium">{doc.title}</span>
      {doc.date && <span className="text-xs text-muted-foreground">{new Date(doc.date).toLocaleDateString()}</span>}
      {doc.autoTags.map((t: string) => <Badge key={t} variant={t === "Signed" ? "default" : "secondary"}>{t}</Badge>)}
      {doc.staffTags.map((t: { id: string; tag: string }) => (
        <Badge key={t.id} variant="outline" className="gap-1">{t.tag}
          {staff && <button aria-label={`Remove tag ${t.tag}`} onClick={async () => { await remove({ data: { tagId: t.id } }); void refresh(); }}>×</button>}
        </Badge>
      ))}
      {(showInvestor || staff) && staff ? <DocLinks doc={doc} /> : null}
      {staff && (
        <form className="ml-auto flex gap-1" onSubmit={async (e) => {
          e.preventDefault();
          try { await add({ data: { source: doc.source, docId: doc.id, tag } }); setTag(""); void refresh(); } catch (err) { toast.error((err as Error).message); }
        }}>
          <Input value={tag} onChange={(e) => setTag(e.target.value)} placeholder="Add staff tag" className="h-8 w-36" maxLength={40} />
          <Button size="sm" variant="outline" type="submit" disabled={!tag.trim()}>Tag</Button>
        </form>
      )}
    </div>
  );
}
