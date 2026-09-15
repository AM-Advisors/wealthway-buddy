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

interface ShareholderInvitationProps {
  holderName?: string
  companyName?: string
  passwordUrl?: string
  signInUrl?: string
}

function ShareholderInvitation({
  holderName = 'there',
  companyName = 'the company',
  passwordUrl = 'https://onboard.harmonious.co/reset-password',
  signInUrl = 'https://onboard.harmonious.co/shares',
}: ShareholderInvitationProps) {
  const body = { color: '#221F20', fontSize: '15px', lineHeight: '24px', margin: '0 0 16px' }

  return (
    <Html lang="en" dir="ltr">
      <Head />
      <Preview>Your shareholding in {companyName}</Preview>
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
              fontFamily: 'Rubik, Helvetica, Arial, sans-serif',
              fontSize: '22px',
              margin: '0 0 16px',
            }}
          >
            Your shareholding in {companyName}
          </Heading>

          <Text style={body}>Hello {holderName},</Text>
          <Text style={body}>
            {companyName} keeps its share register with Harmonious. You now have your own access to
            view your shares and download your share certificates whenever you need them.
          </Text>

          <Section style={{ margin: '24px 0' }}>
            <Link
              href={passwordUrl}
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
              Choose your password
            </Link>
          </Section>

          <Text style={body}>
            This one-time link lets you set your own password — we never send passwords by email.
            After that, sign in any time at <Link href={signInUrl}>{signInUrl}</Link>.
          </Text>

          <Hr style={{ borderColor: '#e6ecf3', margin: '28px 0 16px' }} />
          <Text style={{ color: '#6b7a90', fontSize: '12px', lineHeight: '20px', margin: 0 }}>
            Harmonious maintains this share register administratively for {companyName}. Questions
            about your holding should go to the company.
          </Text>
        </Container>
      </Body>
    </Html>
  )
}

export const template: TemplateEntry = {
  component: ShareholderInvitation,
  subject: (data) => `Your shareholding in ${data?.['companyName'] ?? 'the company'}`,
  displayName: 'Shareholder invitation',
  previewData: {
    holderName: 'Jordan Vale',
    companyName: 'Storybook VC LLC',
  },
}
