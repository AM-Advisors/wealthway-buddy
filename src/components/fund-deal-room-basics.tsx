import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { getFundDealRoomBasics } from "@/lib/fund-deal-room.functions";

const usd = (c: number | null) => (c == null ? "Not set" : (c / 100).toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }));
const human = (s: string | null) => (s ? s.replace(/_/g, " ").replace(/^\w/, (c) => c.toUpperCase()) : "Not set");
const day = (d: string | null) => (d ? new Date(d).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) : "Not set");

/** Every fund's deal room starts with these reference basics for its investors and team. */
export function FundDealRoomBasics({ offeringId }: { offeringId: string }) {
  const load = useServerFn(getFundDealRoomBasics);
  const q = useQuery({ queryKey: ["fund-deal-room-basics", offeringId], queryFn: () => load({ data: { offeringId } }) });
  if (q.isPending) return <Skeleton className="h-40 w-full" />;
  if (q.error) return null;
  const f = q.data;
  const field = (label: string, value: string) => <div><dt className="text-xs text-muted-foreground">{label}</dt><dd className="text-sm font-medium">{value}</dd></div>;
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Fund basics</CardTitle>
        <CardDescription>Reference details for {f.name}. Your signed documents always control.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        {f.summary && <p className="text-sm text-muted-foreground">{f.summary}</p>}
        <dl className="grid grid-cols-2 gap-4 md:grid-cols-4">
          {field("Legal name", f.legalName ?? f.name)}
          {field("Fund type", human(f.fundType))}
          {field("Entity type", human(f.entityType))}
          {field("State formed", f.stateFormed ?? "Not set")}
          {field("Minimum investment", usd(f.minimumCents))}
          {field("Target raise", usd(f.targetRaiseCents))}
          {field("Offering type", f.regType ? `Reg D ${f.regType}` : "Not set")}
          {field("Offering period", `${day(f.opens)} to ${day(f.closes)}`)}
        </dl>
        <div>
          <h3 className="text-sm font-medium">Manager and contacts</h3>
          {f.gp && <p className="text-sm text-muted-foreground">{f.gp}</p>}
          {f.contacts.length ? <ul className="mt-1 space-y-1 text-sm">{f.contacts.map((c, i) => <li key={i}>{c.name} · {c.role}{c.email ? <> · <a className="underline" href={`mailto:${c.email}`}>{c.email}</a></> : null}</li>)}</ul> : <p className="text-sm text-muted-foreground">No manager listed yet.</p>}
        </div>
        <div>
          <h3 className="text-sm font-medium">Fund documents</h3>
          {f.documents.length ? <ul className="mt-1 list-disc pl-5 text-sm">{f.documents.map((d) => <li key={d.id}>{d.title}</li>)}</ul> : <p className="text-sm text-muted-foreground">No published documents yet.</p>}
          <p className="mt-1 text-xs text-muted-foreground">Open and sign them from the Documents tab.</p>
        </div>
      </CardContent>
    </Card>
  );
}
