import { Body, Container, Head, Heading, Html, Img, Preview, Section, Text } from '@react-email/components'
import type { TemplateEntry } from './registry'

interface DeliveryAlertProps {
  eventLabel?: string
  recipient?: string
  subjectLine?: string
  occurredAt?: string
  detail?: string
  consoleUrl?: string
}

function formatWhen(iso?: string) {
  if (!iso) return ''
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return iso
  return `${d.toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'America/Chicago' })} CT`
}

function DeliveryAlert({
  eventLabel = 'Bounced',
  recipient = 'investor@example.com',
  subjectLine = 'Onboarding email',
  occurredAt = new Date().toISOString(),
  detail = 'The mailbox rejected this message. Future sends to this address are blocked.',
  consoleUrl = 'https://onboard.harmonious.co/admin',
}: DeliveryAlertProps) {
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
      <Preview>{`${eventLabel}: ${recipient}`}</Preview>
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
            borderTop: '4px solid #d94f4f',
            margin: '0 auto',
            maxWidth: '560px',
            padding: '40px',
          }}
        >
          <Section style={{ marginBottom: '24px' }}>
            <Img
              src="https://onboard.harmonious.co/__l5e/assets-v1/7e6bcfbb-6598-4382-8118-886eb02957e5/logo-navy.png"
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
              margin: '0 0 16px',
            }}
          >
            Email delivery problem
          </Heading>
          <Text style={{ color: '#221F20', fontSize: '15px', lineHeight: '24px', margin: '0 0 24px' }}>
            {detail}
          </Text>

          <Section style={{ backgroundColor: '#fdf5f5', border: '1px solid #f0dede', padding: '20px' }}>
            <Text style={label}>Outcome</Text>
            <Text style={value}>{eventLabel}</Text>
            <Text style={label}>Recipient</Text>
            <Text style={value}>{recipient}</Text>
            <Text style={label}>Message</Text>
            <Text style={value}>{subjectLine}</Text>
            <Text style={label}>When</Text>
            <Text style={{ ...value, margin: 0 }}>{formatWhen(occurredAt)}</Text>
          </Section>

          <Text style={{ color: '#6b7a90', fontSize: '13px', lineHeight: '20px', margin: '24px 0 0' }}>
            Open the admin console to review the full delivery history: {consoleUrl}
          </Text>
        </Container>
      </Body>
    </Html>
  )
}

export const template: TemplateEntry = {
  component: DeliveryAlert,
  displayName: 'Delivery alert (bounce / spam complaint)',
  subject: (data: Record<string, any>) =>
    `${data?.['eventLabel'] ?? 'Delivery issue'}: ${data?.['recipient'] ?? 'recipient'}`,
  previewData: {
    eventLabel: 'Bounced',
    recipient: 'operations@harmonious.co',
    subjectLine: 'Welcome to Harmonious — start your onboarding',
    occurredAt: new Date().toISOString(),
    detail: 'The mailbox rejected this message. Future sends to this address are blocked.',
  },
}

export default DeliveryAlert
