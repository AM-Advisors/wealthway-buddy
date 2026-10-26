import { Body, Button, Container, Head, Heading, Html, Preview, Text } from '@react-email/components'
import type { TemplateEntry } from './registry'

interface Props {
  name?: string
  fundName?: string
  launchDate?: string
  onboardingUrl?: string
  fundUrl?: string
}

const FundLive = ({ name, fundName = 'Your fund', launchDate, onboardingUrl, fundUrl = 'https://app.harmonious.co/client/funds' }: Props) => (
  <Html lang="en" dir="ltr">
    <Head />
    <Preview>{fundName} is live and ready for investors</Preview>
    <Body style={main}>
      <Container style={container}>
        <Heading style={h1}>{fundName} is now live</Heading>
        <Text style={text}>{name ? `Hi ${name},` : 'Hi there,'}</Text>
        <Text style={text}>
          Your fund is open for investor onboarding{launchDate ? ` as of ${launchDate}` : ''}.
        </Text>
        {onboardingUrl ? (
          <>
            <Text style={label}>Your investor onboarding link</Text>
            <Text style={link}>{onboardingUrl}</Text>
            <Text style={muted}>Copy and share this link with the investors you invite.</Text>
          </>
        ) : null}
        <Heading as="h2" style={h2}>How to onboard investors</Heading>
        <Text style={text}>
          1. Share the onboarding link above, or add investors one at a time from My Funds, Investors, Add investor. Each person you add receives a personal invitation.
          <br />
          2. Investors complete four steps: About You, Verification, Sign and Fund.
          <br />
          3. Track progress on the Investors tab and approve admissions on the Approvals tab.
          <br />
          4. Wire instructions are shared based on the countersign timing you chose for the fund.
          <br />
          5. Questions? Message the Operations inbox in your portal.
        </Text>
        <Button href={fundUrl} style={button}>Open your fund</Button>
      </Container>
    </Body>
  </Html>
)

export const template = {
  component: FundLive,
  subject: (d: Record<string, any>) => `Your fund ${d['fundName'] ?? ''} is now live`.replace('  ', ' '),
  displayName: 'Fund is live',
  previewData: { name: 'Jane', fundName: 'Fablewood Ventures I LP', launchDate: 'October 26, 2026', onboardingUrl: 'https://app.harmonious.co/join/fablewood', fundUrl: 'https://app.harmonious.co/client/funds/example' },
} satisfies TemplateEntry

const main = { backgroundColor: '#ffffff', fontFamily: 'Poppins, Arial, sans-serif' }
const container = { padding: '24px 28px', maxWidth: '560px' }
const h1 = { color: '#142647', fontFamily: 'Rubik, Arial, sans-serif', fontSize: '22px', margin: '0 0 16px' }
const h2 = { color: '#142647', fontFamily: 'Rubik, Arial, sans-serif', fontSize: '17px', margin: '22px 0 10px' }
const text = { color: '#221F20', fontSize: '15px', lineHeight: '24px', margin: '0 0 14px' }
const label = { color: '#142647', fontSize: '13px', fontWeight: 600, margin: '8px 0 4px' }
const link = { color: '#142647', fontSize: '14px', backgroundColor: '#eef9fa', borderLeft: '3px solid #5DC6D1', padding: '10px 12px', margin: '0 0 6px', wordBreak: 'break-all' as const }
const muted = { color: '#6b7a90', fontSize: '13px', margin: '0 0 8px' }
const button = { backgroundColor: '#142647', color: '#ffffff', borderRadius: '6px', padding: '12px 20px', fontSize: '14px', textDecoration: 'none' }
