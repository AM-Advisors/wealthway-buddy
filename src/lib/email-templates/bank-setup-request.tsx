import React from 'react'
import { Body, Container, Head, Heading, Hr, Html, Img, Link, Preview, Section, Text } from '@react-email/components'
import type { TemplateEntry } from './registry'

interface BankSetupRequestProps {
  fundName?: string
  legalEntityName?: string
  entityType?: string
  stateFormed?: string
  bankName?: string
  requestedBy?: string
  requestedByEmail?: string
  note?: string
  portalUrl?: string
}

function BankSetupRequest({
  fundName = 'A fund',
  legalEntityName = '',
  entityType = '',
  stateFormed = '',
  bankName = 'a bank',
  requestedBy = 'A fund manager',
  requestedByEmail = '',
  note = '',
  portalUrl = 'https://onboard.harmonious.co/admin',
}: BankSetupRequestProps) {
  const label = {
    color: '#6b7a90',
    fontSize: '12px',
    letterSpacing: '0.04em',
    margin: '0 0 2px',
    textTransform: 'uppercase' as const,
  }
  const value = { color: '#221F20', fontSize: '15px', fontWeight: 600, margin: '0 0 16px' }

  const rows: { label: string; value: string }[] = [
    { label: 'Fund', value: fundName },
    { label: 'Bank requested', value: bankName },
  ]
  if (legalEntityName) rows.push({ label: 'Legal entity', value: legalEntityName })
  if (entityType || stateFormed)
    rows.push({ label: 'Entity', value: [entityType, stateFormed && `formed in ${stateFormed}`].filter(Boolean).join(' — ') })
  rows.push({ label: 'Requested by', value: requestedByEmail ? `${requestedBy} (${requestedByEmail})` : requestedBy })
  if (note) rows.push({ label: 'Note', value: note })

  return (
    <Html lang="en" dir="ltr">
      <Head />
      <Preview>{`${fundName} asked Harmonious to open a ${bankName} account`}</Preview>
      <Body
        style={{
          backgroundColor: '#ffffff',
          fontFamily: 'Poppins, Helvetica, Arial, sans-serif',
          margin: 0,
          padding: '24px 0',
        }}
      >
        <Container
          style={{
            backgroundColor: '#ffffff',
            border: '1px solid #e6ecf3',
            borderTop: '4px solid #5DC6D1',
            margin: '0 auto',
            maxWidth: '560px',
            padding: '40px',
          }}
        >
          <Section style={{ marginBottom: '24px' }}>
            <Img
              src="https://onboard.harmonious.co/__l5e/assets-v1/97373cb0-919a-4bb4-8395-b0b009111209/logo-navy.png"
              alt="Harmonious"
              width="150"
            />
          </Section>
          <Heading style={{ color: '#142647', fontSize: '22px', margin: '0 0 12px' }}>
            New bank account request
          </Heading>
          <Text style={{ color: '#42506b', fontSize: '15px', lineHeight: '24px', margin: '0 0 24px' }}>
            {`${requestedBy} asked Harmonious to open the fund's bank account with ${bankName}.`}
          </Text>
          {rows.map((row) => (
            <Section key={row.label}>
              <Text style={label}>{row.label}</Text>
              <Text style={value}>{row.value}</Text>
            </Section>
          ))}
          <Hr style={{ borderColor: '#e6ecf3', margin: '8px 0 24px' }} />
          <Text style={{ color: '#42506b', fontSize: '14px', margin: 0 }}>
            <Link href={portalUrl} style={{ color: '#142647', fontWeight: 600 }}>
              Open the fund
            </Link>
          </Text>
        </Container>
      </Body>
    </Html>
  )
}

export const template = {
  component: BankSetupRequest,
  subject: (data: Record<string, any>) =>
    `Bank account request — ${data['fundName'] ?? 'a fund'} (${data['bankName'] ?? 'bank'})`,
  displayName: 'Bank account setup request',
  previewData: {
    fundName: 'Harmonious Growth Fund II',
    legalEntityName: 'Harmonious Growth Fund II, LLC',
    entityType: 'LLC',
    stateFormed: 'Delaware',
    bankName: 'Mercury',
    requestedBy: 'Jordan Ellis',
    requestedByEmail: 'jordan@example.com',
    note: 'Please open as soon as the EIN arrives.',
  },
} satisfies TemplateEntry
