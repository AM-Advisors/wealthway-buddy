import { Body, Button, Container, Head, Heading, Hr, Html, Preview, Text } from '@react-email/components'
import type { TemplateEntry } from './registry'

interface Props {
  name?: string
  clientName?: string
  reference?: string
  method?: string
  amount?: string
  receivedDate?: string
  purpose?: string
  activated?: boolean
}

function PaymentReceived({
  name = 'there',
  clientName = 'your company',
  reference = 'HP-00000000',
  method = 'Wire',
  amount = '$0.00',
  receivedDate = '',
  purpose = 'Fund request',
  activated = false,
}: Props) {
  const label = { color: '#6b7a90', fontSize: '12px', letterSpacing: '0.04em', margin: '0 0 2px', textTransform: 'uppercase' as const }
  const value = { color: '#221F20', fontSize: '15px', fontWeight: 600, margin: '0 0 16px' }
  const body = { color: '#221F20', fontSize: '15px', lineHeight: '24px', margin: '0 0 16px' }
  return (
    <Html lang="en" dir="ltr">
      <Head />
      <Preview>Payment received: {amount} ({reference})</Preview>
      <Body style={{ backgroundColor: '#ffffff', fontFamily: 'Poppins, Helvetica, Arial, sans-serif', margin: 0, padding: '24px 0' }}>
        <Container style={{ backgroundColor: '#ffffff', border: '1px solid #e6ecf3', borderTop: '4px solid #5DC6D1', margin: '0 auto', maxWidth: '560px', padding: '40px' }}>
          <Heading style={{ color: '#142647', fontFamily: 'Rubik, Helvetica, Arial, sans-serif', fontSize: '24px', margin: '0 0 16px' }}>
            Payment received
          </Heading>
          <Text style={body}>Hi {name},</Text>
          <Text style={body}>
            Harmonious has received your {method.toLowerCase()} payment for {clientName}. This email is your receipt.
          </Text>
          <Hr style={{ borderColor: '#e6ecf3', margin: '8px 0 24px' }} />
          <Text style={label}>Reference</Text>
          <Text style={value}>{reference}</Text>
          <Text style={label}>Amount</Text>
          <Text style={value}>{amount}</Text>
          <Text style={label}>Method</Text>
          <Text style={value}>{method}</Text>
          {receivedDate ? (<><Text style={label}>Received</Text><Text style={value}>{receivedDate}</Text></>) : null}
          <Text style={label}>For</Text>
          <Text style={value}>{purpose}</Text>
          <Hr style={{ borderColor: '#e6ecf3', margin: '8px 0 24px' }} />
          <Text style={body}>
            {activated
              ? 'Your request is now active and the Harmonious team is working on it.'
              : 'You can now send your request from the Harmonious portal.'}
          </Text>
          <Button href="https://app.harmonious.co/client/funds" style={{ backgroundColor: '#142647', borderRadius: '6px', color: '#ffffff', fontSize: '14px', fontWeight: 600, padding: '12px 22px' }}>
            Open your funds
          </Button>
          <Text style={{ color: '#6b7a90', fontSize: '12px', margin: '24px 0 0' }}>Questions? Reply to support@harmonious.co.</Text>
        </Container>
      </Body>
    </Html>
  )
}

export const template = {
  component: PaymentReceived,
  subject: (d: Record<string, any>) => `Payment received - ${d['reference'] ?? 'Harmonious'}`,
  displayName: 'Wire/ACH payment received',
  previewData: { name: 'Jane', clientName: 'Walkthrough Capital LLC', reference: 'HP-1A2B3C4D', method: 'Wire', amount: '$2,500.00', receivedDate: 'October 2, 2026', purpose: 'New fund request setup fee', activated: true },
} satisfies TemplateEntry
