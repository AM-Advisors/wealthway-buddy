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
  Preview,
  Row,
  Section,
  Text,
} from '@react-email/components'
import type { TemplateEntry } from './registry'

interface WireRequestApprovedProps {
  contactName?: string
  clientName?: string
  fundName?: string
  amount?: string
  purpose?: string
  expectedDate?: string
  investorName?: string
  reviewNote?: string
  wireFee?: string
  closingCost?: string
  sharePrice?: string
  portalUrl?: string
}

function WireRequestApproved({
  contactName = 'there',
  clientName = 'your organisation',
  fundName = 'your fund',
  amount = '$0.00',
  purpose = 'Wire',
  expectedDate = '',
  investorName = '',
  reviewNote = '',
  wireFee = 'Not set',
  closingCost = 'Not set',
  sharePrice = 'Not set',
  portalUrl = 'https://onboard.harmonious.co/client/wire-requests',
}: WireRequestApprovedProps) {
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
        Wire request approved for {fundName} — {amount}
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
            Wire request approved
          </Heading>

          <Text style={body}>
            Hi {contactName}, the wire request for {fundName} ({clientName}) has been approved by
            Harmonious. Verification and the second approval still apply before funds move.
          </Text>

          <Section
            style={{
              backgroundColor: '#f5f9fc',
              border: '1px solid #e6ecf3',
              margin: '0 0 24px',
              padding: '20px',
            }}
          >
            <Text style={label}>Amount</Text>
            <Text style={{ ...value, fontSize: '28px', color: '#142647', margin: '0 0 16px' }}>
              {amount}
            </Text>
            <Row>
              <Column>
                <Text style={label}>Purpose</Text>
                <Text style={{ ...value, margin: 0 }}>{purpose}</Text>
              </Column>
              <Column>
                <Text style={label}>Expected date</Text>
                <Text style={{ ...value, margin: 0 }}>{expectedDate || '—'}</Text>
              </Column>
            </Row>
            {investorName ? (
              <>
                <Text style={{ ...label, marginTop: '16px' }}>Investor</Text>
                <Text style={{ ...value, margin: 0 }}>{investorName}</Text>
              </>
            ) : null}
          </Section>

          <Section style={{ margin: '0 0 24px' }}>
            <Text style={label}>Fund fees on record</Text>
            <Row style={{ padding: '6px 0' }}>
              <Column>
                <Text style={{ ...body, margin: 0 }}>Outbound wire fee</Text>
              </Column>
              <Column align="right">
                <Text style={{ ...body, margin: 0, fontWeight: 600 }}>{wireFee}</Text>
              </Column>
            </Row>
            <Row style={{ padding: '6px 0' }}>
              <Column>
                <Text style={{ ...body, margin: 0 }}>Closing cost</Text>
              </Column>
              <Column align="right">
                <Text style={{ ...body, margin: 0, fontWeight: 600 }}>{closingCost}</Text>
              </Column>
            </Row>
            <Row style={{ padding: '6px 0' }}>
              <Column>
                <Text style={{ ...body, margin: 0 }}>Share price</Text>
              </Column>
              <Column align="right">
                <Text style={{ ...body, margin: 0, fontWeight: 600 }}>{sharePrice}</Text>
              </Column>
            </Row>
          </Section>

          {reviewNote ? (
            <Section style={{ margin: '0 0 24px' }}>
              <Text style={label}>Note from Harmonious</Text>
              <Text style={{ ...body, margin: 0 }}>{reviewNote}</Text>
            </Section>
          ) : null}

          <Button
            href={portalUrl}
            style={{
              backgroundColor: '#142647',
              borderRadius: '6px',
              color: '#ffffff',
              display: 'inline-block',
              fontSize: '15px',
              fontWeight: 600,
              padding: '12px 22px',
              textDecoration: 'none',
            }}
          >
            View in your portal
          </Button>

          <Hr style={{ borderColor: '#e6ecf3', margin: '32px 0 16px' }} />

          <Text style={{ color: '#6b7a90', fontSize: '12px', lineHeight: '20px', margin: 0 }}>
            Harmonious provides administration, technology, onboarding, reporting, payment
            facilitation and recordkeeping support. Harmonious is not an investment adviser,
            broker-dealer, custodian, auditor or legal counsel. Fees shown are the rates recorded
            for this fund and are billed under your statement of work.
          </Text>
        </Container>
      </Body>
    </Html>
  )
}

export const template = {
  component: WireRequestApproved,
  subject: (data: Record<string, any>) =>
    `Wire request approved — ${data?.['fundName'] ?? 'your fund'} ${data?.['amount'] ?? ''}`.trim(),
  displayName: 'Wire request approved',
  previewData: {
    contactName: 'Alyssa',
    clientName: 'Storybook VC',
    fundName: 'Harmonious Growth Fund II',
    amount: '$150,000.00',
    purpose: 'Investor wire',
    expectedDate: '2026-09-20',
    investorName: 'Jordan Vale',
    reviewNote: 'Beneficiary details verified by callback.',
    wireFee: '$35.00',
    closingCost: '$750.00',
    sharePrice: '$100.00',
    portalUrl: 'https://onboard.harmonious.co/client/wire-requests',
  },
} satisfies TemplateEntry
