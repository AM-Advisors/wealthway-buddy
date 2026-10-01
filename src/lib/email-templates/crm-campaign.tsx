import { Body, Container, Head, Hr, Html, Img, Link, Preview, Section, Text } from '@react-email/components'
import type { TemplateEntry } from './registry'

interface CampaignProps {
  subject?: string
  body?: string
  fundName?: string | null
  unsubscribeUrl?: string
}

function CrmCampaign({ subject = 'An update', body = '', fundName = null, unsubscribeUrl = 'https://app.harmonious.co' }: CampaignProps) {
  const paragraphs = body.split(/\n{2,}/).map((p) => p.trim()).filter(Boolean)
  return (
    <Html>
      <Head />
      <Preview>{subject}</Preview>
      <Body style={{ backgroundColor: '#ffffff', fontFamily: 'Poppins, Helvetica, Arial, sans-serif', margin: 0, padding: '24px 0' }}>
        <Container style={{ border: '1px solid #e6ecf3', borderTop: '4px solid #5DC6D1', margin: '0 auto', maxWidth: '560px', padding: '40px' }}>
          <Section style={{ marginBottom: '24px' }}>
            <Img src="https://onboard.harmonious.co/__l5e/assets-v1/97373cb0-919a-4bb4-8395-b0b009111209/logo-navy.png" alt="Harmonious" width="140" />
          </Section>
          {fundName ? <Text style={{ color: '#6b7a90', fontSize: '12px', textTransform: 'uppercase', letterSpacing: '0.04em', margin: '0 0 8px' }}>{fundName}</Text> : null}
          {paragraphs.map((p, i) => (
            <Text key={i} style={{ color: '#221F20', fontSize: '15px', lineHeight: '24px', margin: '0 0 16px', whiteSpace: 'pre-line' }}>{p}</Text>
          ))}
          <Hr style={{ borderColor: '#e6ecf3', margin: '24px 0' }} />
          <Text style={{ color: '#6b7a90', fontSize: '12px', margin: 0 }}>
            You are receiving this because you agreed to hear from {fundName ?? 'Harmonious'}.{' '}
            <Link href={unsubscribeUrl} style={{ color: '#142647' }}>Unsubscribe</Link>
          </Text>
        </Container>
      </Body>
    </Html>
  )
}

export const template = {
  component: CrmCampaign,
  subject: (d: Record<string, any>) => d['subject'] || 'An update from Harmonious',
  displayName: 'Campaign email',
  previewData: { subject: 'Quarterly update', body: 'Hello,\n\nHere is our quarterly update.', fundName: 'Example Fund I', unsubscribeUrl: 'https://app.harmonious.co' },
} satisfies TemplateEntry
