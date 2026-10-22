import { Body, Button, Container, Head, Heading, Hr, Html, Img, Preview, Section, Text } from '@react-email/components'
import type { TemplateEntry } from './registry'

interface SaleSignedProps {
  recipientName?: string
  clientName?: string
  documentTitle?: string
  kindLabel?: string
  version?: number
  signerName?: string
  signedAt?: string
  invoiceNumber?: string
  invoiceAmount?: string
  paymentMethod?: string
  actionUrl?: string
  actionLabel?: string
  forSigner?: boolean
}

function formatWhen(iso?: string) {
  if (!iso) return ''
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return iso
  return `${d.toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'America/Chicago' })} CT`
}

function SaleSigned({
  recipientName = 'there',
  clientName = 'the client',
  documentTitle = 'your agreement',
  kindLabel = 'Quote',
  version = 1,
  signerName = 'The signer',
  signedAt = '',
  invoiceNumber = '',
  invoiceAmount = '',
  paymentMethod = '',
  actionUrl = 'https://app.harmonious.co/client/invoices',
  actionLabel = 'View invoice',
  forSigner = false,
}: SaleSignedProps) {
  const label = { color: '#6b7a90', fontSize: '12px', letterSpacing: '0.04em', margin: '0 0 2px', textTransform: 'uppercase' as const }
  const value = { color: '#221F20', fontSize: '15px', fontWeight: 600, margin: '0 0 16px' }
  return (
    <Html>
      <Head />
      <Preview>{`${clientName} signed ${documentTitle} — invoice ${invoiceNumber} issued`}</Preview>
      <Body style={{ backgroundColor: '#f4f7fa', fontFamily: 'Poppins, Helvetica, Arial, sans-serif', margin: 0, padding: '24px 0' }}>
        <Container style={{ backgroundColor: '#ffffff', border: '1px solid #e6ecf3', borderTop: '4px solid #5DC6D1', margin: '0 auto', maxWidth: '560px', padding: '40px' }}>
          <Section style={{ marginBottom: '24px' }}>
            <Img
              src="https://onboard.harmonious.co/__l5e/assets-v1/97373cb0-919a-4bb4-8395-b0b009111209/logo-navy.png"
              alt="Harmonious"
              height={28}
              style={{ display: 'block', height: '28px', width: 'auto' }}
            />
          </Section>
          <Heading as="h1" style={{ color: '#142647', fontFamily: 'Rubik, Poppins, Helvetica, Arial, sans-serif', fontSize: '20px', fontWeight: 700, margin: '0 0 24px' }}>
            {forSigner ? 'Thank you — your signature is complete' : `${kindLabel} signed and approved`}
          </Heading>
          <Text style={{ color: '#221F20', fontSize: '15px', lineHeight: '24px', margin: '0 0 24px' }}>
            {forSigner
              ? `Hi ${recipientName}, thank you for signing ${documentTitle} for ${clientName}. Your signed copy is on file, and your invoice is ready in your portal.`
              : `Hi ${recipientName}, ${signerName} signed and approved ${documentTitle} for ${clientName}. The completed version is recorded and the invoice was issued automatically.`}
          </Text>

          <Section style={{ backgroundColor: '#f8fbfd', border: '1px solid #e6ecf3', padding: '20px' }}>
            <Text style={label}>{kindLabel}</Text>
            <Text style={value}>{documentTitle} (version {version})</Text>
            <Text style={label}>Signed by</Text>
            <Text style={value}>{signerName}{signedAt ? ` — ${formatWhen(signedAt)}` : ''}</Text>
            <Text style={label}>Invoice</Text>
            <Text style={value}>{invoiceNumber}{invoiceAmount ? ` — ${invoiceAmount}` : ''}</Text>
            {paymentMethod ? (
              <>
                <Text style={label}>Payment method chosen</Text>
                <Text style={value}>{paymentMethod}</Text>
              </>
            ) : null}
          </Section>

          <Section style={{ margin: '28px 0' }}>
            <Button
              href={actionUrl}
              style={{ backgroundColor: '#142647', borderRadius: '6px', color: '#ffffff', display: 'inline-block', fontSize: '14px', fontWeight: 600, padding: '12px 24px', textDecoration: 'none' }}
            >
              {actionLabel}
            </Button>
          </Section>

          <Hr style={{ borderColor: '#e6ecf3', margin: '24px 0' }} />
          <Text style={{ color: '#6b7a90', fontSize: '12px', lineHeight: '18px', margin: 0 }}>
            Harmonious — administrative and technology services for fund managers.
          </Text>
        </Container>
      </Body>
    </Html>
  )
}

export const template = {
  component: SaleSigned,
  subject: (data: Record<string, any>) =>
    data['forSigner']
      ? `Signed: ${data['documentTitle'] ?? 'your agreement'} — invoice ${data['invoiceNumber'] ?? ''}`
      : `Signed: ${data['documentTitle'] ?? 'Sale document'} — ${data['clientName'] ?? ''}`,
  displayName: 'Sale signed (quote/proposal/RFP/RFQ)',
  previewData: {
    recipientName: 'Jane',
    clientName: 'Example Capital LP',
    documentTitle: 'Fund Administration Proposal',
    kindLabel: 'Proposal',
    version: 2,
    signerName: 'John Smith',
    signedAt: new Date().toISOString(),
    invoiceNumber: 'HRM-2026-0042',
    invoiceAmount: '$12,000.00',
    paymentMethod: 'Card',
  },
} satisfies TemplateEntry
