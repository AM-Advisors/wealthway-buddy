import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { CONFLICT_TASK_TITLE, RELATIONSHIP_TYPES, UNABLE } from "@/lib/contract-intelligence";
import { getContractFamily } from "@/lib/contract-intelligence.functions";

const relLabel = (t: string) =>
  RELATIONSHIP_TYPES.find((r) => r.value === t)?.label ?? (t === "amends" ? "Amends" : t === "supersedes" ? "Supersedes" : t);
const show = (v: string | number | null | undefined) => (v == null || v === "" ? UNABLE : String(v));

function Node({ n, lifecycles, depth }: { n: any; lifecycles: Record<string, any>; depth: number }) {
  const lc = lifecycles[n.id];
  return (
    <li>
      <div className="flex flex-wrap items-center gap-2 py-1" style={{ paddingLeft: depth * 16 }}>
        <Link to="/ops/contracts/$documentId" params={{ documentId: n.id }} className="font-medium underline-offset-2 hover:underline">
          {n.title}
        </Link>
        <span className="text-xs uppercase text-muted-foreground">{n.doc_type} · v{n.version}</span>
        {lc ? <Badge variant="outline">{lc.status}</Badge> : null}
        {n.links.map((l: any, i: number) => (
          <span key={i} className="text-xs text-muted-foreground">· {relLabel(l.type)}</span>
        ))}
      </div>
      {n.children.length ? (
        <ul>{n.children.map((c: any) => <Node key={c.id} n={c} lifecycles={lifecycles} depth={depth + 1} />)}</ul>
      ) : null}
    </li>
  );
}

/** Document family, lifecycle dates, termination / notice summary and scope conflicts. */
export function ContractFamilyPanel({ clientId }: { clientId: string }) {
  const load = useServerFn(getContractFamily);
  const q = useQuery({ queryKey: ["contract-family", clientId], queryFn: () => load({ data: { clientId } }) });
  if (q.isPending) return <Skeleton className="h-32 w-full" />;
  if (q.error) return null;
  const d = q.data as any;
  const title = (id: string) => d.documents.find((x: any) => x.id === id)?.title ?? "Document";
  const current = d.documents.filter((x: any) => x.review_status === "approved");

  return (
    <div className="space-y-4">
      {d.conflicts.length ? (
        <Card className="border-destructive/50">
          <CardHeader>
            <CardTitle className="text-base">{CONFLICT_TASK_TITLE}</CardTitle>
            <CardDescription>Flagged from reviewed terms. Harmonious never decides which provision controls — a reviewer records the relationship and precedence.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            {d.conflicts.map((c: any) => (
              <div key={c.key} className="rounded-md border p-3">
                <p className="font-medium">{c.title}</p>
                <div className="mt-2 grid gap-2 sm:grid-cols-2">
                  {c.provisions.map((p: any, i: number) => (
                    <div key={i} className="text-xs">
                      <Link to="/ops/contracts/$documentId" params={{ documentId: p.documentId }} className="font-medium underline">{p.documentTitle}</Link>
                      {p.value ? <p>{p.value}</p> : null}
                      {p.page || p.section ? <p className="text-muted-foreground">{p.page ? `page ${p.page}` : ""}{p.section ? ` · ${p.section}` : ""}</p> : null}
                      {p.quote ? <blockquote className="border-l-2 pl-2 italic text-muted-foreground">“{p.quote}”</blockquote> : null}
                    </div>
                  ))}
                </div>
                {c.documentIds.length === 2 ? (
                  <Link to="/ops/contracts/compare" search={{ before: c.documentIds[0], after: c.documentIds[1] }} className="mt-2 inline-block text-xs underline">
                    Compare side by side
                  </Link>
                ) : null}
              </div>
            ))}
          </CardContent>
        </Card>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Contract family</CardTitle>
          <CardDescription>Built only from recorded links (amends, supersedes, reviewer relationships) — never from upload order.</CardDescription>
        </CardHeader>
        <CardContent>
          <ul className="text-sm">{d.family.map((n: any) => <Node key={n.id} n={n} lifecycles={d.lifecycles} depth={0} />)}</ul>
        </CardContent>
      </Card>

      {current.map((doc: any) => {
        const lc = d.lifecycles[doc.id];
        const t = lc.termination;
        return (
          <Card key={doc.id}>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">{doc.title} — lifecycle</CardTitle>
              <CardDescription>
                Status: <strong>{lc.status}</strong>. Dates come only from approved terms. Nothing renews, terminates or sends notice automatically.
              </CardDescription>
            </CardHeader>
            <CardContent className="grid gap-4 text-sm sm:grid-cols-2">
              <dl className="space-y-1">
                <Row k="Effective date" v={show(lc.effectiveDate)} />
                <Row k="Initial term end" v={show(lc.initialTermEnd)} />
                <Row k="Automatic renewal" v={lc.autoRenews == null ? UNABLE : lc.autoRenews ? "Yes" : "No"} />
                <Row k="Renewal date" v={lc.autoRenews === false ? "Does not renew" : show(lc.renewalDate)} />
                <Row k="Expiration date" v={lc.autoRenews === true ? "Renews — see renewal date" : show(lc.expirationDate)} />
                <Row k="Notice deadline" v={show(lc.noticeDeadline)} />
                {lc.reminder ? <Row k="Reminder" v={`Renewal in ${lc.reminder.daysLeft} days`} /> : null}
              </dl>
              <dl className="space-y-1">
                <Row k="Termination type" v={t.terminationType?.value ?? "Not stated"} />
                <Row k="Notice requirement" v={t.notice?.value ?? "Not stated"} />
                <Row k="Notice period" v={t.noticePeriodDays != null ? `${t.noticePeriodDays} days` : UNABLE} />
                <Row k="Delivery method" v={t.deliveryMethod?.value ?? "Not stated"} />
                <Row k="Notice recipient" v={t.recipient?.value ?? "Not stated"} />
                <Row k="Termination / cancellation fee" v={t.fee?.value ?? "Not stated"} />
                {t.notice?.page || t.notice?.section ? (
                  <Row k="Source" v={`${t.notice.page ? `page ${t.notice.page}` : ""}${t.notice.section ? ` · ${t.notice.section}` : ""}`} />
                ) : null}
              </dl>
            </CardContent>
          </Card>
        );
      })}
      {d.relationships.filter((r: any) => r.status === "active").length ? (
        <p className="text-xs text-muted-foreground">
          Recorded relationships:{" "}
          {d.relationships
            .filter((r: any) => r.status === "active")
            .map((r: any) => `${title(r.document_id)} — ${relLabel(r.relationship_type)}${r.related_document_id ? ` ${title(r.related_document_id)}` : ""}`)
            .join("; ")}
        </p>
      ) : null}
    </div>
  );
}

function Row({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex justify-between gap-3">
      <dt className="text-muted-foreground">{k}</dt>
      <dd className={v === UNABLE ? "text-right text-destructive" : "text-right"}>{v}</dd>
    </div>
  );
}
