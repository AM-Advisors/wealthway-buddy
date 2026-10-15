import { Body, Container, Head, Heading, Hr, Html, Img, Link, Preview, Section, Text } from '@react-email/components'
import type { TemplateEntry } from './registry'

interface Props {
  recipientName?: string
  documentTitle?: string
  fundName?: string
  steps?: string[]
  requestedBy?: string
  ctaUrl?: string
  ctaLabel?: string
  firstTime?: boolean
}

function SigningReminder({
  recipientName = 'there',
  documentTitle = 'a document',
  fundName = 'your fund',
  steps = ['Review the document', 'Sign'],
  requestedBy,
  ctaUrl = 'https://app.harmonious.co/home',
  ctaLabel = 'Open and sign',
  firstTime = false,
}: Props) {
  return (
    <Html lang="en" dir="ltr">
      <Head />
      <Preview>{`Reminder: ${documentTitle} is waiting for you`}</Preview>
      <Body style={{ backgroundColor: '#ffffff', fontFamily: 'Poppins, Helvetica, Arial, sans-serif', margin: 0, padding: '24px 0' }}>
        <Container style={{ backgroundColor: '#ffffff', border: '1px solid #e6ecf3', borderTop: '4px solid #5DC6D1', margin: '0 auto', maxWidth: '560px', padding: '40px' }}>
          <Section style={{ marginBottom: '24px' }}>
            <Img src="https://onboard.harmonious.co/__l5e/assets-v1/97373cb0-919a-4bb4-8395-b0b009111209/logo-navy.png" alt="Harmonious" height={28} style={{ display: 'block', height: '28px', width: 'auto' }} />
          </Section>
          <Heading as="h1" style={{ color: '#142647', fontFamily: 'Rubik, Poppins, Helvetica, Arial, sans-serif', fontSize: '20px', fontWeight: 700, margin: '0 0 16px' }}>
            {documentTitle} is waiting for you
          </Heading>
          <Text style={text}>
            Hi {recipientName}, this is a friendly reminder that {documentTitle} for {fundName} still needs your attention
            {requestedBy ? `. ${requestedBy} asked us to send it` : ''}. It only takes a few minutes.
          </Text>
          <Section style={{ backgroundColor: '#f8fbfd', border: '1px solid #e6ecf3', padding: '16px 20px', margin: '8px 0 0' }}>
            <Text style={{ ...label }}>What's left to do</Text>
            {steps.map((s, i) => (
              <Text key={i} style={{ ...text, margin: '4px 0' }}>{i + 1}. {s}</Text>
            ))}
          </Section>
          <Text style={{ margin: '24px 0 0' }}>
            <Link href={ctaUrl} style={{ backgroundColor: '#142647', color: '#ffffff', display: 'inline-block', fontSize: '15px', fontWeight: 600, padding: '12px 22px', textDecoration: 'none' }}>
              {ctaLabel}
            </Link>
          </Text>
          <Text style={{ ...muted, marginTop: '12px' }}>
            {firstTime
              ? 'This personal link lets you set your password first, then takes you straight to the document. It expires in 7 days.'
              : 'Sign in with this email address and you will go straight to the document.'}
          </Text>
          <Hr style={{ borderColor: '#e6ecf3', margin: '32px 0 16px' }} />
          <Text style={muted}>Harmonious · Questions? Reply to your Harmonious contact or email support@harmonious.co.</Text>
        </Container>
      </Body>
    </Html>
  )
}

const text = { color: '#221F20', fontSize: '15px', lineHeight: '24px', margin: '0 0 16px' }
const label = { color: '#6b7a90', fontSize: '12px', letterSpacing: '0.04em', margin: '0 0 6px', textTransform: 'uppercase' as const }
const muted = { color: '#6b7a90', fontSize: '12px', lineHeight: '18px', margin: 0 }

export const template = {
  component: SigningReminder,
  subject: (d: Record<string, any>) => `Reminder: please sign ${d?.['documentTitle'] ?? 'your document'}`,
  displayName: 'Signing reminder',
  previewData: {
    recipientName: 'Thomas',
    documentTitle: 'Form SS-4',
    fundName: 'CORPS EREBOR',
    steps: ['Add the Responsible Party SSN or ITIN', 'Confirm the details on each line', 'Sign'],
    requestedBy: 'Alyssa Pettit',
    ctaUrl: 'https://app.harmonious.co/manager/ss4/example',
    firstTime: true,
  },
} satisfies TemplateEntry
