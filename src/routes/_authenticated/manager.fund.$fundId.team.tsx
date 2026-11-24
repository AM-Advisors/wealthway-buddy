import { createFileRoute, useParams } from "@tanstack/react-router";

import { FundTeam } from "@/components/fund-team";
import { TeamTab } from "@/components/fund-tabs/team-tab";
import { FundTeamAccessBox } from "@/components/fund-team-access-box";
import { ManagerDraftReview } from "@/components/fund-team-drafts";

export const Route = createFileRoute("/_authenticated/manager/fund/$fundId/team")({
  head: () => ({
    meta: [
      { title: "Fund team | Harmonious" },
      { name: "description", content: "Harmonious staff, fund managers and delegated professionals with access to this fund." },
      { property: "og:title", content: "Fund team | Harmonious" },
      { property: "og:description", content: "Who has operational access to this fund, and why." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Page,
});

function Page() {
  const { fundId } = useParams({ from: "/_authenticated/manager/fund/$fundId/team" });
  return (
    <div className="space-y-8">
      <header>
        <h1 className="font-heading text-2xl font-semibold">Team</h1>
        <p className="text-muted-foreground">Everyone on this fund in one place. Step 1 lists people and signers; step 2 decides who can log in.</p>
      </header>
      <section className="space-y-3">
        <h2 className="font-heading text-xl font-semibold">1. People and signers</h2>
        <p className="text-sm text-muted-foreground">Add a person, mark who signs documents, and send their invitation.</p>
        <TeamTab fundId={fundId} />
      </section>
      <section className="space-y-3 border-t pt-6">
        <h2 className="font-heading text-xl font-semibold">2. Who can log in</h2>
        <p className="text-sm text-muted-foreground">Give someone Viewer, Assistant or Reviewer access, or remove it.</p>
        <FundTeamAccessBox fundId={fundId} />
      </section>
      <ManagerDraftReview fundId={fundId} />
      <section className="space-y-3 border-t pt-6">
        <h2 className="font-heading text-xl font-semibold">Your Harmonious team</h2>
        <FundTeam fundId={fundId} />
      </section>
    </div>
  );
}
