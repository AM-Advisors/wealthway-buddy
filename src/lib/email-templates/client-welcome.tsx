import {
  Body,
  Container,
  Head,
  Heading,
  Hr,
  Html,
  Img,
  Link,
  Preview,
  Section,
  Text,
} from '@react-email/components'
import type { TemplateEntry } from './registry'

interface ClientWelcomeProps {
  contactName?: string
  clientName?: string
  portalUrl?: string
  signOffUrl?: string
}

function ClientWelcome({
  contactName = 'there',
  clientName = 'your organisation',
  portalUrl = 'https://app.harmonious.co/client',
  signOffUrl = 'https://app.harmonious.co/sign-off',
}: ClientWelcomeProps) {
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
      <Preview>Welcome to your Harmonious portal for {clientName}</Preview>
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
            style={{
              color: '#142647',
              fontFamily: 'Rubik, Poppins, Helvetica, Arial, sans-serif',
              fontSize: '20px',
              fontWeight: 700,
              margin: '0 0 24px',
            }}
          >
            Welcome to your Harmonious portal
          </Heading>

          <Text style={body}>
            Hi {contactName}, your portal for {clientName} is ready. Everything Harmonious
            administers for you — funds, agreements, invoices and payments — is in one place.
          </Text>

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
              Open your portal
            </Link>
          </Text>

          <Text style={{ ...body, margin: '24px 0 8px', fontWeight: 600, color: '#142647' }}>
            Your next steps
          </Text>
          <Text style={body}>
            1. Sign your privacy notice, platform terms, fee schedule and electronic-records
            consent on the{' '}
            <Link href={signOffUrl} style={{ color: '#142647' }}>
              sign-off page
            </Link>
            .
            <br />
            2. Tell us about your fund — legal entity, structure and offering details — so we can
            set it up under your agreement.
            <br />
            3. From then on, your portal shows your funds, invoices, payments and the services in
            your active scope.
          </Text>

          <Section style={{ backgroundColor: '#f8fbfd', border: '1px solid #e6ecf3', padding: '20px' }}>
            <Text style={label}>Organisation</Text>
            <Text style={{ ...value, margin: 0 }}>{clientName}</Text>
          </Section>

          <Text style={{ color: '#6b7a90', fontSize: '13px', lineHeight: '20px', margin: '16px 0 0' }}>
            Questions? Reply to this email and the Harmonious team will help.
          </Text>

          <Hr style={{ borderColor: '#e6ecf3', margin: '32px 0 16px' }} />
          <Text style={{ color: '#6b7a90', fontSize: '12px', lineHeight: '18px', margin: 0 }}>
            Harmonious provides administrative, technology, onboarding, reporting,
            payment-facilitation, recordkeeping and compliance-support services under your master
            service agreement and statements of work.
          </Text>
        </Container>
      </Body>
    </Html>
  )
}

export const template = {
  component: ClientWelcome,
  subject: (data: Record<string, any>) =>
    `Welcome to your Harmonious portal${data?.['clientName'] ? `, ${data['clientName']}` : ''}`,
  displayName: 'Client welcome',
  previewData: {
    contactName: 'Alyssa',
    clientName: 'Walkthrough Capital LLC',
  },
} satisfies TemplateEntry
