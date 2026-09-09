import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";

import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { getLegalDocumentReadership } from "@/lib/legal-doc-views.functions";

function when(value: string | null | undefined) {
  if (!value) return "never";
  const d = new Date(value);
  return d.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export function LegalDocumentReadership({ offeringId }: { offeringId: string }) {
  const load = useServerFn(getLegalDocumentReadership);
  const { data, isLoading, error } = useQuery({
    queryKey: ["legal-document-readership", offeringId],
    queryFn: () => load({ data: { offering_id: offeringId } }),
    refetchInterval: 60_000,
  });

  const documents = ((data as any)?.documents ?? []) as any[];
  const neverOpened = ((data as any)?.neverOpened ?? []) as any[];

  return (
    <Card>
      <CardHeader>
        <CardTitle>Who opened the legal documents</CardTitle>
        <CardDescription>
          Each time an investor opens or downloads one of this fund's offering documents it is
          recorded here with their name and the time. Your own team's opens are labelled.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {isLoading ? (
          <p className="text-sm text-muted-foreground">Loading…</p>
        ) : error ? (
          <p className="text-sm text-destructive">{(error as Error).message}</p>
        ) : documents.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            This fund has no legal documents yet.
          </p>
        ) : (
          <>
            <p className="text-sm text-muted-foreground">
              {(data as any)?.readerCount ?? 0} of {(data as any)?.investorCount ?? 0} investors
              have opened at least one document.
            </p>
            <ul className="divide-y rounded-md border">
              {documents.map((doc) => (
                <li key={doc.id} className="space-y-2 p-4">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <p className="font-medium">{doc.title}</p>
                      <p className="text-xs text-muted-foreground">
                        {doc.investorCount === 0
                          ? "No investor has opened this yet"
                          : `${doc.investorCount} investor${doc.investorCount === 1 ? "" : "s"} · ${doc.investorOpens} open${doc.investorOpens === 1 ? "" : "s"} · last ${when(doc.lastInvestorAt)}`}
                      </p>
                    </div>
                    <Badge variant={doc.investorCount > 0 ? "secondary" : "outline"}>
                      {doc.investorCount > 0 ? "Being read" : "Unread by investors"}
                    </Badge>
                  </div>
                  {doc.readers.length > 0 ? (
                    <ul className="space-y-1 text-xs text-muted-foreground">
                      {doc.readers.map((r: any) => (
                        <li key={r.actor_id}>
                          <span className={r.isTeam ? "" : "font-medium text-foreground"}>
                            {r.name || r.email || "Someone"}
                          </span>
                          {r.isTeam ? " (your team)" : ""} — first {when(r.firstOpened)}, last{" "}
                          {when(r.lastOpened)}
                          {r.opens > 0 ? `, opened ${r.opens}×` : ""}
                          {r.downloads > 0 ? `, downloaded ${r.downloads}×` : ""}
                        </li>
                      ))}
                    </ul>
                  ) : null}
                </li>
              ))}
            </ul>
            {neverOpened.length > 0 ? (
              <div className="rounded-md border bg-muted/40 p-3">
                <p className="text-sm font-medium">Not opened anything yet</p>
                <p className="text-xs text-muted-foreground">
                  {neverOpened
                    .map((p: any) => p.name || p.email || "An investor")
                    .join(", ")}
                </p>
              </div>
            ) : null}
          </>
        )}
      </CardContent>
    </Card>
  );
}
