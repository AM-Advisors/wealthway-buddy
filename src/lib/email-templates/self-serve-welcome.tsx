import { Body, Button, Container, Head, Heading, Html, Preview, Text } from '@react-email/components'
import type { TemplateEntry } from './registry'

interface Props { contactName?: string; fundName?: string; setupUrl?: string }

const SelfServeWelcome = ({ contactName, fundName = 'your fund', setupUrl = 'https://app.harmonious.co/client/funds' }: Props) => (
  <Html lang="en" dir="ltr">
    <Head />
    <Preview>Your fund is ready to set up on Harmonious</Preview>
    <Body style={main}>
      <Container style={container}>
        <Heading style={h1}>Welcome to Harmonious</Heading>
        <Text style={text}>{contactName ? `Hi ${contactName},` : 'Hi there,'}</Text>
        <Text style={text}>{fundName} is set up on Self Serve. Sign in to work through the fund setup steps at your own pace, then invite investors when you're ready.</Text>
        <Button href={setupUrl} style={button}>Open your fund</Button>
        <Text style={muted}>Need help? Send a message to Harmonious Operations from your Inbox in the portal. You can move to a paid service level any time for a dedicated account manager.</Text>
      </Container>
    </Body>
  </Html>
)

export const template = {
  component: SelfServeWelcome,
  subject: (d: Record<string, any>) => `Set up ${d['fundName'] ?? 'your fund'} on Harmonious`,
  displayName: 'Self Serve welcome',
  previewData: { contactName: 'Jane', fundName: 'Roas Hedge LP', setupUrl: 'https://app.harmonious.co/client/funds' },
} satisfies TemplateEntry

const main = { backgroundColor: '#ffffff', fontFamily: 'Poppins, Arial, sans-serif' }
const container = { padding: '24px 28px', maxWidth: '560px' }
const h1 = { color: '#142647', fontSize: '22px', margin: '0 0 16px' }
const text = { color: '#221F20', fontSize: '15px', lineHeight: '24px', margin: '0 0 14px' }
const muted = { color: '#6b7a90', fontSize: '13px', margin: '20px 0 0' }
const button = { backgroundColor: '#142647', color: '#ffffff', borderRadius: '6px', padding: '12px 20px', fontSize: '14px', textDecoration: 'none' }
