import { createFileRoute } from "@tanstack/react-router";

import { ClientCoverageBoard, StaffDesk } from "@/components/staff-desk";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

export const Route = createFileRoute("/_authenticated/staff")({
  head: () => ({
    meta: [
      { title: "My clients — Harmonious staff desk" },
      {
        name: "description",
        content:
          "Each Harmonious team member sees only the clients they cover, with the service requests, fee proposals and compliance holds waiting on them.",
      },
      { property: "og:title", content: "My clients — Harmonious staff desk" },
      {
        property: "og:description",
        content: "The clients you cover and everything waiting on you, in one place.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: StaffPortalPage,
});

function StaffPortalPage() {
  return (
    <main className="mx-auto max-w-6xl px-4 py-10">
      <h1 className="text-3xl">My clients</h1>
      <p className="mb-6 mt-2 text-sm text-muted-foreground">
        The clients you look after, and what is waiting on you: new service requests, fee proposals
        in play and open compliance holds. Harmonious provides administrative, technology and
        recordkeeping support — decisions on scope stay with the statement of work.
      </p>
      <Tabs defaultValue="desk">
        <TabsList>
          <TabsTrigger value="desk">My desk</TabsTrigger>
          <TabsTrigger value="coverage">Who covers whom</TabsTrigger>
        </TabsList>
        <TabsContent value="desk" className="mt-6">
          <StaffDesk />
        </TabsContent>
        <TabsContent value="coverage" className="mt-6">
          <ClientCoverageBoard />
        </TabsContent>
      </Tabs>
    </main>
  );
}
