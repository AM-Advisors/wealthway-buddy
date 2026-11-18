import { createFileRoute } from '@tanstack/react-router';
import { ReportCardsPage, reportCardsQuery } from '@/components/report-cards-page';

export const Route = createFileRoute('/_authenticated/client/report-cards')({
  loader: ({ context }) => context.queryClient.ensureQueryData(reportCardsQuery('operational')),
  errorComponent: () => <p className="p-8 text-base text-muted-foreground">These records are not available to this account.</p>,
  notFoundComponent: () => <p className="p-8">Records not found.</p>,
  head: () => ({ meta: [
    { title: 'Report Cards | Harmonious' },
    { name: 'description', content: 'Report Cards for your organization and funds, with downloads, comparisons and alerts.' },
    { property: 'og:title', content: 'Report Cards | Harmonious' },
    { property: 'og:description', content: 'Evidence-based Report Cards for your organization in Harmonious.' },
    { property: 'og:type', content: 'website' }, { name: 'twitter:card', content: 'summary' }, { name: 'robots', content: 'noindex' },
  ] }),
  component: () => <ReportCardsPage audience="client" />,
});
