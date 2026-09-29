import { Body, Button, Container, Head, Heading, Html, Img, Preview, Section, Text } from '@react-email/components'
import type { TemplateEntry } from './registry'

interface Props {
  investorName?: string
  fundName?: string
  senderName?: string
  documents?: string[]
  note?: string
  ctaUrl?: string
}

function DocumentsSent({ investorName = '', fundName = 'your fund', senderName = 'Your fund manager', documents = [], note = '', ctaUrl = 'https://onboard.harmonious.co' }: Props) {
  const t = { color: '#221F20', fontSize: '15px', lineHeight: '24px' }
  return (
    <Html>
      <Head />
      <Preview>Documents for {fundName} are ready for you</Preview>
      <Body style={{ backgroundColor: '#ffffff', fontFamily: 'Poppins, Helvetica, Arial, sans-serif', margin: 0, padding: '24px 0' }}>
        <Container style={{ border: '1px solid #e6ecf3', borderTop: '4px solid #5DC6D1', margin: '0 auto', maxWidth: '560px', padding: '32px' }}>
          <Section style={{ marginBottom: '20px' }}>
            <Img src="https://onboard.harmonious.co/__l5e/assets-v1/97373cb0-919a-4bb4-8395-b0b009111209/logo-navy.png" alt="Harmonious" width="150" />
          </Section>
          <Heading style={{ color: '#142647', fontFamily: 'Rubik, Helvetica, Arial, sans-serif', fontSize: '22px', margin: '0 0 16px' }}>
            Documents ready for {fundName}
          </Heading>
          <Text style={t}>{investorName ? `Hi ${investorName},` : 'Hello,'}</Text>
          <Text style={t}>{senderName} has shared the following documents with you:</Text>
          {documents.map((d) => (
            <Text key={d} style={{ ...t, margin: '0 0 4px 12px' }}>• {d}</Text>
          ))}
          {note ? <Text style={{ ...t, fontStyle: 'italic' }}>"{note}"</Text> : null}
          <Section style={{ margin: '28px 0' }}>
            <Button href={ctaUrl} style={{ backgroundColor: '#142647', borderRadius: '6px', color: '#ffffff', fontSize: '15px', fontWeight: 600, padding: '14px 24px' }}>
              Sign in to review
            </Button>
          </Section>
          <Text style={{ color: '#5b6472', fontSize: '13px', lineHeight: '20px' }}>
            Sign in with this email address to review, acknowledge or sign. Harmonious will never ask for bank details by email.
          </Text>
        </Container>
      </Body>
    </Html>
  )
}

export const template = {
  component: DocumentsSent,
  subject: (data: Record<string, any>) => `Documents ready for ${data['fundName'] || 'your fund'}`,
  displayName: 'Documents sent to investor',
  previewData: { investorName: 'Jane', fundName: 'Example Fund I', senderName: 'Example Capital', documents: ['Subscription Agreement', 'Operating Agreement'], note: '', ctaUrl: 'https://onboard.harmonious.co/investment/abc' },
} satisfies TemplateEntry
