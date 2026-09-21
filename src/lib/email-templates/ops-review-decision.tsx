import React from 'react'
import { Body, Container, Head, Heading, Html, Img, Link, Preview, Section, Text } from '@react-email/components'
import type { TemplateEntry } from './registry'

interface OpsReviewDecisionProps {
  itemLabel?: string
  fundName?: string
  decision?: string
  note?: string
  reviewer?: string
  portalUrl?: string
}

const DECISIONS: Record<string, { title: string; line: string; color: string }> = {
  approved: {
    title: 'Approved by operations',
    line: 'has been approved and is now visible to the fund team.',
    color: '#5DC6D1',
  },
  rejected: {
    title: 'Sent back by operations',
    line: 'was sent back and needs another look.',
    color: '#c2454a',
  },
  updated: {
    title: 'Reviewed by operations',
    line: 'has been reviewed.',
    color: '#5DC6D1',
  },
  pending: {
    title: 'Back with operations',
    line: 'is back with the operations team for review.',
    color: '#6b7a90',
  },
}

function OpsReviewDecision({
  itemLabel = 'An item',
  fundName = 'your fund',
  decision = 'approved',
  note = '',
  reviewer = 'The operations team',
  portalUrl = 'https://ops.harmonious.co/admin',
}: OpsReviewDecisionProps) {
  const shape = DECISIONS[decision] ?? DECISIONS['updated']!

  return (
    <Html lang="en" dir="ltr">
      <Head />
      <Preview>{`${itemLabel} — ${shape.title}`}</Preview>
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
            borderTop: `4px solid ${shape.color}`,
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
          <Heading style={{ color: '#142647', fontSize: '22px', margin: '0 0 12px' }}>{shape.title}</Heading>
          <Text style={{ color: '#42506b', fontSize: '15px', lineHeight: '24px', margin: '0 0 16px' }}>
            {`${itemLabel} for ${fundName} ${shape.line}`}
          </Text>
          {note ? (
            <Text
              style={{
                backgroundColor: '#f5f8fb',
                borderLeft: '3px solid #142647',
                color: '#221F20',
                fontSize: '14px',
                lineHeight: '22px',
                margin: '0 0 20px',
                padding: '12px 16px',
              }}
            >
              {note}
            </Text>
          ) : null}
          <Text style={{ color: '#6b7a90', fontSize: '13px', margin: '0 0 20px' }}>
            {`Reviewed by ${reviewer}`}
          </Text>
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
  component: OpsReviewDecision,
  subject: (data: Record<string, any>) =>
    `${data['itemLabel'] ?? 'An item'} — ${
      DECISIONS[data['decision'] as string]?.title ?? 'reviewed by operations'
    }`,
  displayName: 'Operations review decision',
  previewData: {
    itemLabel: 'Bank account request',
    fundName: 'Harmonious Growth Fund II',
    decision: 'approved',
    note: 'Mercury application submitted, expect the account in 3 business days.',
    reviewer: 'Ops team',
  },
} satisfies TemplateEntry
