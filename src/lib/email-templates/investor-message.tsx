import { Body, Container, Head, Heading, Hr, Html, Img, Preview, Section, Text } from '@react-email/components'
import type { TemplateEntry } from './registry'
import { OpenPixel } from './pixel'

interface InvestorMessageProps {
  investorName?: string
  subject?: string
  body?: string
  offeringName?: string
  /** Signed open-tracking pixel URL. */
  pixelUrl?: string
}

function InvestorMessage({
  investorName = 'Investor',
  subject = 'Update on your investment application',
  body = '',
  offeringName = 'Harmonious',
  pixelUrl,
}: InvestorMessageProps) {
  const paragraphs = body.split(/\n{2,}/).filter(Boolean)
  return (
    <Html>
      <Head />
      <Preview>{subject}</Preview>
      <Body style={{ backgroundColor: '#f4f7fa', fontFamily: 'Poppins, Helvetica, Arial, sans-serif', margin: 0, padding: '24px 0' }}>
        <Container style={{ backgroundColor: '#ffffff', border: '1px solid #e6ecf3', borderTop: '4px solid #5DC6D1', margin: '0 auto', maxWidth: '560px', padding: '40px' }}>
          <Section style={{ marginBottom: '24px' }}>
            <Img
              src="https://onboard.harmonious.co/__l5e/assets-v1/29f55aff-64f7-4942-b5e8-228bc90b9e96/logo-navy.png"
              alt="Harmonious"
              height={28}
              style={{ display: 'block', height: '28px', width: 'auto' }}
            />
          </Section>
          <Heading as="h1" style={{ color: '#142647', fontFamily: 'Rubik, Poppins, Helvetica, Arial, sans-serif', fontSize: '20px', fontWeight: 700, margin: '0 0 24px' }}>
            {offeringName}
          </Heading>
          <Text style={{ color: '#221F20', fontSize: '15px', lineHeight: '24px' }}>Dear {investorName},</Text>
          <Section>
            {paragraphs.map((p, i) => (
              <Text key={i} style={{ color: '#221F20', fontSize: '15px', lineHeight: '24px', whiteSpace: 'pre-line' }}>
                {p}
              </Text>
            ))}
          </Section>
          <Hr style={{ borderColor: '#e6ecf3', margin: '32px 0 16px' }} />
          <Text style={{ color: '#606060', fontSize: '12px', lineHeight: '18px' }}>
            You are receiving this message regarding your investment application with {offeringName}.
          </Text>
          <OpenPixel url={pixelUrl} />
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
    offeringName: 'Harmonious Growth Fund II',
  },
} satisfies TemplateEntry
