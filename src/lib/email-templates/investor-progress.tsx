import { Body, Button, Container, Head, Heading, Html, Img, Preview, Text } from '@react-email/components'
import type { TemplateEntry } from './registry'

interface Props { name?: string; fundName?: string; investorName?: string; manager?: boolean; completedSteps?: string[]; portalUrl?: string }
function InvestorProgress({ name = 'there', fundName = 'your fund', investorName = 'Your investor', manager = false, completedSteps = [], portalUrl = 'https://app.harmonious.co' }: Props) {
  return <Html lang="en"><Head /><Preview>Onboarding progress for {fundName}</Preview>
    <Body style={main}><Container style={container}>
      <Img src="https://onboard.harmonious.co/__l5e/assets-v1/97373cb0-919a-4bb4-8395-b0b009111209/logo-navy.png" alt="Harmonious" width="150" />
      <Heading style={heading}>Onboarding progress</Heading>
      <Text>Hi {name},</Text>
      <Text>{manager ? `${investorName} has completed these steps for ${fundName}:` : `You have completed these steps for ${fundName}:`}</Text>
      {completedSteps.map((step) => <Text key={step}>✓ {step}</Text>)}
      <Button href={portalUrl} style={button}>View progress</Button>
      <Text style={note}>Sign in to view current status and any remaining steps. Bank details and verification documents are never included in these emails.</Text>
    </Container></Body></Html>
}
const main = { backgroundColor: '#ffffff', fontFamily: 'Poppins, Arial, sans-serif', padding: '24px 0', color: '#221F20' }
const container = { maxWidth: '560px', padding: '32px', borderTop: '4px solid #5DC6D1' }
const heading = { color: '#142647', fontFamily: 'Rubik, Arial, sans-serif', fontSize: '22px' }
const button = { backgroundColor: '#142647', color: '#ffffff', borderRadius: '6px', padding: '14px 24px' }
const note = { color: '#5b6472', fontSize: '13px', lineHeight: '20px' }
export const template = { component: InvestorProgress, subject: (data: Record<string, any>) => `Onboarding progress · ${data['fundName'] || 'your fund'}`, displayName: 'Investor step progress', previewData: { name: 'Jane', fundName: 'Example Fund', completedSteps: ['About You', 'Verification'] } } satisfies TemplateEntry