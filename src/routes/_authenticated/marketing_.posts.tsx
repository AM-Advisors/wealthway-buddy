import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ChannelChip, MkPage, StatusBadge, fmt, mkHead } from "@/components/marketing-ui";
import { getMarketingPosts } from "@/lib/marketing.functions";

export const Route = createFileRoute("/_authenticated/marketing_/posts")({
  head: mkHead("Social posts", "Design and schedule LinkedIn, Facebook and Instagram posts."),
  component: Posts,
});

const FILTERS = [["all", "All"], ["draft", "Drafts"], ["submitted", "Waiting"], ["scheduled", "Scheduled"], ["published", "Published"], ["failed", "Failed"]] as const;

function Posts() {
  const load = useServerFn(getMarketingPosts);
  const q = useQuery({ queryKey: ["mk-posts"], queryFn: () => load(), retry: false });
  const [f, setF] = useState<string>("all");
  const rows = (q.data ?? []).filter((p: any) => f === "all" || p.status === f || (f === "draft" && p.status === "rejected"));
  return (
    <MkPage title="Social posts" intro="Write once, pick the channels, add images, submit for approval." actions={<Button asChild><Link to="/marketing/posts/$id" params={{ id: "new" }}>New post</Link></Button>}>
      <div className="flex flex-wrap gap-2">{FILTERS.map(([k, l]) => <Button key={k} size="sm" variant={f === k ? "default" : "outline"} onClick={() => setF(k)}>{l}</Button>)}</div>
      {q.isLoading && <p className="text-sm text-muted-foreground">Loading…</p>}
      {q.error && <p className="text-sm text-destructive">{(q.error as Error).message}</p>}
      {q.data && (rows.length === 0 ? <p className="text-sm text-muted-foreground">No posts here yet.</p> : (
        <Table>
          <TableHeader><TableRow><TableHead>Title</TableHead><TableHead>Channels</TableHead><TableHead>Status</TableHead><TableHead>When</TableHead><TableHead>Author</TableHead></TableRow></TableHeader>
          <TableBody>{rows.map((p: any) => (
            <TableRow key={p.id}>
              <TableCell><Link to="/marketing/posts/$id" params={{ id: p.id }} className="font-medium hover:underline">{p.title || "Untitled"}</Link></TableCell>
              <TableCell><span className="flex gap-1">{p.channels.map((c: string) => <ChannelChip key={c} c={c} />)}</span></TableCell>
              <TableCell><StatusBadge status={p.status} /></TableCell>
              <TableCell className="text-sm text-muted-foreground">{fmt(p.published_at ?? p.scheduled_at)}</TableCell>
              <TableCell className="text-sm">{p.author_name}</TableCell>
            </TableRow>))}</TableBody>
        </Table>
      ))}
    </MkPage>
  );
}
