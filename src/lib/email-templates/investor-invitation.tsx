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
import { OpenPixel } from './pixel'
import { DEFAULT_PORTAL_ORIGIN, ONBOARDING_STEPS, findStep } from './steps'

interface InvestorInvitationProps {
  investorName?: string
  offeringName?: string
  portalUrl?: string
  contactEmail?: string
  /** Optional onboarding step key — highlights progress and tailors the CTA. */
  currentStep?: string
  ctaUrl?: string
  ctaLabel?: string
  /** Signed open-tracking pixel URL. */
  pixelUrl?: string
}

export function invitationHeadline(offeringName: string, currentStep?: string) {
  const step = findStep(currentStep)
  if (!step) return `Welcome to ${offeringName}`
  if (step.key === 'complete') return `You're all set with ${offeringName}`
  return `Continue your ${offeringName} onboarding`
}

export function invitationSubject(data: Record<string, any>) {
  const name = data['offeringName'] || 'Harmonious'
  const step = findStep(data['currentStep'])
  if (!step) return `Begin your ${name} investor onboarding`
  if (step.key === 'complete') return `Your ${name} onboarding is complete`
  return `Next step for ${name}: ${step.label.toLowerCase()}`
}

function InvestorInvitation({
  investorName = 'Investor',
  offeringName = 'Harmonious',
  portalUrl = `${DEFAULT_PORTAL_ORIGIN}/dashboard`,
  contactEmail = 'operations@harmonious.co',
  currentStep,
  ctaUrl,
  ctaLabel,
  pixelUrl,
}: InvestorInvitationProps) {
  const step = findStep(currentStep)
  const activeIndex = step ? ONBOARDING_STEPS.findIndex((s) => s.key === step.key) : -1
  const buttonHref = ctaUrl || portalUrl
  const buttonLabel = ctaLabel || (step ? step.ctaLabel : 'Begin onboarding')
  const heading = invitationHeadline(offeringName, currentStep)
  const lead = step
    ? step.lead
    : `Your investor onboarding for ${offeringName} is ready. Everything happens in your secure portal — you can pause at any point and pick up exactly where you left off.`

  return (
    <Html>
      <Head />
      <Preview>Begin your {offeringName} onboarding — identity, accreditation, documents and funding.</Preview>
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
              src="https://onboard.harmonious.co/__l5e/assets-v1/9bbcb59b-4986-4f16-a7c1-ad0f03953a15/logo-navy.png"
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
            {heading}
          </Heading>

          <Text style={{ color: '#221F20', fontSize: '15px', lineHeight: '24px' }}>
            Dear {investorName},
          </Text>
          <Text style={{ color: '#221F20', fontSize: '15px', lineHeight: '24px' }}>{lead}</Text>

          <Section style={{ margin: '24px 0' }}>
            {ONBOARDING_STEPS.filter((s) => s.key !== 'complete').map((s, index) => {
              const isCurrent = activeIndex === index
              const isDone = activeIndex > index
              const accent = isCurrent ? '#5DC6D1' : isDone ? '#9fb3c8' : '#e6ecf3'
              return (
                <Section
                  key={s.key}
                  style={{
                    backgroundColor: isCurrent ? '#f2fbfc' : 'transparent',
                    borderLeft: `3px solid ${accent}`,
                    margin: '0 0 14px',
                    padding: isCurrent ? '10px 12px 10px 14px' : '2px 0 2px 14px',
                  }}
                >
                  <Text
                    style={{
                      color: isDone ? '#7a8a9a' : '#142647',
                      fontSize: '14px',
                      fontWeight: 600,
                      lineHeight: '20px',
                      margin: '0 0 2px',
                    }}
                  >
                    {isDone ? '\u2713 ' : `${index + 1}. `}
                    {s.title}
                    {isCurrent ? (
                      <span
                        style={{
                          backgroundColor: '#5DC6D1',
                          borderRadius: '4px',
                          color: '#ffffff',
                          fontSize: '11px',
                          fontWeight: 600,
                          marginLeft: '8px',
                          padding: '2px 7px',
                          textTransform: 'uppercase',
                        }}
                      >
                        You are here
                      </span>
                    ) : null}
                  </Text>
                  <Text
                    style={{
                      color: isDone ? '#9fb3c8' : '#606060',
                      fontSize: '13px',
                      lineHeight: '20px',
                      margin: 0,
                    }}
                  >
                    {isDone ? 'Completed' : s.detail}
                  </Text>
                </Section>
              )
            })}
          </Section>

          <Section style={{ margin: '28px 0' }}>
            <Button
              href={buttonHref}
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
              {buttonLabel}
            </Button>
          </Section>

          <Text style={{ color: '#221F20', fontSize: '14px', lineHeight: '22px' }}>
            Most investors complete the process in under 20 minutes. Compliance review typically
            finishes within two business days, and your dashboard shows the live status of every
            step, your documents and your funding instructions.
          </Text>

          <Hr style={{ borderColor: '#e6ecf3', margin: '32px 0 16px' }} />
          <Text style={{ color: '#606060', fontSize: '12px', lineHeight: '18px' }}>
            Questions? Reply to this message or contact us at {contactEmail}. Harmonious will never
            ask you to send funds to bank details received by email — always confirm wire
            instructions by phone.
          </Text>
          <OpenPixel url={pixelUrl} />
        </Container>
      </Body>
    </Html>
  )
}

export const template = {
  component: InvestorInvitation,
  subject: (data: Record<string, any>) => invitationSubject(data),
  displayName: 'Investor onboarding invitation',
  previewData: {
    investorName: 'Jane Doe',
    offeringName: 'Harmonious Growth Fund II',
    portalUrl: 'https://onboard.harmonious.co/dashboard',
    contactEmail: 'operations@harmonious.co',
  },
} satisfies TemplateEntry

