import { Body, Container, Head, Heading, Hr, Html, Img, Link, Preview, Section, Text } from '@react-email/components'
import type { TemplateEntry } from './registry'

interface DetailRow {
  label: string
  value: string
}

interface ClientAdminAlertProps {
  contactName?: string
  headline?: string
  intro?: string
  details?: DetailRow[]
  actionLabel?: string
  actionUrl?: string
  footnote?: string
}

function ClientAdminAlert({
  contactName = 'there',
  headline = 'Something needs your attention',
  intro = 'There is an update waiting for you in your Harmonious portal.',
  details = [],
  actionLabel = 'Open your portal',
  actionUrl = 'https://app.harmonious.co/client',
  footnote = 'Harmonious provides administrative, technology, onboarding, reporting, payment-facilitation, recordkeeping and compliance-support services under your master service agreement and statements of work.',
}: ClientAdminAlertProps) {
  const label = {
    color: '#6b7a90',
    fontSize: '12px',
    letterSpacing: '0.04em',
    margin: '0 0 2px',
    textTransform: 'uppercase' as const,
  }
  const value = { color: '#221F20', fontSize: '15px', fontWeight: 600, margin: '0 0 16px' }

  return (
    <Html>
      <Head />
      <Preview>{headline}</Preview>
      <Body
        style={{
          backgroundColor: '#f4f7fa',
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
            style={{
              color: '#142647',
              fontFamily: 'Rubik, Poppins, Helvetica, Arial, sans-serif',
              fontSize: '20px',
              fontWeight: 700,
              margin: '0 0 24px',
            }}
          >
            {headline}
          </Heading>

          <Text style={{ color: '#221F20', fontSize: '15px', lineHeight: '24px', margin: '0 0 24px' }}>
            Hi {contactName}, {intro}
          </Text>

          {details.length > 0 && (
            <Section style={{ backgroundColor: '#f8fbfd', border: '1px solid #e6ecf3', padding: '20px' }}>
              {details.map((row, i) => (
                <Section key={`${row.label}-${i}`}>
                  <Text style={label}>{row.label}</Text>
                  <Text style={i === details.length - 1 ? { ...value, margin: 0 } : value}>{row.value}</Text>
                </Section>
              ))}
            </Section>
          )}

          <Text style={{ margin: '24px 0 0' }}>
            <Link
              href={actionUrl}
              style={{
                backgroundColor: '#142647',
                color: '#ffffff',
                display: 'inline-block',
                fontSize: '15px',
                fontWeight: 600,
                padding: '12px 22px',
                textDecoration: 'none',
              }}
            >
              {actionLabel}
            </Link>
          </Text>

          <Hr style={{ borderColor: '#e6ecf3', margin: '32px 0 16px' }} />
          <Text style={{ color: '#6b7a90', fontSize: '12px', lineHeight: '18px', margin: 0 }}>{footnote}</Text>
        </Container>
      </Body>
    </Html>
  )
}

export const template = {
  component: ClientAdminAlert,
  subject: (data: Record<string, any>) =>
    (data?.['headline'] as string) || 'An update from Harmonious',
  displayName: 'Client administrator alert',
  previewData: {
    contactName: 'Jordan',
    headline: 'Invoice HRM-2026-0001 is ready',
    intro: 'a fee invoice has been issued for Walkthrough Capital LLC.',
    details: [
      { label: 'Invoice', value: 'HRM-2026-0001' },
      { label: 'Amount', value: '$105.00' },
      { label: 'Due', value: 'Oct 11, 2026' },
    ],
    actionLabel: 'View the invoice',
    actionUrl: 'https://app.harmonious.co/client/invoices',
  },
} satisfies TemplateEntry
