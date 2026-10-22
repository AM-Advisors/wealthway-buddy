import { Body, Button, Container, Head, Heading, Html, Preview, Text } from '@react-email/components';
import type { TemplateEntry } from './registry';
function SalesResponse({ title = 'your document', contactName, message, instructions, url }: { title?: string; contactName?: string; message?: string; instructions?: string; url?: string }) {
  return <Html lang="en"><Head /><Preview>Harmonious responded about {title}</Preview><Body style={{ backgroundColor: '#ffffff', fontFamily: 'Poppins, Arial, sans-serif' }}>
    <Container style={{ padding: '24px 28px', maxWidth: '560px', color: '#221F20' }}>
      <Heading style={{ color: '#142647', fontFamily: 'Rubik, Arial, sans-serif', fontSize: '22px' }}>Response about {title}</Heading>
      <Text>{contactName ? `Hi ${contactName},` : 'Hi there,'}</Text><Text style={{ whiteSpace: 'pre-wrap' }}>{message}</Text>
      {instructions && <><Heading as="h2" style={{ color: '#142647', fontSize: '16px' }}>Response instructions</Heading><Text style={{ whiteSpace: 'pre-wrap' }}>{instructions}</Text></>}
      <Button href={url} style={{ backgroundColor: '#142647', color: '#ffffff', padding: '12px 20px', borderRadius: '6px' }}>Review document</Button>
    </Container></Body></Html>;
}
export const template = { component: SalesResponse, subject: (d: Record<string, any>) => `Harmonious response: ${d['title'] ?? 'your document'}`, displayName: 'Sales document response' } satisfies TemplateEntry;