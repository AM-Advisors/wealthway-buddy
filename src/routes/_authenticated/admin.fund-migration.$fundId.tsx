import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { getClientFund } from "@/lib/fund-cap-table.functions";
import { migrationApplies } from "@/lib/fund-origin";
import { FundOriginControl } from "@/components/fund-origin-control";
import { createFileRoute } from "@tanstack/react-router";

import { FundMigrationBoard } from "@/components/fund-migration-board";
import { TakeoverAdmissionsPanel } from "@/components/takeover-admissions-panel";

export const Route = createFileRoute("/_authenticated/admin/fund-migration/$fundId")({
  component: FundMigrationPage,
  head: () => ({
    meta: [
      { title: "Fund transfer | Harmonious" },
      {
        name: "description",
        content:
          "Bring an existing fund's investor records onto Harmonious and track each step of the handover.",
      },
      { property: "og:title", content: "Fund transfer | Harmonious" },
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
  const load = useServerFn(getClientFund);
  const q = useQuery({ queryKey: ["client-fund", fundId], queryFn: () => load({ data: { fundId } }) });
  if (q.isPending) return <p className="p-6 text-muted-foreground">Loading fund…</p>;
  if (q.isError) return <p role="alert" className="p-6 text-destructive">{q.error.message}</p>;
  if (!migrationApplies(q.data.fund["fund_origin"])) return <main className="mx-auto max-w-5xl space-y-4 px-4 py-8"><h1 className="text-2xl">{String(q.data.fund["name"])}</h1><FundOriginControl offeringId={fundId} origin={q.data.fund["fund_origin"]} /><p className="text-muted-foreground">Migration steps do not apply. Fund classification is recorded in Fund Setup.</p></main>;
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
      <div className="mt-10"><TakeoverAdmissionsPanel offeringId={fundId} /></div>
    </main>
  );
}
