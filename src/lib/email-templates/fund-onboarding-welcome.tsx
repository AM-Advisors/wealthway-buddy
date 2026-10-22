import { Body, Button, Container, Head, Heading, Html, Preview, Text } from '@react-email/components'
import type { TemplateEntry } from './registry'

interface Props {
  contactName?: string
  fundName?: string
  levelName?: string
  setupUrl?: string
}

const FundOnboardingWelcome = ({ contactName, fundName = 'your fund', levelName = 'your', setupUrl = 'https://app.harmonious.co/client/funds' }: Props) => (
  <Html lang="en" dir="ltr">
    <Head />
    <Preview>Next steps to set up {fundName} and onboard investors</Preview>
    <Body style={main}>
      <Container style={container}>
        <Heading style={h1}>Welcome to Harmonious</Heading>
        <Text style={text}>{contactName ? `Hi ${contactName},` : 'Hi there,'}</Text>
        <Text style={text}>{fundName} is on the {levelName} service level. Here is what happens next:</Text>
        <Text style={text}>1. Sign in and finish the fund setup steps.<br />2. Our team reviews your setup and banking.<br />3. Invite investors. They complete About You, Verification, Sign and Fund.</Text>
        <Button href={setupUrl} style={button}>Open your fund</Button>
        <Text style={muted}>Questions? Reply from your Inbox in the portal and the Harmonious team will help.</Text>
      </Container>
    </Body>
  </Html>
)

export const template = {
  component: FundOnboardingWelcome,
  subject: (d: Record<string, any>) => `Next steps for ${d['fundName'] ?? 'your fund'}`,
  displayName: 'Fund onboarding welcome',
  previewData: { contactName: 'Jane', fundName: 'Roas Hedge LP', levelName: 'Plus', setupUrl: 'https://app.harmonious.co/client/funds' },
} satisfies TemplateEntry

const main = { backgroundColor: '#ffffff', fontFamily: 'Poppins, Arial, sans-serif' }
const container = { padding: '24px 28px', maxWidth: '560px' }
const h1 = { color: '#142647', fontSize: '22px', margin: '0 0 16px' }
const text = { color: '#221F20', fontSize: '15px', lineHeight: '24px', margin: '0 0 14px' }
const muted = { color: '#6b7a90', fontSize: '13px', margin: '20px 0 0' }
const button = { backgroundColor: '#142647', color: '#ffffff', borderRadius: '6px', padding: '12px 20px', fontSize: '14px', textDecoration: 'none' }
