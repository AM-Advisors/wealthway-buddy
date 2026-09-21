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

interface LineRow {
  label: string
  amount: string
}

interface InvoiceIssuedProps {
  contactName?: string
  clientName?: string
  invoiceNumber?: string
  amount?: string
  issueDate?: string
  dueDate?: string
  periodLabel?: string
  lines?: LineRow[]
  payUrl?: string
  note?: string
}

function InvoiceIssued({
  contactName = 'there',
  clientName = 'your organisation',
  invoiceNumber = 'HRM-0000-0000',
  amount = '$0.00',
  issueDate = '',
  dueDate = '',
  periodLabel = '',
  lines = [],
  payUrl = 'https://app.harmonious.co/client/invoices',
  note = '',
}: InvoiceIssuedProps) {
  const label = {
    color: '#6b7a90',
    fontSize: '12px',
    letterSpacing: '0.04em',
    margin: '0 0 2px',
    textTransform: 'uppercase' as const,
  }
  const value = { color: '#221F20', fontSize: '15px', fontWeight: 600, margin: '0 0 16px' }
  const body = { color: '#221F20', fontSize: '15px', lineHeight: '24px', margin: '0 0 16px' }

  return (
    <Html lang="en" dir="ltr">
      <Head />
      <Preview>
        Invoice {invoiceNumber} for {clientName} — {amount} due {dueDate}
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
            borderTop: '4px solid #5DC6D1',
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
            Invoice {invoiceNumber}
          </Heading>

          <Text style={body}>
            Hi {contactName}, a fee invoice has been issued to {clientName} under your statement of
            work{periodLabel ? ` for ${periodLabel}` : ''}. You can review it and confirm payment in
            your portal.
          </Text>

          <Section
            style={{
              backgroundColor: '#f5f9fc',
              border: '1px solid #e6ecf3',
              margin: '0 0 24px',
              padding: '20px',
            }}
          >
            <Text style={label}>Amount due</Text>
            <Text style={{ ...value, fontSize: '28px', color: '#142647', margin: '0 0 16px' }}>
              {amount}
            </Text>
            <Row>
              <Column>
                <Text style={label}>Issued</Text>
                <Text style={{ ...value, margin: 0 }}>{issueDate || '—'}</Text>
              </Column>
              <Column>
                <Text style={label}>Payment due</Text>
                <Text style={{ ...value, margin: 0 }}>{dueDate || '—'}</Text>
              </Column>
            </Row>
          </Section>

          {lines.length ? (
            <Section style={{ margin: '0 0 24px' }}>
              <Text style={label}>What you are being billed for</Text>
              {lines.map((line, index) => (
                <Row key={`${line.label}-${index}`} style={{ padding: '6px 0' }}>
                  <Column>
                    <Text style={{ ...body, margin: 0 }}>{line.label}</Text>
                  </Column>
                  <Column align="right">
                    <Text style={{ ...body, margin: 0, fontWeight: 600 }}>{line.amount}</Text>
                  </Column>
                </Row>
              ))}
            </Section>
          ) : null}

          {note ? <Text style={body}>{note}</Text> : null}

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
            Approve the invoice in the portal, send the transfer from your fund's operating account
            using the remittance details your Harmonious contact provided, then confirm it in the
            portal so we can match it on arrival. Or open{' '}
            <Link href={payUrl} style={{ color: '#142647' }}>
              {payUrl}
            </Link>
            .
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
  component: InvoiceIssued,
  subject: (data: Record<string, any>) =>
    `Invoice ${data?.['invoiceNumber'] ?? ''} — ${data?.['amount'] ?? ''} due ${data?.['dueDate'] ?? ''}`.trim(),

  displayName: 'Invoice issued',
  previewData: {
    contactName: 'Casey',
    clientName: 'Onboarding Walkthrough LLC',
    invoiceNumber: 'HRM-2026-0003',
    amount: '$9,500.00',
    issueDate: '2026-09-11',
    dueDate: '2026-10-11',
    periodLabel: '2026-09-01 to 2026-09-11',
    lines: [{ label: 'SPV formation and administration', amount: '$9,500.00' }],
    payUrl: 'https://app.harmonious.co/client/invoices',
  },
} satisfies TemplateEntry
