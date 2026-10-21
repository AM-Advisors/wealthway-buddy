import { Body, Button, Container, Head, Heading, Html, Preview, Text } from '@react-email/components'
import type { TemplateEntry } from './registry'

interface Props {
  name?: string
  fundName?: string
  investorName?: string
  action?: 'review' | 'sign' | 'fund'
  instructionsAvailable?: boolean
  portalUrl?: string
}

function InvestmentApproval({ name = 'there', fundName = 'your fund', investorName = 'An investor', action = 'review', instructionsAvailable = false, portalUrl = 'https://app.harmonious.co/investor' }: Props) {
  const headline = action === 'fund' ? 'Your investment has been reviewed and confirmed' : action === 'sign' ? 'Your countersignature is needed' : action === 'approve_sign' ? 'An investor document is ready for you to approve and sign' : 'An investor needs your review and approval'
  return <Html lang="en" dir="ltr"><Head /><Preview>{headline} — {fundName}</Preview>
    <Body style={{ backgroundColor: '#ffffff', fontFamily: 'Poppins, Helvetica, Arial, sans-serif', margin: 0 }}>
      <Container style={{ maxWidth: '560px', padding: '32px', borderTop: '4px solid #5DC6D1' }}>
        <Text style={{ color: '#142647', fontWeight: 700 }}>Harmonious</Text>
        <Heading style={{ color: '#142647', fontFamily: 'Rubik, Helvetica, Arial, sans-serif', fontSize: '24px' }}>{headline}</Heading>
        <Text style={{ color: '#221F20', lineHeight: '24px' }}>Hi {name},</Text>
        <Text style={{ color: '#221F20', lineHeight: '24px' }}>{action === 'fund'
          ? `Your fund manager has reviewed and confirmed your investment in ${fundName}. ${instructionsAvailable ? 'Your funding and wiring instructions are now available on the platform. Sign in to complete your funding.' : 'Funding instructions will be available on the platform once the fund’s banking setup is ready.'}`
          : action === 'sign' ? `${investorName}’s signed document for ${fundName} has been approved by a fund manager. Sign in to countersign it.`
          : action === 'approve_sign' ? `${investorName} signed their documents for ${fundName}. Sign in to approve and countersign in one step.`
          : `${investorName} has completed signing for ${fundName}. Sign in to review the investor, approve or decline the signed documents, and countersign where required. Confirm the investor is good to fund when all requirements are clear.`}</Text>
        <Button href={portalUrl} style={{ backgroundColor: '#142647', color: '#ffffff', padding: '12px 20px', borderRadius: '6px' }}>{action === 'fund' ? 'Open my investment' : action === 'sign' ? 'Countersign' : action === 'approve_sign' ? 'Approve & sign' : 'Review investor'}</Button>
        {action === 'fund' && <Text style={{ color: '#221F20', fontSize: '13px', lineHeight: '20px' }}>For your security, bank details are shown only after you sign in. This confirmation does not mean funds have been received.</Text>}
      </Container>
    </Body></Html>
}

export const template = {
  component: InvestmentApproval,
  subject: (data: Record<string, any>) => `${data['action'] === 'fund' ? 'Investment confirmed' : data['action'] === 'sign' ? 'Countersignature needed' : 'Investor review and approval needed'} — ${data['fundName'] ?? 'your fund'}`,
  displayName: 'Investment review and funding confirmation',
  previewData: { name: 'Jordan', investorName: 'Alex Investor', fundName: 'Example Fund', action: 'fund', instructionsAvailable: true, portalUrl: 'https://app.harmonious.co/investor' },
} satisfies TemplateEntry