import { createFileRoute } from '@tanstack/react-router';
import { getComplianceSchedules } from '@/lib/compliance-schedules.functions';
import { ComplianceSchedulesPage } from '@/components/compliance-schedules-page';

export const Route = createFileRoute('/_authenticated/ops/compliance-schedules')({
  loader: ({ context }) => context.queryClient.ensureQueryData({ queryKey: ['compliance-schedules'], queryFn: () => getComplianceSchedules() }),
  errorComponent: () => <p className="p-8 text-sm text-muted-foreground">Compliance schedules are available to the Harmonious reporting team.</p>,
  head: () => ({ meta: [
    { title: 'Compliance Report Schedules | Harmonious' },
    { name: 'description', content: 'Recurring, approved internal compliance reports with delivery history.' },
    { property: 'og:title', content: 'Compliance Report Schedules | Harmonious' },
    { property: 'og:description', content: 'Schedule and approve internal compliance reports.' },
    { property: 'og:type', content: 'website' }, { name: 'twitter:card', content: 'summary' }, { name: 'robots', content: 'noindex' },
  ] }),
  component: ComplianceSchedulesPage,
});
