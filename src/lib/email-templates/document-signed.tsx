import { Body, Container, Head, Heading, Hr, Html, Img, Link, Preview, Section, Text } from '@react-email/components'
import type { TemplateEntry } from './registry'

interface DocumentSignedProps {
  managerName?: string
  investorName?: string
  offeringName?: string
  documentTitle?: string
  signedAt?: string
  commitmentCents?: number
  portalUrl?: string
}

function formatMoney(cents: number) {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(
    (cents || 0) / 100,
  )
}

function formatWhen(iso?: string) {
  if (!iso) return ''
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return iso
  return `${d.toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'America/Chicago' })} CT`
}

function DocumentSigned({
  managerName = 'there',
  investorName = 'An investor',
  offeringName = 'your fund',
  documentTitle = 'Fund document',
  signedAt = '',
  commitmentCents = 0,
  portalUrl = 'https://onboard.harmonious.co/manager',
}: DocumentSignedProps) {
  const label = { color: '#6b7a90', fontSize: '12px', letterSpacing: '0.04em', margin: '0 0 2px', textTransform: 'uppercase' as const }
  const value = { color: '#221F20', fontSize: '15px', fontWeight: 600, margin: '0 0 16px' }
  return (
    <Html>
      <Head />
      <Preview>{`${investorName} signed ${documentTitle}`}</Preview>
      <Body style={{ backgroundColor: '#f4f7fa', fontFamily: 'Poppins, Helvetica, Arial, sans-serif', margin: 0, padding: '24px 0' }}>
        <Container style={{ backgroundColor: '#ffffff', border: '1px solid #e6ecf3', borderTop: '4px solid #5DC6D1', margin: '0 auto', maxWidth: '560px', padding: '40px' }}>
          <Section style={{ marginBottom: '24px' }}>
            <Img
              src="https://onboard.harmonious.co/__l5e/assets-v1/9bbcb59b-4986-4f16-a7c1-ad0f03953a15/logo-navy.png"
              alt="Harmonious"
              height={28}
              style={{ display: 'block', height: '28px', width: 'auto' }}
            />
          </Section>
          <Heading as="h1" style={{ color: '#142647', fontFamily: 'Rubik, Poppins, Helvetica, Arial, sans-serif', fontSize: '20px', fontWeight: 700, margin: '0 0 24px' }}>
            A document has been signed
          </Heading>
          <Text style={{ color: '#221F20', fontSize: '15px', lineHeight: '24px', margin: '0 0 24px' }}>
            Hi {managerName}, {investorName} has completed signing for {offeringName}. The certified copy is in the
            fund manager portal.
          </Text>

          <Section style={{ backgroundColor: '#f8fbfd', border: '1px solid #e6ecf3', padding: '20px' }}>
            <Text style={label}>Document</Text>
            <Text style={value}>{documentTitle}</Text>
            <Text style={label}>Signed</Text>
            <Text style={value}>{formatWhen(signedAt)}</Text>
            <Text style={label}>Commitment</Text>
            <Text style={{ ...value, margin: 0 }}>{formatMoney(commitmentCents)}</Text>
          </Section>

          <Text style={{ margin: '24px 0 0' }}>
            <Link
              href={portalUrl}
              style={{ backgroundColor: '#142647', color: '#ffffff', display: 'inline-block', fontSize: '15px', fontWeight: 600, padding: '12px 22px', textDecoration: 'none' }}
            >
              Review in the portal
            </Link>
          </Text>

          <Hr style={{ borderColor: '#e6ecf3', margin: '32px 0 16px' }} />
          <Text style={{ color: '#6b7a90', fontSize: '12px', lineHeight: '18px', margin: 0 }}>
            Harmonious — signature completed and timestamped by Box Sign.
          </Text>
        </Container>
      </Body>
    </Html>
  )
}

export const template: TemplateEntry = {
  component: DocumentSigned,
  displayName: 'Document signed (manager alert)',
  subject: (data) => `${data['investorName'] ?? 'An investor'} signed ${data['documentTitle'] ?? 'a fund document'}`,
  previewData: {
    managerName: 'Alyssa',
    investorName: 'Jordan Reeves',
    offeringName: 'Harmonious Income Fund I',
    documentTitle: 'Subscription Agreement',
    signedAt: new Date().toISOString(),
    commitmentCents: 25000000,
    portalUrl: 'https://onboard.harmonious.co/manager',
  },
}
