import { createFileRoute, useParams } from "@tanstack/react-router";

import { DiligenceRoom } from "@/components/diligence-room";

export const Route = createFileRoute("/_authenticated/diligence/$offeringId")({
  head: () => ({
    meta: [
      { title: "Fund Due Diligence Room - Harmonious" },
      {
        name: "description",
        content:
          "Confidential fund diligence: documents with version history, a diligence checklist, investor questions and a full activity trail.",
      },
      { property: "og:title", content: "Fund Due Diligence Room - Harmonious" },
      {
        property: "og:description",
        content: "Confidential fund diligence materials, checklist, Q&A and activity trail.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: DiligenceRoomPage,
});

function DiligenceRoomPage() {
  const { offeringId } = useParams({ from: "/_authenticated/diligence/$offeringId" });
  return <DiligenceRoom offeringId={offeringId} />;
}
