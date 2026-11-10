import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useState } from "react";
import { checkMarketingDuplicates } from "@/lib/marketing-approvals.functions";

/** Warns when another open post or email has the same title on the same day. Never blocks or merges. */
export function MarketingDuplicateWarning({ kind, title, at, selfId }: { kind: "post" | "email"; title: string; at: string | null; selfId: string | null }) {
  const check = useServerFn(checkMarketingDuplicates);
  const [debounced, setDebounced] = useState(title);
  useEffect(() => { const t = setTimeout(() => setDebounced(title), 600); return () => clearTimeout(t); }, [title]);
  const q = useQuery({
    queryKey: ["mk-dupes", kind, debounced, at, selfId],
    queryFn: () => check({ data: { kind, title: debounced, at, selfId } }),
    enabled: debounced.trim().length >= 3, retry: false, staleTime: 30_000,
  });
  if (!q.data?.length) return null;
  return (
    <div role="status" className="rounded-md border border-accent bg-accent/10 p-3 text-sm">
      <p className="font-medium">This looks like it may already exist</p>
      <p className="mt-1 text-muted-foreground">Another open item has the same title on the same day. Open it to avoid a duplicate, or keep going if this one is separate.</p>
      <ul className="mt-2 space-y-1">
        {q.data.map((d) => (
          <li key={`${d.kind}-${d.id}`}><Link to={d.kind === "post" ? "/marketing/posts/$id" : "/marketing/emails/$id"} params={{ id: d.id }} className="text-primary underline">{d.kind === "post" ? "Post" : "Email"}: {d.title}</Link></li>
        ))}
      </ul>
    </div>
  );
}
