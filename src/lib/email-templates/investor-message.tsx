import { Body, Container, Head, Heading, Hr, Html, Preview, Section, Text } from '@react-email/components'
import type { TemplateEntry } from './registry'

interface InvestorMessageProps {
  investorName?: string
  subject?: string
  body?: string
  offeringName?: string
}

function InvestorMessage({
  investorName = 'Investor',
  subject = 'Update on your investment application',
  body = '',
  offeringName = 'Meridian Capital',
}: InvestorMessageProps) {
  const paragraphs = body.split(/\n{2,}/).filter(Boolean)
  return (
    <Html>
      <Head />
      <Preview>{subject}</Preview>
      <Body style={{ backgroundColor: '#f7f5f0', fontFamily: 'Georgia, serif', margin: 0, padding: '24px 0' }}>
        <Container style={{ backgroundColor: '#ffffff', border: '1px solid #e5e0d5', margin: '0 auto', maxWidth: '560px', padding: '40px' }}>
          <Heading as="h1" style={{ color: '#1c2b4a', fontSize: '20px', fontWeight: 400, margin: '0 0 24px' }}>
            {offeringName}
          </Heading>
          <Text style={{ color: '#333333', fontSize: '15px', lineHeight: '24px' }}>Dear {investorName},</Text>
          <Section>
            {paragraphs.map((p, i) => (
              <Text key={i} style={{ color: '#333333', fontSize: '15px', lineHeight: '24px', whiteSpace: 'pre-line' }}>
                {p}
              </Text>
            ))}
          </Section>
          <Hr style={{ borderColor: '#e5e0d5', margin: '32px 0 16px' }} />
          <Text style={{ color: '#8a8577', fontSize: '12px', lineHeight: '18px' }}>
            You are receiving this message regarding your investment application with {offeringName}.
          </Text>
        </Container>
      </Body>
    </Html>
  )
}

export const template = {
  component: InvestorMessage,
  subject: (data: Record<string, any>) => data['subject'] || 'Update on your investment application',
  displayName: 'Investor message',
  previewData: {
    investorName: 'Jane Doe',
    subject: 'Additional information needed for your application',
    body: 'Thank you for your application.\n\nWe need one more document to complete your accreditation review.',
    offeringName: 'Meridian Growth Fund II',
  },
} satisfies TemplateEntry
