import { createFileRoute } from "@tanstack/react-router";
import { ContactDirectoryTable } from "@/components/contact-directory-table";

export const Route = createFileRoute("/_authenticated/ops/clients/fund-managers")({
  head: () => ({
    meta: [
      { title: "Fund manager contacts - Harmonious operations" },
      { name: "description", content: "Search fund managers across every client, invite them and assign them to funds." },
      { property: "og:title", content: "Fund manager contacts - Harmonious operations" },
      { property: "og:description", content: "Search fund managers across every client, invite them and assign them to funds." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: () => (
    <main className="mx-auto max-w-6xl space-y-6 px-4 py-10">
      <header>
        <h1 className="text-3xl">Fund managers</h1>
        <p className="mt-2 text-sm text-muted-foreground">Everyone managing or on the team of a client's fund. Invite them or assign them to another fund.</p>
      </header>
      <ContactDirectoryTable kind="fund_managers" />
    </main>
  ),
});
