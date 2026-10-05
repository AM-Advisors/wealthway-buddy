import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { claimMarketingAssist, getMarketingAssistQueue } from "@/lib/sales-documents.functions";
import { KIND_LABEL, type DocKind } from "@/lib/sales-documents-model";

export const Route = createFileRoute("/_authenticated/marketing_/assists")({
  head: () => ({
    meta: [
      { title: "Sales requests - Harmonious Marketing" },
      { name: "description", content: "Proposals, RFPs and RFQs where Sales asked Marketing for help." },
      { property: "og:title", content: "Sales requests - Harmonious Marketing" },
      { property: "og:description", content: "Claim and polish Sales proposals and RFP responses." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: Queue,
});

const LABEL: Record<string, string> = { open: "Waiting", claimed: "In progress", returned: "Handed back", cancelled: "Cancelled" };

function Queue() {
  const load = useServerFn(getMarketingAssistQueue);
  const claim = useServerFn(claimMarketingAssist);
  const nav = useNavigate();
  const q = useQuery({ queryKey: ["marketing-assists"], queryFn: () => load() });
  return (
    <div className="mx-auto max-w-6xl space-y-6 p-4 md:p-6">
      <div>
        <h1 className="font-heading text-2xl font-semibold">Sales requests</h1>
        <p className="text-sm text-muted-foreground">Proposals, RFPs and RFQs where Sales asked for Marketing's help with wording, branding or visuals.</p>
      </div>
      <Table>
        <TableHeader><TableRow><TableHead>Document</TableHead><TableHead>Asked by</TableHead><TableHead>Request</TableHead><TableHead>Due</TableHead><TableHead>Status</TableHead><TableHead /></TableRow></TableHeader>
        <TableBody>
          {(q.data?.requests ?? []).map((r: any) => (
            <TableRow key={r.id}>
              <TableCell>{r.doc ? <Link to="/sales/documents/$id" params={{ id: r.document_id }} className="font-medium text-primary hover:underline">{r.doc.title}</Link> : "-"}<div className="text-xs text-muted-foreground">{r.doc ? KIND_LABEL[r.doc.kind as DocKind] : ""}</div></TableCell>
              <TableCell>{r.requestedByName}</TableCell>
              <TableCell className="max-w-xs text-sm">{r.note}</TableCell>
              <TableCell>{r.due_date ?? "-"}</TableCell>
              <TableCell><Badge variant="outline">{LABEL[r.status] ?? r.status}</Badge>{r.assigneeName && <div className="text-xs text-muted-foreground">{r.assigneeName}</div>}</TableCell>
              <TableCell>{r.status === "open" && q.data?.canClaim && (
                <Button size="sm" onClick={async () => { try { const x = await claim({ data: { id: r.id } }); nav({ to: "/sales/documents/$id", params: { id: x.documentId } }); } catch (e) { toast.error((e as Error).message); } }}>Take it</Button>
              )}</TableCell>
            </TableRow>
          ))}
          {!q.isLoading && !q.data?.requests.length && <TableRow><TableCell colSpan={6} className="text-muted-foreground">{q.error ? (q.error as Error).message : "No requests from Sales yet."}</TableCell></TableRow>}
        </TableBody>
      </Table>
    </div>
  );
}
