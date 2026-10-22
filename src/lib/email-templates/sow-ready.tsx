import { Body, Button, Container, Head, Heading, Html, Preview, Text } from '@react-email/components'
import type { TemplateEntry } from './registry'

interface Props {
  contactName?: string
  title?: string
  fundName?: string
  url?: string
}

const SowReady = ({ contactName, title = 'your statement of work', fundName = 'your fund', url = 'https://app.harmonious.co/client/agreements' }: Props) => (
  <Html lang="en" dir="ltr">
    <Head />
    <Preview>You have a statement of work to review and sign</Preview>
    <Body style={main}>
      <Container style={container}>
        <Heading style={h1}>A statement of work is ready to sign</Heading>
        <Text style={text}>{contactName ? `Hi ${contactName},` : 'Hi there,'}</Text>
        <Text style={text}>Harmonious has prepared "{title}" for {fundName}. Sign in to review each section and sign. It is also on your Waiting on you list in the portal.</Text>
        <Button href={url} style={button}>Review and sign</Button>
        <Text style={muted}>Questions? Reply from your Inbox in the portal and the Harmonious team will help.</Text>
      </Container>
    </Body>
  </Html>
)

export const template = {
  component: SowReady,
  subject: (d: Record<string, any>) => `Statement of work to sign for ${d['fundName'] ?? 'your fund'}`,
  displayName: 'Statement of work ready to sign',
  previewData: { contactName: 'Jane', title: 'Roas Hedge LP services', fundName: 'Roas Hedge LP', url: 'https://app.harmonious.co/client/agreements' },
} satisfies TemplateEntry

const main = { backgroundColor: '#ffffff', fontFamily: 'Poppins, Arial, sans-serif' }
const container = { padding: '24px 28px', maxWidth: '560px' }
const h1 = { color: '#142647', fontSize: '22px', margin: '0 0 16px' }
const text = { color: '#221F20', fontSize: '15px', lineHeight: '24px', margin: '0 0 14px' }
const muted = { color: '#6b7a90', fontSize: '13px', margin: '20px 0 0' }
const button = { backgroundColor: '#142647', color: '#ffffff', borderRadius: '6px', padding: '12px 20px', fontSize: '14px', textDecoration: 'none' }
