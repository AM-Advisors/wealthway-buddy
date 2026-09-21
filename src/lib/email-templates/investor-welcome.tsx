import {
  Body,
  Button,
  Container,
  Head,
  Heading,
  Hr,
  Html,
  Img,
  Preview,
  Section,
  Text,
} from '@react-email/components'
import type { TemplateEntry } from './registry'
import { DEFAULT_PORTAL_ORIGIN } from './steps'

interface InvestorWelcomeProps {
  investorName?: string
  offeringName?: string
  portalUrl?: string
  diligenceUrl?: string
  contactEmail?: string
  commitment?: string
  reviewerName?: string
  nextSteps?: string[]
}

const DEFAULT_STEPS = [
  'Open the due diligence room to read the fund materials and answer any questions assigned to you.',
  'Confirm your commitment amount and how your subscription is titled.',
  'Send your funds using the instructions in your portal, then submit the wire confirmation.',
]

function InvestorWelcome({
  investorName = 'Investor',
  offeringName = 'Harmonious',
  portalUrl = `${DEFAULT_PORTAL_ORIGIN}/portal`,
  diligenceUrl,
  contactEmail = 'operations@harmonious.co',
  commitment,
  reviewerName,
  nextSteps,
}: InvestorWelcomeProps) {
  const steps = nextSteps && nextSteps.length > 0 ? nextSteps : DEFAULT_STEPS

  return (
    <Html>
      <Head />
      <Preview>
        Your {offeringName} application is approved — here is your due diligence room and what
        happens next.
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
            style={{
              color: '#142647',
              fontFamily: 'Rubik, Poppins, Helvetica, Arial, sans-serif',
              fontSize: '22px',
              fontWeight: 700,
              margin: '0 0 20px',
            }}
          >
            Welcome to {offeringName}
          </Heading>

          <Text style={{ color: '#221F20', fontSize: '15px', lineHeight: '24px' }}>
            Dear {investorName},
          </Text>
          <Text style={{ color: '#221F20', fontSize: '15px', lineHeight: '24px' }}>
            Your onboarding for {offeringName} is complete and your application has been approved
            {reviewerName ? ` by ${reviewerName}` : ''}. Everything you need from here lives in your
            secure portal.
            {commitment ? ` Your commitment on file is ${commitment}.` : ''}
          </Text>

          {diligenceUrl ? (
            <Section style={{ margin: '24px 0 8px' }}>
              <Button
                href={diligenceUrl}
                style={{
                  backgroundColor: '#142647',
                  borderRadius: '6px',
                  color: '#ffffff',
                  display: 'inline-block',
                  fontSize: '15px',
                  fontWeight: 600,
                  padding: '13px 26px',
                  textDecoration: 'none',
                }}
              >
                Open the due diligence room
              </Button>
            </Section>
          ) : null}

          <Section style={{ margin: '24px 0' }}>
            <Text
              style={{
                color: '#142647',
                fontSize: '14px',
                fontWeight: 600,
                margin: '0 0 10px',
              }}
            >
              What happens next
            </Text>
            {steps.map((step, index) => (
              <Section
                key={step}
                style={{ borderLeft: '3px solid #5DC6D1', margin: '0 0 12px', padding: '2px 0 2px 14px' }}
              >
                <Text style={{ color: '#221F20', fontSize: '14px', lineHeight: '22px', margin: 0 }}>
                  {index + 1}. {step}
                </Text>
              </Section>
            ))}
          </Section>

          <Section style={{ margin: '24px 0' }}>
            <Button
              href={portalUrl}
              style={{
                backgroundColor: '#ffffff',
                border: '1px solid #142647',
                borderRadius: '6px',
                color: '#142647',
                display: 'inline-block',
                fontSize: '15px',
                fontWeight: 600,
                padding: '12px 24px',
                textDecoration: 'none',
              }}
            >
              Go to your portal
            </Button>
          </Section>

          <Hr style={{ borderColor: '#e6ecf3', margin: '32px 0 16px' }} />
          <Text style={{ color: '#606060', fontSize: '12px', lineHeight: '18px' }}>
            Questions? Reply to this message or contact us at {contactEmail}. Harmonious will never
            ask you to send funds to bank details received by email — always confirm wire
            instructions by phone.
          </Text>
        </Container>
      </Body>
    </Html>
  )
}

export const template = {
  component: InvestorWelcome,
  subject: (data: Record<string, any>) =>
    `Welcome to ${data['offeringName'] || 'Harmonious'} — your next steps`,
  displayName: 'Investor welcome after onboarding',
  previewData: {
    investorName: 'Jane Doe',
    offeringName: 'Harmonious Growth Fund II',
    portalUrl: 'https://app.harmonious.co/portal',
    diligenceUrl: 'https://app.harmonious.co/diligence/4590531e-1973-4e0d-b1df-81bafb17c2ae',
    commitment: '$250,000',
    reviewerName: 'the fund team',
  },
} satisfies TemplateEntry
