import { Body, Button, Container, Head, Heading, Html, Preview, Text } from '@react-email/components'
import type { TemplateEntry } from './registry'

interface Props {
  professionalName?: string
  investorName?: string
  fundName?: string
  uploadUrl?: string
  expiresOn?: string
}

const Email = ({ professionalName, investorName = 'Your client', fundName = 'a private fund', uploadUrl = 'https://app.harmonious.co', expiresOn }: Props) => (
  <Html lang="en" dir="ltr">
    <Head />
    <Preview>{investorName} asked you to confirm their accredited investor status</Preview>
    <Body style={main}>
      <Container style={container}>
        <Heading style={h1}>Accreditation letter request</Heading>
        <Text style={text}>{professionalName ? `Hi ${professionalName},` : 'Hello,'}</Text>
        <Text style={text}>
          {investorName} is investing in {fundName} through Harmonious and asked you to confirm their accredited investor status.
        </Text>
        <Text style={text}>
          Please upload a signed letter, dated within the last 90 days, stating that you have verified they are an accredited investor. The upload page includes a sample letter. No account is needed.
        </Text>
        <Button href={uploadUrl} style={button}>Upload the letter</Button>
        <Text style={muted}>
          This private link works once{expiresOn ? ` and expires on ${expiresOn}` : ''}. If you did not expect this request, you can ignore this email.
        </Text>
      </Container>
    </Body>
  </Html>
)

export const template = {
  component: Email,
  subject: (d: Record<string, any>) => `${d['investorName'] ?? 'Your client'} asked you for an accreditation letter`,
  displayName: 'Accreditation letter request',
  previewData: { professionalName: 'Pat Rivers', investorName: 'Casey Alden', fundName: 'Fablewood Ventures I LP', uploadUrl: 'https://app.harmonious.co/verify-accreditation/example', expiresOn: 'November 9, 2026' },
} satisfies TemplateEntry

const main = { backgroundColor: '#ffffff', fontFamily: 'Poppins, Arial, sans-serif' }
const container = { padding: '24px 28px', maxWidth: '560px' }
const h1 = { color: '#142647', fontFamily: 'Rubik, Arial, sans-serif', fontSize: '22px', margin: '0 0 16px' }
const text = { color: '#221F20', fontSize: '15px', lineHeight: '24px', margin: '0 0 14px' }
const muted = { color: '#6b7a90', fontSize: '13px', margin: '18px 0 0' }
const button = { backgroundColor: '#142647', color: '#ffffff', borderRadius: '6px', padding: '12px 20px', fontSize: '14px', textDecoration: 'none' }
