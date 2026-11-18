import { queryOptions, useQuery, useSuspenseQuery } from '@tanstack/react-query';
import { ReportCardsWorkspace } from '@/components/report-cards-workspace';
import { AccessQueuePanel, AlertsPanel, ComparePanel, CoverageBanner, DownloadsPanel, FunnelPanel, RequestableCardsPanel, ServicePanel } from '@/components/report-cards-extras';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { getReportCards } from '@/lib/portfolio-report-cards.functions';

export type ReportCardsAudience = 'operations' | 'manager' | 'client' | 'investor';
export const reportCardsQuery = (kind: 'operational' | 'investor' | 'diligence') =>
  queryOptions({ queryKey: ['report-cards', kind, undefined], queryFn: () => getReportCards({ data: { kind } }) });

const Header = () => (
  <div>
    <h1 className="text-3xl">Report Cards</h1>
    <p className="text-base text-muted-foreground">Grades use recorded evidence only. Missing evidence is shown as not assessed.</p>
  </div>
);

export function ReportCardsPage({ audience }: { audience: ReportCardsAudience }) {
  if (audience === 'investor') return (
    <main className="mx-auto max-w-5xl space-y-8 px-4 py-8"><Header /><ReportCardsWorkspace kind="investor" /><RequestableCardsPanel /></main>
  );
  return <TeamReportCards audience={audience} />;
}

function TeamReportCards({ audience }: { audience: Exclude<ReportCardsAudience, 'investor'> }) {
  const op = useSuspenseQuery(reportCardsQuery('operational'));
  const dil = useQuery({ ...reportCardsQuery('diligence'), enabled: audience !== 'client' });
  const cards = [...((op.data as any).cards ?? []), ...((dil.data as any)?.cards ?? [])];
  const funds = ((op.data as any).subjects ?? []).filter((s: any) => s.type === 'fund').map((s: any) => ({ id: s.id, label: s.label }));
  return (
    <main className="mx-auto max-w-5xl space-y-6 px-4 py-8">
      <Header />
      {audience !== 'operations' ? <CoverageBanner /> : null}
      <Tabs defaultValue="cards" className="space-y-4">
        <TabsList className="flex h-auto flex-wrap justify-start">
          <TabsTrigger value="cards">Report cards</TabsTrigger>
          <TabsTrigger value="compare">Compare</TabsTrigger>
          <TabsTrigger value="alerts">Alerts</TabsTrigger>
          {audience !== 'client' ? <TabsTrigger value="funnel">Investor funnel</TabsTrigger> : null}
          <TabsTrigger value="access">Access requests</TabsTrigger>
          <TabsTrigger value="downloads">Downloads</TabsTrigger>
          {audience === 'operations' ? <TabsTrigger value="service">Where it's on</TabsTrigger> : null}
        </TabsList>
        <TabsContent value="cards" className="space-y-8">
          <section><h2 className="mb-3 text-xl">Operational</h2><ReportCardsWorkspace kind="operational" /></section>
          {audience !== 'client' ? <section><h2 className="mb-3 text-xl">Diligence</h2><ReportCardsWorkspace kind="diligence" /></section> : null}
          {audience !== 'operations' ? <RequestableCardsPanel /> : null}
        </TabsContent>
        <TabsContent value="compare"><ComparePanel cards={cards} /></TabsContent>
        <TabsContent value="alerts"><AlertsPanel /></TabsContent>
        {audience !== 'client' ? <TabsContent value="funnel"><FunnelPanel funds={funds} /></TabsContent> : null}
        <TabsContent value="access"><AccessQueuePanel /></TabsContent>
        <TabsContent value="downloads"><DownloadsPanel /></TabsContent>
        {audience === 'operations' ? <TabsContent value="service"><ServicePanel /></TabsContent> : null}
      </Tabs>
    </main>
  );
}
