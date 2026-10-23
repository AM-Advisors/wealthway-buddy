import { useEffect } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";

import { FundUpdatesFeed } from "@/components/fund-updates-feed";
import { markManagerUpdatesRead } from "@/lib/crm.functions";

export const Route = createFileRoute("/_authenticated/manager/updates")({
  head: () => ({
    meta: [
      { title: "Updates - Harmonious fund manager" },
      { name: "description", content: "Fund progress, investor messages, Harmonious replies, deals and campaigns in one list." },
      { property: "og:title", content: "Updates - Harmonious" },
      { property: "og:description", content: "Everything happening on your Funds, in one place." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Updates,
});

function Updates() {
  const mark = useServerFn(markManagerUpdatesRead);
  const qc = useQueryClient();
  // Opening the full list marks everything up to now as seen (after a short look).
  useEffect(() => {
    const t = setTimeout(() => { void mark().then(() => qc.invalidateQueries({ queryKey: ["manager-updates"] })); }, 4000);
    return () => clearTimeout(t);
  }, [mark, qc]);
  return (
    <main className="mx-auto max-w-3xl px-4 py-8">
      <h1 className="text-3xl">Updates</h1>
      <p className="mt-1 mb-6 text-sm text-muted-foreground">Fund progress, investor messages, replies from Harmonious, deal changes and campaign results across your Funds.</p>
      <FundUpdatesFeed limit={100} />
    </main>
  );
}
