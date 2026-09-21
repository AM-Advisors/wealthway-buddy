import React from 'react'
import { Body, Container, Head, Heading, Html, Img, Link, Preview, Section, Text } from '@react-email/components'
import type { TemplateEntry } from './registry'

interface OpsReviewRequestProps {
  itemLabel?: string
  fundName?: string
  detail?: string
  raisedBy?: string
  portalUrl?: string
}

function OpsReviewRequest({
  itemLabel = 'A new item',
  fundName = 'A fund',
  detail = '',
  raisedBy = 'A fund manager',
  portalUrl = 'https://ops.harmonious.co/ops',
}: OpsReviewRequestProps) {
  const label = {
    color: '#6b7a90',
    fontSize: '12px',
    letterSpacing: '0.04em',
    margin: '0 0 2px',
    textTransform: 'uppercase' as const,
  }
  const value = { color: '#221F20', fontSize: '15px', fontWeight: 600, margin: '0 0 16px' }

  const rows = [
    { label: 'Item', value: itemLabel },
    { label: 'Fund', value: fundName },
  ]
  if (detail) rows.push({ label: 'Details', value: detail })
  rows.push({ label: 'From', value: raisedBy })

  return (
    <Html lang="en" dir="ltr">
      <Head />
      <Preview>{`${itemLabel} is waiting for operations review`}</Preview>
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
            Waiting for operations review
          </Heading>
          <Text style={{ color: '#42506b', fontSize: '15px', lineHeight: '24px', margin: '0 0 24px' }}>
            {`${itemLabel} for ${fundName} needs a look before it is shared with the fund's managers.`}
          </Text>
          {rows.map((row) => (
            <Section key={row.label}>
              <Text style={label}>{row.label}</Text>
              <Text style={value}>{row.value}</Text>
            </Section>
          ))}
          <Text style={{ color: '#42506b', fontSize: '14px', margin: '8px 0 0' }}>
            <Link href={portalUrl} style={{ color: '#142647', fontWeight: 600 }}>
              Open the operations portal
            </Link>
          </Text>
        </Container>
      </Body>
    </Html>
  )
}

export const template = {
  component: OpsReviewRequest,
  subject: (data: Record<string, any>) =>
    `Operations review needed — ${data['itemLabel'] ?? 'a new item'} (${data['fundName'] ?? 'a fund'})`,
  displayName: 'Operations review request',
  previewData: {
    itemLabel: 'Schedule K-1',
    fundName: 'Harmonious Growth Fund II',
    detail: 'k1-2025-jordan-ellis.pdf',
    raisedBy: 'Jordan Ellis',
  },
} satisfies TemplateEntry
