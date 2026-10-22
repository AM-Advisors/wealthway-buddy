import { Body, Button, Container, Head, Heading, Html, Preview, Text } from '@react-email/components'
import type { TemplateEntry } from './registry'

interface Props { contactName?: string; fundName?: string; levelName?: string; managerName?: string; managerEmail?: string; setupUrl?: string }

const UpgradeAccountManager = ({ contactName, fundName = 'your fund', levelName = 'a paid', managerName, managerEmail, setupUrl = 'https://app.harmonious.co/client/funds' }: Props) => (
  <Html lang="en" dir="ltr">
    <Head />
    <Preview>Meet your Harmonious account manager</Preview>
    <Body style={main}>
      <Container style={container}>
        <Heading style={h1}>Meet your account manager</Heading>
        <Text style={text}>{contactName ? `Hi ${contactName},` : 'Hi there,'}</Text>
        <Text style={text}>{fundName} is now on the {levelName} service level.</Text>
        <Text style={text}>{managerName ? `${managerName} is your account manager and your main contact at Harmonious${managerEmail ? ` (${managerEmail})` : ''}.` : 'Your Harmonious account manager will introduce themselves shortly.'} They'll help you finish setup and onboard your investors. You can also message your Sales team and representative from your Inbox.</Text>
        <Text style={text}>Next steps:<br />1. Finish the fund setup steps.<br />2. Our team reviews your setup and banking.<br />3. Invite investors. They complete About You, Verification, Sign and Fund.</Text>
        <Button href={setupUrl} style={button}>Open your fund</Button>
      </Container>
    </Body>
  </Html>
)

export const template = {
  component: UpgradeAccountManager,
  subject: (d: Record<string, any>) => `Meet your account manager for ${d['fundName'] ?? 'your fund'}`,
  displayName: 'Upgrade: account manager introduction',
  previewData: { contactName: 'Jane', fundName: 'Roas Hedge LP', levelName: 'Plus', managerName: 'Alex Rivera', managerEmail: 'alex@harmonious.co', setupUrl: 'https://app.harmonious.co/client/funds' },
} satisfies TemplateEntry

const main = { backgroundColor: '#ffffff', fontFamily: 'Poppins, Arial, sans-serif' }
const container = { padding: '24px 28px', maxWidth: '560px' }
const h1 = { color: '#142647', fontSize: '22px', margin: '0 0 16px' }
const text = { color: '#221F20', fontSize: '15px', lineHeight: '24px', margin: '0 0 14px' }
const button = { backgroundColor: '#142647', color: '#ffffff', borderRadius: '6px', padding: '12px 20px', fontSize: '14px', textDecoration: 'none' }
