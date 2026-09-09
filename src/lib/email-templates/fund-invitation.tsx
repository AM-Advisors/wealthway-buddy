import {
  Body,
  Button,
  Container,
  Head,
  Heading,
  Hr,
  Html,
  Img,
  Preview,
  Section,
  Text,
} from '@react-email/components'
import type { TemplateEntry } from './registry'
import { OpenPixel } from './pixel'
import { DEFAULT_PORTAL_ORIGIN } from './steps'

interface FundInvitationProps {
  inviteeName?: string
  offeringName?: string
  /** 'investor' or 'fund_manager' */
  role?: string
  invitedByName?: string
  portalUrl?: string
  signInUrl?: string
  contactEmail?: string
  /** Signed open-tracking pixel URL. */
  pixelUrl?: string
}

export function fundInvitationSubject(data: Record<string, any>) {
  const fund = data['offeringName'] || 'Harmonious'
  return data['role'] === 'fund_manager'
    ? `You have been added as a fund manager for ${fund}`
    : `You are invited to invest in ${fund}`
}

function FundInvitation({
  inviteeName = 'there',
  offeringName = 'Harmonious',
  role = 'investor',
  invitedByName = 'The Harmonious team',
  portalUrl = `${DEFAULT_PORTAL_ORIGIN}/auth`,
  signInUrl = `${DEFAULT_PORTAL_ORIGIN}/auth`,
  contactEmail = 'operations@harmonious.co',
  pixelUrl,
}: FundInvitationProps) {
  const isManager = role === 'fund_manager'
  const heading = isManager
    ? `You now manage ${offeringName}`
    : `You are invited to ${offeringName}`
  const lead = isManager
    ? `${invitedByName} has given you fund manager access to ${offeringName}. You can review investor progress, documents and funding status in the Harmonious manager portal.`
    : `${invitedByName} has invited you to review and invest in ${offeringName}. Your secure investor portal is ready — identity verification, accreditation, fund documents and funding all happen in one place.`

  return (
    <Html>
      <Head />
      <Preview>
        {isManager ? 'Fund manager access' : 'Private invitation'} for {offeringName}.
      </Preview>
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
              src="https://onboard.harmonious.co/__l5e/assets-v1/9bbcb59b-4986-4f16-a7c1-ad0f03953a15/logo-navy.png"
              alt="Harmonious"
              height={28}
              style={{ display: 'block', height: '28px', width: 'auto' }}
            />
          </Section>

          <Heading
            as="h1"
            style={{
              color: '#142647',
              fontFamily: 'Rubik, Poppins, Helvetica, Arial, sans-serif',
              fontSize: '22px',
              fontWeight: 700,
              margin: '0 0 20px',
            }}
          >
            {heading}
          </Heading>

          <Text style={{ color: '#221F20', fontSize: '15px', lineHeight: '24px' }}>
            Dear {inviteeName},
          </Text>
          <Text style={{ color: '#221F20', fontSize: '15px', lineHeight: '24px' }}>{lead}</Text>

          <Text style={{ color: '#221F20', fontSize: '15px', lineHeight: '24px' }}>
            Use the secure link below to choose your password. It is tied to this email address and
            expires shortly, so set it up soon. You can also sign in at any time with
            {' '}<a href={signInUrl} style={{ color: '#142647' }}>{signInUrl}</a>{' '}
            using Continue with Google on the same address.
          </Text>

          <Section style={{ margin: '28px 0' }}>
            <Button
              href={portalUrl}
              style={{
                backgroundColor: '#142647',
                borderRadius: '6px',
                color: '#ffffff',
                display: 'inline-block',
                fontSize: '15px',
                fontWeight: 600,
                padding: '13px 26px',
                textDecoration: 'none',
              }}
            >
              Set your password and sign in
            </Button>
          </Section>

          <Hr style={{ borderColor: '#e6ecf3', margin: '32px 0 16px' }} />
          <Text style={{ color: '#606060', fontSize: '12px', lineHeight: '18px' }}>
            Questions? Reply to this message or contact us at {contactEmail}. Harmonious will never
            ask you to send funds to bank details received by email — always confirm wire
            instructions by phone.
          </Text>
          <OpenPixel url={pixelUrl} />
        </Container>
      </Body>
    </Html>
  )
}

export const template: TemplateEntry = {
  component: FundInvitation,
  subject: fundInvitationSubject,
  displayName: 'Fund invitation',
  previewData: {
    inviteeName: 'Alyssa Pettit',
    offeringName: 'Harmonious Growth Fund I',
    role: 'investor',
    invitedByName: 'Harmonious Operations',
    portalUrl: `${DEFAULT_PORTAL_ORIGIN}/reset-password`,
    signInUrl: `${DEFAULT_PORTAL_ORIGIN}/auth`,
  },
}

export default FundInvitation
