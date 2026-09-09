import { Body, Container, Head, Heading, Hr, Html, Img, Link, Preview, Section, Text } from '@react-email/components'
import type { TemplateEntry } from './registry'

interface DetailRow {
  label: string
  value: string
}

interface ManagerAlertProps {
  managerName?: string
  headline?: string
  intro?: string
  offeringName?: string
  details?: DetailRow[]
  portalUrl?: string
}

function ManagerAlert({
  managerName = 'there',
  headline = 'Update on your fund',
  intro = 'There is new activity on one of your funds.',
  offeringName = 'your fund',
  details = [],
  portalUrl = 'https://onboard.harmonious.co/manager',
}: ManagerAlertProps) {
  const label = {
    color: '#6b7a90',
    fontSize: '12px',
    letterSpacing: '0.04em',
    margin: '0 0 2px',
    textTransform: 'uppercase' as const,
  }
  const value = { color: '#221F20', fontSize: '15px', fontWeight: 600, margin: '0 0 16px' }
  const rows = details.length ? details : [{ label: 'Fund', value: offeringName }]

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
              src="https://onboard.harmonious.co/__l5e/assets-v1/29f55aff-64f7-4942-b5e8-228bc90b9e96/logo-navy.png"
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
            Hi {managerName}, {intro}
          </Text>

          <Section style={{ backgroundColor: '#f8fbfd', border: '1px solid #e6ecf3', padding: '20px' }}>
            {rows.map((row, i) => (
              <Section key={`${row.label}-${i}`}>
                <Text style={label}>{row.label}</Text>
                <Text style={i === rows.length - 1 ? { ...value, margin: 0 } : value}>{row.value}</Text>
              </Section>
            ))}
          </Section>

          <Text style={{ margin: '24px 0 0' }}>
            <Link
              href={portalUrl}
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
              Open the portal
            </Link>
          </Text>

          <Hr style={{ borderColor: '#e6ecf3', margin: '32px 0 16px' }} />
          <Text style={{ color: '#6b7a90', fontSize: '12px', lineHeight: '18px', margin: 0 }}>
            Harmonious — you receive these because you oversee this fund. You can turn fund alerts off in your portal
            settings.
          </Text>
        </Container>
      </Body>
    </Html>
  )
}

export const template = {
  component: ManagerAlert,
  subject: (data: Record<string, any>) => (data?.['headline'] as string) || 'Update on your fund',
  displayName: 'Fund manager alert',
  previewData: {
    managerName: 'Jordan',
    headline: 'Wire confirmation submitted — Harmonious Income Fund I',
    intro: 'Alyssa Pettit has submitted a wire confirmation for Harmonious Income Fund I.',
    offeringName: 'Harmonious Income Fund I',
    details: [
      { label: 'Investor', value: 'Alyssa Pettit' },
      { label: 'Fund', value: 'Harmonious Income Fund I' },
      { label: 'Amount', value: '$250,000' },
      { label: 'Sending bank', value: 'First National — ****4821' },
    ],
    portalUrl: 'https://onboard.harmonious.co/manager',
  },
} satisfies TemplateEntry
