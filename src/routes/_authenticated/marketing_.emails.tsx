import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { MkPage, StatusBadge, fmt, mkHead } from "@/components/marketing-ui";
import { getMarketingEmails } from "@/lib/marketing.functions";

export const Route = createFileRoute("/_authenticated/marketing_/emails")({
  head: mkHead("Marketing emails", "Design branded Harmonious marketing emails and schedule them to an audience."),
  component: Emails,
});

function Emails() {
  const load = useServerFn(getMarketingEmails);
  const q = useQuery({ queryKey: ["mk-emails"], queryFn: () => load(), retry: false });
  return (
    <MkPage title="Emails" intro="Branded email campaigns to your audiences. Unsubscribed people are always skipped."
      actions={<div className="flex gap-2"><Button variant="outline" asChild><Link to="/marketing/audiences">Audiences</Link></Button><Button asChild><Link to="/marketing/emails/$id" params={{ id: "new" }}>New email</Link></Button></div>}>
      {q.isLoading && <p className="text-sm text-muted-foreground">Loading…</p>}
      {q.error && <p className="text-sm text-destructive">{(q.error as Error).message}</p>}
      {q.data && (q.data.length === 0 ? <p className="text-sm text-muted-foreground">No emails yet.</p> : (
        <Table>
          <TableHeader><TableRow><TableHead>Name</TableHead><TableHead>Subject</TableHead><TableHead>Status</TableHead><TableHead>When</TableHead><TableHead>Author</TableHead></TableRow></TableHeader>
          <TableBody>{q.data.map((e: any) => (
            <TableRow key={e.id}>
              <TableCell><Link to="/marketing/emails/$id" params={{ id: e.id }} className="font-medium hover:underline">{e.name || "Untitled"}</Link></TableCell>
              <TableCell className="text-sm">{e.subject}</TableCell>
              <TableCell><StatusBadge status={e.status} /></TableCell>
              <TableCell className="text-sm text-muted-foreground">{fmt(e.sent_at ?? e.scheduled_at)}</TableCell>
              <TableCell className="text-sm">{e.author_name}</TableCell>
            </TableRow>))}</TableBody>
        </Table>
      ))}
    </MkPage>
  );
}
