import { Body, Button, Container, Head, Heading, Html, Img, Preview, Section, Text } from '@react-email/components'
import type { TemplateEntry } from './registry'

interface Props {
  where?: string
  device?: string
  occurredAt?: string
  reason?: string
  revokeUrl?: string
}

function formatWhen(iso?: string) {
  if (!iso) return ''
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return iso
  return `${d.toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'America/Chicago' })} CT`
}

function SecurityAlert({
  where = 'Austin, Texas, US',
  device = 'Chrome on macOS',
  occurredAt = new Date().toISOString(),
  reason = 'new device',
  revokeUrl = 'https://app.harmonious.co',
}: Props) {
  const label = { color: '#6b7a90', fontSize: '12px', letterSpacing: '0.04em', margin: '0 0 2px', textTransform: 'uppercase' as const }
  const value = { color: '#221F20', fontSize: '15px', fontWeight: 600, margin: '0 0 16px' }
  return (
    <Html>
      <Head />
      <Preview>New sign-in to your Harmonious account</Preview>
      <Body style={{ backgroundColor: '#ffffff', fontFamily: 'Poppins, Helvetica, Arial, sans-serif', margin: 0, padding: '24px 0' }}>
        <Container style={{ border: '1px solid #e6ecf3', borderTop: '4px solid #142647', margin: '0 auto', maxWidth: '560px', padding: '40px' }}>
          <Section style={{ marginBottom: '24px' }}>
            <Img src="https://onboard.harmonious.co/__l5e/assets-v1/97373cb0-919a-4bb4-8395-b0b009111209/logo-navy.png" alt="Harmonious" width="160" />
          </Section>
          <Heading style={{ color: '#142647', fontFamily: 'Rubik, Helvetica, Arial, sans-serif', fontSize: '22px', margin: '0 0 12px' }}>
            New sign-in to your account
          </Heading>
          <Text style={{ color: '#221F20', fontSize: '15px', lineHeight: '24px', margin: '0 0 24px' }}>
            We noticed a sign-in from a {reason}. If this was you, no action is needed.
          </Text>
          <Section style={{ backgroundColor: '#f4f7fa', padding: '20px' }}>
            <Text style={label}>Where</Text>
            <Text style={value}>{where}</Text>
            <Text style={label}>Device</Text>
            <Text style={value}>{device}</Text>
            <Text style={label}>When</Text>
            <Text style={{ ...value, margin: 0 }}>{formatWhen(occurredAt)}</Text>
          </Section>
          <Text style={{ color: '#221F20', fontSize: '15px', lineHeight: '24px', margin: '24px 0 16px' }}>
            Not you? This signs out every session and requires a new password.
          </Text>
          <Button href={revokeUrl} style={{ backgroundColor: '#142647', color: '#ffffff', padding: '12px 20px', fontSize: '15px', textDecoration: 'none' }}>
            This wasn't me
          </Button>
        </Container>
      </Body>
    </Html>
  )
}

export const template: TemplateEntry = {
  component: SecurityAlert,
  displayName: 'Security alert (new sign-in location/device)',
  subject: 'New sign-in to your Harmonious account',
  previewData: { where: 'Austin, Texas, US', device: 'Chrome on macOS', reason: 'new device' },
}

export default SecurityAlert
