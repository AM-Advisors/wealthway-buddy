import React from 'react'
import { Body, Button, Container, Head, Heading, Html, Img, Preview, Section, Text } from '@react-email/components'
import type { TemplateEntry } from './registry'

interface Props { entityName?: string; downloadUrl?: string; expiresOn?: string; accountSummary?: string; documentList?: string[] }

function TexasCapitalPackage({ entityName = 'A client', downloadUrl = 'https://app.harmonious.co', expiresOn = '', accountSummary = '', documentList = [] }: Props) {
  const text = { color: '#42506b', fontSize: '15px', lineHeight: '24px', margin: '0 0 16px' }
  return (
    <Html lang="en" dir="ltr">
      <Head />
      <Preview>{`New account package for ${entityName}`}</Preview>
      <Body style={{ backgroundColor: '#ffffff', fontFamily: 'Poppins, Helvetica, Arial, sans-serif', margin: 0, padding: '24px 0' }}>
        <Container style={{ border: '1px solid #e6ecf3', borderTop: '4px solid #5DC6D1', margin: '0 auto', maxWidth: '560px', padding: '40px' }}>
          <Section style={{ marginBottom: '24px' }}>
            <Img src="https://onboard.harmonious.co/__l5e/assets-v1/97373cb0-919a-4bb4-8395-b0b009111209/logo-navy.png" alt="Harmonious" width="150" />
          </Section>
          <Heading style={{ color: '#142647', fontSize: '22px', margin: '0 0 12px' }}>New account package</Heading>
          <Text style={text}>{`Hello Texas Capital team, attached by secure link is the account opening package for ${entityName}.`}</Text>
          {accountSummary ? <Text style={text}>{accountSummary}</Text> : null}
          {documentList.length ? <Text style={text}>{`Included: ${documentList.join('; ')}.`}</Text> : null}
          <Button href={downloadUrl} style={{ backgroundColor: '#142647', borderRadius: '6px', color: '#ffffff', fontSize: '15px', fontWeight: 600, padding: '12px 20px' }}>Download the package</Button>
          <Text style={{ ...text, fontSize: '13px', marginTop: '20px' }}>{`This private link works until ${expiresOn || 'it expires'}. Personal details are only in the package, never in this email. Reply to this email if you need anything else.`}</Text>
        </Container>
      </Body>
    </Html>
  )
}

export const template = {
  component: TexasCapitalPackage,
  subject: (d: Record<string, any>) => `New account package · ${d['entityName'] ?? 'client'}`,
  displayName: 'Texas Capital account package',
  previewData: { entityName: 'Corps Erebor, a series of AM SPV Fund Management LLC', expiresOn: 'November 30, 2026', accountSummary: '1 checking account, added to the existing BankNow portal.', documentList: ['Customer BSA Profile', 'Operating Agreement'] },
} satisfies TemplateEntry
