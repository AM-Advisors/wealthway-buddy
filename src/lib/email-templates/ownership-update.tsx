import {
  Body,
  Button,
  Container,
  Head,
  Heading,
  Hr,
  Html,
  Preview,
  Row,
  Column,
  Section,
  Text,
} from '@react-email/components'
import type { TemplateEntry } from './registry'
import { DEFAULT_PORTAL_ORIGIN } from './steps'

interface OwnershipUpdateProps {
  investorName?: string
  offeringName?: string
  ownershipPct?: string
  previousOwnershipPct?: string
  shares?: string
  shareClass?: string
  committed?: string
  received?: string
  fundCommitted?: string
  fundReceived?: string
  reason?: string
  portalUrl?: string
  contactEmail?: string
}

const navy = '#142647'
const teal = '#5DC6D1'
const ink = '#221F20'
const muted = '#5b6472'

function Line({ label, value }: { label: string; value?: string }) {
  if (!value) return null
  return (
    <Row style={{ marginBottom: '6px' }}>
      <Column style={{ color: muted, fontSize: '13px', width: '52%' }}>{label}</Column>
      <Column style={{ color: ink, fontSize: '13px', fontWeight: 600 }}>{value}</Column>
    </Row>
  )
}

function OwnershipUpdate({
  investorName = 'Investor',
  offeringName = 'your fund',
  ownershipPct,
  previousOwnershipPct,
  shares,
  shareClass,
  committed,
  received,
  fundCommitted,
  fundReceived,
  reason,
  portalUrl = `${DEFAULT_PORTAL_ORIGIN}/portal`,
  contactEmail = 'operations@harmonious.co',
}: OwnershipUpdateProps) {
  return (
    <Html>
      <Head />
      <Preview>
        Your position in {offeringName} has been updated{ownershipPct ? ` — now ${ownershipPct}` : ''}
      </Preview>
      <Body
        style={{
          backgroundColor: '#ffffff',
          fontFamily: 'Poppins, Helvetica, Arial, sans-serif',
          margin: 0,
          padding: '24px 0',
        }}
      >
        <Container style={{ maxWidth: '560px', padding: '0 24px' }}>
          <Text style={{ color: teal, fontSize: '12px', letterSpacing: '1px', margin: 0 }}>
            HARMONIOUS
          </Text>
          <Heading
            style={{
              color: navy,
              fontFamily: 'Rubik, Helvetica, Arial, sans-serif',
              fontSize: '22px',
              margin: '8px 0 4px',
            }}
          >
            Your position in {offeringName} has been updated
          </Heading>
          <Text style={{ color: muted, fontSize: '14px', margin: '0 0 16px' }}>
            Hello {investorName}. {reason ?? 'Your position has changed.'} Here are your current
            numbers.
          </Text>

          <Section
            style={{
              border: '1px solid #e6e9ef',
              borderRadius: '10px',
              padding: '16px',
              marginBottom: '16px',
            }}
          >
            <Text
              style={{
                color: navy,
                fontSize: '28px',
                fontWeight: 700,
                margin: '0 0 2px',
              }}
            >
              {ownershipPct ?? '—'}
            </Text>
            <Text style={{ color: muted, fontSize: '12px', margin: '0 0 12px' }}>
              Your ownership of the fund
              {previousOwnershipPct ? ` (previously ${previousOwnershipPct})` : ''}
            </Text>
            <Hr style={{ borderColor: '#e6e9ef', margin: '0 0 12px' }} />
            <Line label="Shares held" value={shares} />
            <Line label="Share class" value={shareClass} />
            <Line label="Your committed amount" value={committed} />
            <Line label="Funds received from you" value={received} />
            <Line label="Fund committed to date" value={fundCommitted} />
            <Line label="Fund received to date" value={fundReceived} />
          </Section>

          <Button
            href={portalUrl}
            style={{
              backgroundColor: navy,
              borderRadius: '8px',
              color: '#ffffff',
              display: 'inline-block',
              fontSize: '14px',
              fontWeight: 600,
              padding: '12px 20px',
              textDecoration: 'none',
            }}
          >
            View your portal
          </Button>

          <Hr style={{ borderColor: '#e6e9ef', margin: '20px 0 12px' }} />
          <Text style={{ color: muted, fontSize: '12px', margin: 0 }}>
            Ownership figures are indicative and update as commitments and funds received change.
            Questions? Write to {contactEmail}.
          </Text>
        </Container>
      </Body>
    </Html>
  )
}

export const template = {
  component: OwnershipUpdate,
  subject: (data: Record<string, any>) =>
    `Your position in ${data['offeringName'] ?? 'your fund'} has been updated`,
  displayName: 'Ownership update',
  previewData: {
    investorName: 'Jane Investor',
    offeringName: 'Harmonious Growth Fund II',
    ownershipPct: '12.50%',
    previousOwnershipPct: '15.00%',
    shares: '125,000',
    shareClass: 'LP interest',
    committed: '$250,000',
    received: '$250,000',
    fundCommitted: '$2,000,000',
    fundReceived: '$1,500,000',
    reason: 'A wire was confirmed for this fund.',
  },
} satisfies TemplateEntry
