import { Body, Button, Container, Head, Heading, Html, Img, Preview, Section, Text } from '@react-email/components'
import type { TemplateEntry } from './registry'

interface Props {
  recipientName?: string
  fundName?: string
  kind?: string
  ctaUrl?: string
}

function StatementReady({ recipientName = '', fundName = 'your fund', kind = 'statement', ctaUrl = 'https://onboard.harmonious.co' }: Props) {
  const t = { color: '#221F20', fontSize: '15px', lineHeight: '24px' }
  return (
    <Html>
      <Head />
      <Preview>Your {kind} for {fundName} is ready</Preview>
      <Body style={{ backgroundColor: '#ffffff', fontFamily: 'Poppins, Helvetica, Arial, sans-serif', margin: 0, padding: '24px 0' }}>
        <Container style={{ border: '1px solid #e6ecf3', borderTop: '4px solid #5DC6D1', margin: '0 auto', maxWidth: '560px', padding: '32px' }}>
          <Section style={{ marginBottom: '20px' }}>
            <Img src="https://onboard.harmonious.co/__l5e/assets-v1/97373cb0-919a-4bb4-8395-b0b009111209/logo-navy.png" alt="Harmonious" width="150" />
          </Section>
          <Heading style={{ color: '#142647', fontFamily: 'Rubik, Helvetica, Arial, sans-serif', fontSize: '22px', margin: '0 0 16px' }}>
            A new {kind} is ready
          </Heading>
          <Text style={t}>{recipientName ? `Hi ${recipientName},` : 'Hello,'}</Text>
          <Text style={t}>Harmonious has reviewed and released your {kind} for {fundName}. It is waiting for you in your portal.</Text>
          <Section style={{ margin: '28px 0' }}>
            <Button href={ctaUrl} style={{ backgroundColor: '#142647', borderRadius: '6px', color: '#ffffff', fontSize: '15px', fontWeight: 600, padding: '14px 24px' }}>
              Sign in to view
            </Button>
          </Section>
          <Text style={{ color: '#5b6472', fontSize: '13px', lineHeight: '20px' }}>
            For your security the document itself is not attached. Harmonious will never ask for bank details by email.
          </Text>
        </Container>
      </Body>
    </Html>
  )
}

export const template = {
  component: StatementReady,
  subject: (data: Record<string, any>) => `Your ${data['kind'] || 'statement'} for ${data['fundName'] || 'your fund'} is ready`,
  displayName: 'Statement ready',
  previewData: { recipientName: 'Jane', fundName: 'Example Fund I', kind: 'capital account statement', ctaUrl: 'https://onboard.harmonious.co/statements' },
} satisfies TemplateEntry
