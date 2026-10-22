import { Body, Button, Container, Head, Heading, Html, Preview, Text } from '@react-email/components'
import type { TemplateEntry } from './registry'

interface Props { clientName?: string; invoiceNumber?: string; amount?: string; dueDate?: string }
const PaymentDueRep = ({ clientName = 'Your client', invoiceNumber = '', amount = '', dueDate = '' }: Props) => (
  <Html lang="en" dir="ltr"><Head /><Preview>{`${clientName} has a scheduled payment due`}</Preview>
    <Body style={{ backgroundColor: '#ffffff', fontFamily: 'Poppins, Arial, sans-serif' }}>
      <Container style={{ padding: '24px 28px', maxWidth: '560px' }}>
        <Heading style={{ color: '#142647', fontSize: '22px' }}>Scheduled payment invoiced</Heading>
        <Text style={{ color: '#221F20', lineHeight: '24px' }}>{`${clientName} was sent invoice ${invoiceNumber} for ${amount}, due ${dueDate}.`}</Text>
        <Text style={{ color: '#221F20', lineHeight: '24px' }}>Your commission is scheduled for quarter-end once the client pays. This is a notice, not a payment confirmation.</Text>
        <Button href="https://ops.harmonious.co/sales/commissions" style={{ backgroundColor: '#142647', color: '#ffffff', borderRadius: '6px', padding: '12px 20px' }}>View commissions</Button>
      </Container>
    </Body>
  </Html>
)
export const template = { component: PaymentDueRep, subject: 'Harmonious: scheduled payment invoiced', displayName: 'Scheduled payment notice to rep', previewData: { clientName: 'Sample Fund LP', invoiceNumber: 'HRM-2026-0001', amount: '$3,000.00', dueDate: '2026-12-31' } } satisfies TemplateEntry
