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

interface ClientInvitationProps {
  contactName?: string
  clientName?: string
  roleLabel?: string
  invitedByName?: string
  note?: string
  /** One-time link where the person chooses their own password. */
  passwordUrl?: string
  signInUrl?: string
  canApprove?: boolean
}

function ClientInvitation({
  contactName = 'there',
  clientName = 'your organisation',
  roleLabel = 'Client contact',
  invitedByName = 'The Harmonious team',
  note = '',
  passwordUrl = 'https://app.harmonious.co/reset-password',
  signInUrl = 'https://app.harmonious.co/client-login',
  canApprove = false,
}: ClientInvitationProps) {
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
      <Preview>Your Harmonious portal access for {clientName}</Preview>
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
            Welcome to the Harmonious portal
          </Heading>

          <Text style={body}>
            Hi {contactName}, {invitedByName} has given you access to the Harmonious portal for{' '}
            {clientName}.
          </Text>

          <Section style={{ backgroundColor: '#f8fbfd', border: '1px solid #e6ecf3', padding: '20px' }}>
            <Text style={label}>Organisation</Text>
            <Text style={value}>{clientName}</Text>
            <Text style={label}>Your role</Text>
            <Text style={canApprove || note ? value : { ...value, margin: 0 }}>{roleLabel}</Text>
            {canApprove ? (
              <>
                <Text style={label}>Approvals</Text>
                <Text style={note ? value : { ...value, margin: 0 }}>
                  You can approve invoices and requests for {clientName}
                </Text>
              </>
            ) : null}
            {note ? (
              <>
                <Text style={label}>From {invitedByName}</Text>
                <Text style={{ ...value, fontWeight: 400, margin: 0 }}>{note}</Text>
              </>
            ) : null}
          </Section>

          <Text style={{ margin: '24px 0 0' }}>
            <Link
              href={passwordUrl}
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
              Set your password
            </Link>
          </Text>

          <Text style={{ ...body, margin: '24px 0 8px', fontWeight: 600, color: '#142647' }}>
            What happens next
          </Text>
          <Text style={body}>
            1. Choose your password using the button above. The link works once and then expires — we
            never send passwords by email.
            <br />
            2. Sign the privacy notice, platform terms, fee schedule and electronic-records consent.
            <br />
            3. Your portal opens with {clientName}&rsquo;s funds, agreements, invoices and payments.
          </Text>

          <Text style={{ color: '#6b7a90', fontSize: '13px', lineHeight: '20px', margin: '16px 0 0' }}>
            If the button has expired, sign in at{' '}
            <Link href={signInUrl} style={{ color: '#142647' }}>
              {signInUrl}
            </Link>{' '}
            and choose &ldquo;Forgot your password&rdquo;.
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
  component: ClientInvitation,
  subject: (data: Record<string, any>) =>
    `Your Harmonious portal access for ${data?.['clientName'] || 'your organisation'}`,
  displayName: 'Client contact invitation',
  previewData: {
    contactName: 'Jordan',
    clientName: 'Walkthrough Capital LLC',
    roleLabel: 'Finance',
    invitedByName: 'Alyssa Pettit',
    note: 'You will handle invoice approvals for the fund.',
    canApprove: true,
  },
} satisfies TemplateEntry
