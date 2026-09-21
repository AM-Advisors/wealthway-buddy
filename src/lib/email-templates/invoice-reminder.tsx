import {
  Body,
  Button,
  Column,
  Container,
  Head,
  Heading,
  Hr,
  Html,
  Img,
  Link,
  Preview,
  Row,
  Section,
  Text,
} from '@react-email/components'
import type { TemplateEntry } from './registry'

interface InvoiceReminderProps {
  contactName?: string
  clientName?: string
  invoiceNumber?: string
  amount?: string
  dueDate?: string
  /** Plain-language timing line, e.g. "due in 3 days" or "7 days past due". */
  timing?: string
  overdue?: boolean
  payUrl?: string
}

function InvoiceReminder({
  contactName = 'there',
  clientName = 'your organisation',
  invoiceNumber = 'HRM-0000-0000',
  amount = '$0.00',
  dueDate = '',
  timing = 'due soon',
  overdue = false,
  payUrl = 'https://app.harmonious.co/client/invoices',
}: InvoiceReminderProps) {
  const label = {
    color: '#6b7a90',
    fontSize: '12px',
    letterSpacing: '0.04em',
    margin: '0 0 2px',
    textTransform: 'uppercase' as const,
  }
  const value = { color: '#221F20', fontSize: '15px', fontWeight: 600, margin: '0 0 16px' }
  const body = { color: '#221F20', fontSize: '15px', lineHeight: '24px', margin: '0 0 16px' }
  const accent = overdue ? '#B4472E' : '#5DC6D1'

  return (
    <Html lang="en" dir="ltr">
      <Head />
      <Preview>
        Invoice {invoiceNumber} — {amount} {timing}
      </Preview>
      <Body
        style={{
          backgroundColor: '#ffffff',
          fontFamily: 'Poppins, Helvetica, Arial, sans-serif',
          margin: 0,
          padding: '24px 0',
        }}
      >
        <Container
          style={{
            backgroundColor: '#ffffff',
            border: '1px solid #e6ecf3',
            borderTop: `4px solid ${accent}`,
            margin: '0 auto',
            maxWidth: '560px',
            padding: '40px',
          }}
        >
          <Section style={{ marginBottom: '24px' }}>
            <Img
              src="https://onboard.harmonious.co/__l5e/assets-v1/97373cb0-919a-4bb4-8395-b0b009111209/logo-navy.png"
              alt="Harmonious"
              height={28}
              style={{ display: 'block', height: '28px', width: 'auto' }}
            />
          </Section>

          <Heading
            as="h1"
            style={{ color: '#142647', fontSize: '24px', lineHeight: '32px', margin: '0 0 12px' }}
          >
            {overdue ? `Invoice ${invoiceNumber} is past due` : `Invoice ${invoiceNumber} is ${timing}`}
          </Heading>

          <Text style={body}>
            Hi {contactName}, this is a reminder that invoice {invoiceNumber} for {clientName} is{' '}
            {timing}. If you have already sent the transfer, confirm it in your portal so we can
            match it on arrival and close the invoice.
          </Text>

          <Section
            style={{
              backgroundColor: '#f5f9fc',
              border: '1px solid #e6ecf3',
              margin: '0 0 24px',
              padding: '20px',
            }}
          >
            <Text style={label}>Amount outstanding</Text>
            <Text style={{ ...value, fontSize: '28px', color: '#142647', margin: '0 0 16px' }}>
              {amount}
            </Text>
            <Row>
              <Column>
                <Text style={label}>Payment due</Text>
                <Text style={{ ...value, margin: 0 }}>{dueDate || '—'}</Text>
              </Column>
              <Column>
                <Text style={label}>Status</Text>
                <Text style={{ ...value, margin: 0 }}>{overdue ? 'Past due' : 'Awaiting payment'}</Text>
              </Column>
            </Row>
          </Section>

          <Section style={{ margin: '0 0 24px' }}>
            <Button
              href={payUrl}
              style={{
                backgroundColor: '#142647',
                borderRadius: '6px',
                color: '#ffffff',
                display: 'inline-block',
                fontSize: '15px',
                fontWeight: 600,
                padding: '14px 24px',
                textDecoration: 'none',
              }}
            >
              Review and pay this invoice
            </Button>
          </Section>

          <Text style={{ ...body, fontSize: '13px', color: '#6b7a90' }}>
            Or open{' '}
            <Link href={payUrl} style={{ color: '#142647' }}>
              {payUrl}
            </Link>
            . If you believe this invoice is incorrect, raise a query on the same page and your
            Harmonious contact will review it.
          </Text>

          <Hr style={{ borderColor: '#e6ecf3', margin: '24px 0' }} />

          <Text style={{ color: '#6b7a90', fontSize: '12px', lineHeight: '20px', margin: 0 }}>
            Harmonious provides administrative, technology, onboarding, reporting,
            payment-facilitation, recordkeeping and compliance-support services under your master
            service agreement and statements of work. Harmonious facilitates payments and keeps the
            records; it does not hold your money.
          </Text>
        </Container>
      </Body>
    </Html>
  )
}

export const template = {
  component: InvoiceReminder,
  subject: (data: Record<string, any>) =>
    `Reminder: invoice ${data?.['invoiceNumber'] ?? ''} — ${data?.['amount'] ?? ''} ${
      data?.['timing'] ?? 'due soon'
    }`.trim(),
  displayName: 'Invoice reminder',
  previewData: {
    contactName: 'Casey',
    clientName: 'Onboarding Walkthrough LLC',
    invoiceNumber: 'HRM-2026-0003',
    amount: '$9,500.00',
    dueDate: '2026-10-11',
    timing: 'due in 3 days',
    overdue: false,
    payUrl: 'https://app.harmonious.co/client/invoices',
  },
} satisfies TemplateEntry
