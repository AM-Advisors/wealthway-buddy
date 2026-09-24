import { Body, Button, Container, Head, Heading, Html, Img, Preview, Section, Text } from '@react-email/components'
import type { TemplateEntry } from './registry'

interface Props {
  investorName?: string
  fundName?: string
  managerName?: string
  amountCents?: number | null
  ctaUrl?: string
}

const money = (cents?: number | null) =>
  cents == null ? null : `$${(cents / 100).toLocaleString('en-US', { maximumFractionDigits: 2 })}`

function InvestmentOnboarding({
  investorName = '',
  fundName = 'the fund',
  managerName = 'Your fund manager',
  amountCents = null,
  ctaUrl = 'https://onboard.harmonious.co',
}: Props) {
  const amount = money(amountCents)
  return (
    <Html>
      <Head />
      <Preview>Complete your investment in {fundName}</Preview>
      <Body style={{ backgroundColor: '#ffffff', fontFamily: 'Poppins, Helvetica, Arial, sans-serif', margin: 0, padding: '24px 0' }}>
        <Container style={{ border: '1px solid #e6ecf3', borderTop: '4px solid #5DC6D1', margin: '0 auto', maxWidth: '560px', padding: '32px' }}>
          <Section style={{ marginBottom: '20px' }}>
            <Img
              src="https://onboard.harmonious.co/__l5e/assets-v1/97373cb0-919a-4bb4-8395-b0b009111209/logo-navy.png"
              alt="Harmonious"
              width="150"
            />
          </Section>
          <Heading style={{ color: '#142647', fontFamily: 'Rubik, Helvetica, Arial, sans-serif', fontSize: '22px', margin: '0 0 16px' }}>
            Complete your investment in {fundName}
          </Heading>
          <Text style={{ color: '#221F20', fontSize: '15px', lineHeight: '24px' }}>
            {investorName ? `Hi ${investorName},` : 'Hello,'}
          </Text>
          <Text style={{ color: '#221F20', fontSize: '15px', lineHeight: '24px' }}>
            {managerName} uses Harmonious for investor onboarding. To complete your investment
            {amount ? ` of ${amount}` : ''} in {fundName}, please verify your identity and review
            the applicable investment documents.
          </Text>
          <Section style={{ margin: '28px 0' }}>
            <Button href={ctaUrl} style={{ backgroundColor: '#142647', borderRadius: '6px', color: '#ffffff', fontSize: '15px', fontWeight: 600, padding: '14px 24px' }}>
              Complete Onboarding
            </Button>
          </Section>
          <Text style={{ color: '#5b6472', fontSize: '13px', lineHeight: '20px' }}>
            You'll be asked to sign in with this email address. You can stop at any time and pick
            up where you left off. Harmonious will never ask for bank details by email.
          </Text>
        </Container>
      </Body>
    </Html>
  )
}

export const template = {
  component: InvestmentOnboarding,
  subject: (data: Record<string, any>) => `Complete your investment onboarding for ${data['fundName'] || 'your fund'}`,
  displayName: 'Investment onboarding invitation',
  previewData: { investorName: 'Jane', fundName: 'Example Fund I', managerName: 'Example Capital', amountCents: 25000000, ctaUrl: 'https://onboard.harmonious.co/onboard/abc123abc123abc123' },
} satisfies TemplateEntry
