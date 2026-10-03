import { createFileRoute } from "@tanstack/react-router";
import { ContactDirectoryTable } from "@/components/contact-directory-table";

export const Route = createFileRoute("/_authenticated/ops/clients/founders")({
  head: () => ({
    meta: [
      { title: "Founder contacts - Harmonious operations" },
      { name: "description", content: "Search founders across every client, invite them and assign them to cap tables." },
      { property: "og:title", content: "Founder contacts - Harmonious operations" },
      { property: "og:description", content: "Search founders across every client, invite them and assign them to cap tables." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: () => (
    <main className="mx-auto max-w-6xl space-y-6 px-4 py-10">
      <header>
        <h1 className="text-3xl">Founders</h1>
        <p className="mt-2 text-sm text-muted-foreground">Founders tagged on client contacts or listed on cap tables. Invite them or assign them to a cap table.</p>
      </header>
      <ContactDirectoryTable kind="founders" />
    </main>
  ),
});
