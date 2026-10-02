import * as React from 'react'
import { render } from '@react-email/render'
import { TEMPLATES } from './registry'

// Server-only: reads LOVABLE_API_KEY and BREVO_API_KEY. Never import from client components.

const BREVO_GATEWAY_URL = 'https://connector-gateway.lovable.dev/brevo'

// Configuration baked in at scaffold time
const SITE_NAME = "Harmonious"
// FROM_DOMAIN is the domain shown in the From: header. It must be a sender
// domain verified in the Brevo account, or sends will be rejected.
const FROM_DOMAIN = "onboarding.harmonious.co"

export type SendTemplateEmailResult =
  | { sent: true }
  | { sent: false; reason: 'recipient_suppressed' }

export interface SendTemplateEmailOptions {
  templateData?: Record<string, any>
  /** Dedupes retries of the same logical send; defaults to a random UUID (no dedupe). */
  idempotencyKey?: string
  replyTo?: string
}

/**
 * Renders a registered template and sends it through Brevo (via the
 * connector gateway). Any failure throws with the provider's status and
 * message so callers can branch on it.
 */
export async function sendTemplateEmail(
  templateName: string,
  to: string,
  options: SendTemplateEmailOptions = {}
): Promise<SendTemplateEmailResult> {
  const apiKey = process.env['LOVABLE_API_KEY']
  if (!apiKey) {
    throw new Error('LOVABLE_API_KEY is not configured')
  }
  const brevoKey = process.env['BREVO_API_KEY']
  if (!brevoKey) {
    throw new Error('BREVO_API_KEY is not configured')
  }

  const template = TEMPLATES[templateName]
  if (!template) {
    throw new Error(
      `Template '${templateName}' not found. Available: ${Object.keys(TEMPLATES).join(', ')}`
    )
  }

  // Template-level `to` takes precedence - notification templates always
  // send to their fixed address.
  const recipient = template.to || to
  if (!recipient) {
    throw new Error('Recipient is required (the template defines no fixed recipient)')
  }

  const templateData = options.templateData ?? {}
  const element = React.createElement(template.component, templateData)
  const html = await render(element)
  const text = await render(element, { plainText: true })
  const subject =
    typeof template.subject === 'function'
      ? template.subject(templateData)
      : template.subject

  const response = await fetch(`${BREVO_GATEWAY_URL}/smtp/email`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
      'X-Connection-Api-Key': brevoKey,
    },
    body: JSON.stringify({
      sender: { name: SITE_NAME, email: `noreply@${FROM_DOMAIN}` },
      to: [{ email: recipient }],
      subject,
      htmlContent: html,
      textContent: text,
      tags: [templateName],
      ...(options.replyTo ? { replyTo: { email: options.replyTo } } : {}),
      headers: { 'X-Idempotency-Key': options.idempotencyKey || crypto.randomUUID() },
    }),
  })

  if (!response.ok) {
    const errorBody = await response.text()
    console.error(`[send-email] Brevo send failed [${response.status}]: ${errorBody}`)
    throw new Error(`Brevo send failed [${response.status}]: ${errorBody}`)
  }

  // Mirror the email into the recipient's portal inbox when they are a client
  // contact. Best-effort only - the email has already gone out.
  try {
    const { recordClientInboxCopy } = await import('@/lib/client-inbox.server')
    await recordClientInboxCopy({
      recipientEmail: recipient,
      template: templateName,
      subject,
      html,
      text,
      dedupeKey: options.idempotencyKey,
    })
  } catch (error) {
    console.error('[send-email] inbox copy failed', templateName, error)
  }

  return { sent: true }
}
