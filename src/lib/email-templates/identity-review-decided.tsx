import React from 'react'
import { Body, Button, Container, Head, Heading, Html, Img, Preview, Section, Text } from '@react-email/components'
import type { TemplateEntry } from './registry'

interface Props {
  outcome?: 'approved' | 'action_needed'
  note?: string | null
  portalUrl?: string
}

function IdentityReviewDecided({ outcome = 'approved', note = null, portalUrl = 'https://app.harmonious.co/' }: Props) {
  const ok = outcome === 'approved'
  const title = ok ? 'Your identity review is complete' : 'One more step for your identity check'
  const line = ok
    ? 'Our compliance team has finished reviewing your verification. Everything on Harmonious is now open to you, including funding steps.'
    : 'Our compliance team has finished reviewing your verification and needs you to verify again before you can continue.'
  return (
    <Html lang="en" dir="ltr">
      <Head />
      <Preview>{title}</Preview>
      <Body style={main}>
        <Container style={{ ...container, borderTop: `4px solid ${ok ? '#5DC6D1' : '#142647'}` }}>
          <Section style={{ marginBottom: '24px' }}>
            <Img src="https://onboard.harmonious.co/__l5e/assets-v1/97373cb0-919a-4bb4-8395-b0b009111209/logo-navy.png" alt="Harmonious" width="150" />
          </Section>
          <Heading style={h1}>{title}</Heading>
          <Text style={text}>{line}</Text>
          {note ? <Text style={noteStyle}>{note}</Text> : null}
          <Button href={portalUrl} style={button}>{ok ? 'Open Harmonious' : 'Verify again'}</Button>
          <Text style={small}>If you have questions, reply through your Harmonious inbox.</Text>
        </Container>
      </Body>
    </Html>
  )
}

export const template = {
  component: IdentityReviewDecided,
  subject: (data: Record<string, any>) => data['outcome'] === 'approved' ? 'Your Harmonious identity review is complete' : 'Action needed: verify your identity again',
  displayName: 'Identity review decided',
  previewData: { outcome: 'approved', portalUrl: 'https://app.harmonious.co/' },
} satisfies TemplateEntry

const main = { backgroundColor: '#ffffff', fontFamily: 'Poppins, Helvetica, Arial, sans-serif', margin: 0, padding: '24px 0' }
const container = { backgroundColor: '#ffffff', border: '1px solid #e6ecf3', margin: '0 auto', maxWidth: '560px', padding: '40px' }
const h1 = { color: '#142647', fontSize: '22px', margin: '0 0 12px' }
const text = { color: '#42506b', fontSize: '15px', lineHeight: '24px', margin: '0 0 16px' }
const noteStyle = { backgroundColor: '#f5f8fb', borderLeft: '3px solid #142647', color: '#221F20', fontSize: '14px', lineHeight: '22px', margin: '0 0 20px', padding: '12px 16px' }
const button = { backgroundColor: '#142647', borderRadius: '6px', color: '#ffffff', fontSize: '15px', fontWeight: 600, padding: '12px 22px', textDecoration: 'none' }
const small = { color: '#6b7a90', fontSize: '13px', margin: '20px 0 0' }
