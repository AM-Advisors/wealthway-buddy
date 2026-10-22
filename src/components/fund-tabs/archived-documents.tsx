import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { listArchivedFundDocumentsFn } from "@/lib/archived-documents.functions";
import { fmtDate } from "./shared";

/** Read-only: archived documents and earlier versions, with the investors each still applies to. */
export function ArchivedDocuments({ fundId }: { fundId: string }) {
  const [open, setOpen] = useState(false);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const load = useServerFn(listArchivedFundDocumentsFn);
  const q = useQuery({ queryKey: ["fund-archived-docs", fundId], queryFn: () => load({ data: { fundId } }), enabled: open });
  const items = q.data?.items ?? [];
  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between gap-2 space-y-0">
        <div>
          <CardTitle className="text-base">Archived & earlier versions</CardTitle>
          <CardDescription>Documents no longer in use and which investors they still apply to. View only: nothing here can be restored, deleted or re-signed.</CardDescription>
        </div>
        <Button variant="outline" size="sm" onClick={() => setOpen(!open)}>{open ? "Hide" : "Show"}</Button>
      </CardHeader>
      {open && (
        <CardContent className="space-y-4 text-sm">
          {q.isLoading ? <p className="text-muted-foreground">Loading…</p> :
           q.error ? <p className="text-destructive">{(q.error as Error).message}</p> : (
            <>
              {!items.length && <p className="text-muted-foreground">No archived documents or earlier versions.</p>}
              {items.map((it) => {
                const k = `${it.documentId}:${it.version}`;
                return (
                  <div key={k} className="rounded-md border border-border p-3">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-medium">{it.title}</span>
                      <Badge variant="secondary">v{it.version}</Badge>
                      {it.reason === "archived" ? <Badge variant="outline">Archived</Badge> : <Badge variant="outline">Replaced by v{it.replacedBy}</Badge>}
                    </div>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {it.archivedAt ? `${it.reason === "archived" ? "Archived" : "Replaced"} ${fmtDate(it.archivedAt)}` : "Date not recorded"}
                      {it.archivedBy ? ` by ${it.archivedBy}` : ""}{it.archivedNote ? ` · Reason: ${it.archivedNote}` : ""}
                    </p>
                    <div className="mt-2">
                      <span className="text-muted-foreground">Applies to: </span>
                      {it.investors.length === 0 ? <span>No investors</span> : (
                        <button type="button" className="text-primary underline-offset-2 hover:underline" onClick={() => setExpanded({ ...expanded, [k]: !expanded[k] })}>
                          {it.investors.length} investor{it.investors.length === 1 ? "" : "s"}
                        </button>
                      )}
                    </div>
                    {expanded[k] && (
                      <ul className="mt-2 space-y-1 pl-4">
                        {it.investors.map((i) => (
                          <li key={i.onboardingId} className="text-xs">
                            <Link to="/investment/$onboardingId" params={{ onboardingId: i.onboardingId }} className="text-primary hover:underline">{i.name}</Link>
                            <span className="text-muted-foreground"> · {i.kind === "signed" ? "signed" : "acknowledged"}{i.at ? ` ${fmtDate(i.at)}` : ""} — remains their binding copy</span>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                );
              })}
              {!!q.data?.sideLetters.length && (
                <div className="space-y-1">
                  <p className="font-medium">Ended side letters</p>
                  {q.data.sideLetters.map((s) => (
                    <p key={s.id} className="text-xs">{s.investor ?? "Investor"} · {String(s.status).replace(/_/g, " ")}{s.version ? ` · v${s.version}` : ""}</p>
                  ))}
                </div>
              )}
              {!!q.data?.priorSigned.length && (
                <div className="space-y-1">
                  <p className="font-medium">Signed before joining Harmonious</p>
                  {q.data.priorSigned.map((p, i) => (
                    <p key={i} className="text-xs">{p.title} · {p.investor}{p.signedOn ? ` · signed ${fmtDate(p.signedOn)}` : ""}</p>
                  ))}
                </div>
              )}
            </>
          )}
        </CardContent>
      )}
    </Card>
  );
}
