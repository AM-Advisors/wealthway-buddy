import { Body, Button, Container, Head, Heading, Html, Preview, Text } from '@react-email/components'
import type { TemplateEntry } from './registry'

interface Props { title?: string; scheduled?: boolean; amount?: string; dueOn?: string }
const CommissionScheduled = ({ title = 'Statement of work', scheduled = false, amount, dueOn }: Props) => (
  <Html lang="en" dir="ltr"><Head /><Preview>{scheduled ? 'Your quarterly commission is scheduled' : 'Your statement of work has been signed'}</Preview>
    <Body style={{ backgroundColor: '#ffffff', fontFamily: 'Poppins, Arial, sans-serif' }}>
      <Container style={{ padding: '24px 28px', maxWidth: '560px' }}>
        <Heading style={{ color: '#142647', fontSize: '22px' }}>{scheduled ? 'Quarterly commission scheduled' : 'Statement of work signed'}</Heading>
        <Text style={{ color: '#221F20', lineHeight: '24px' }}>{title}</Text>
        <Text style={{ color: '#221F20', lineHeight: '24px' }}>{scheduled ? `Your commission of ${amount} is scheduled for ${dueOn}.` : 'Your commission will be scheduled automatically for the end of the quarter in which the client pays the invoice.'}</Text>
        <Text style={{ color: '#221F20', lineHeight: '24px' }}>This is a scheduling notice, not a payment confirmation. Payouts are recorded separately by Finance.</Text>
        <Button href="https://ops.harmonious.co/sales/commissions" style={{ backgroundColor: '#142647', color: '#ffffff', borderRadius: '6px', padding: '12px 20px' }}>View commissions</Button>
      </Container>
    </Body>
  </Html>
)
export const template = { component: CommissionScheduled, subject: (d: Record<string, any>) => d['scheduled'] ? 'Harmonious: quarterly commission scheduled' : 'Harmonious: statement of work signed', displayName: 'Commission scheduling notice', previewData: { title: 'Sample services', scheduled: true, amount: '$1,000.00', dueOn: '2026-12-31' } } satisfies TemplateEntry