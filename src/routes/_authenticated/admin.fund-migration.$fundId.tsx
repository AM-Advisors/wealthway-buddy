import { createFileRoute } from "@tanstack/react-router";

import { FundMigrationBoard } from "@/components/fund-migration-board";

export const Route = createFileRoute("/_authenticated/admin/fund-migration/$fundId")({
  component: FundMigrationPage,
  head: () => ({
    meta: [
      { title: "Fund transfer — Harmonious" },
      {
        name: "description",
        content:
          "Bring an existing fund's investor records onto Harmonious and track each step of the handover.",
      },
      { property: "og:title", content: "Fund transfer — Harmonious" },
      {
        property: "og:description",
        content: "Move investor records onto Harmonious with a tracked handover checklist.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
});

function FundMigrationPage() {
  const { fundId } = Route.useParams();
  return (
    <main className="mx-auto w-full max-w-5xl px-4 py-8">
      <header className="mb-6">
        <h1 className="text-2xl">Fund transfer</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Bring an existing fund's investor records onto the platform and keep a record of what came
          from where. Harmonious keeps these records; it does not verify or value them.
        </p>
      </header>
      <FundMigrationBoard offeringId={fundId} />
    </main>
  );
}
