import { createEmailWebhookHandler } from '@lovable.dev/email-js'
import { createFileRoute } from '@tanstack/react-router'

type DeliveryEvent = {
  event_id: string
  data: { event?: string; recipient: string; message_id?: string }
}

const DETAIL: Record<string, string> = {
  bounced: 'The mailbox rejected this message (bounce). Future sends to this address are blocked.',
  complained: 'The recipient marked this message as spam. Future sends to this address are blocked.',
  unsubscribed: 'The recipient unsubscribed. Future sends to this address are blocked.',
}

async function recordDeliveryEvent(eventType: string, event: DeliveryEvent) {
  const { supabaseAdmin } = await import('@/integrations/supabase/client.server')
  const recipient = event.data.recipient

  // Attach the event to the most recent onboarding email sent to this address.
  const { data: emailRow } = await supabaseAdmin
    .from('investor_emails')
    .select('id')
    .eq('to_email', recipient)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  const { error } = await supabaseAdmin.from('email_delivery_events').upsert(
    {
      event_id: event.event_id,
      event_type: eventType,
      recipient,
      message_id: event.data.message_id ?? null,
      investor_email_id: emailRow?.id ?? null,
      payload: JSON.parse(JSON.stringify(event.data)),
    },
    { onConflict: 'event_id', ignoreDuplicates: true },
  )
  if (error) throw new Error(error.message)

  if (emailRow?.id) {
    const { error: updateError } = await supabaseAdmin
      .from('investor_emails')
      .update({
        delivery_event: eventType,
        delivery_event_at: new Date().toISOString(),
        delivery_detail: DETAIL[eventType] ?? null,
      })
      .eq('id', emailRow.id)
    if (updateError) throw new Error(updateError.message)
  }
}

export const Route = createFileRoute('/lovable/email/events')({
  server: {
    handlers: {
      POST: ({ request }) => {
        const apiKey = process.env['LOVABLE_API_KEY']
        if (!apiKey) {
          console.error('Missing required environment variables')
          return Response.json({ error: 'Server configuration error' }, { status: 500 })
        }
        const handler = createEmailWebhookHandler({
          apiKey,
          on: {
            'email.bounced': async (event) => {
              await recordDeliveryEvent('bounced', event as unknown as DeliveryEvent)
            },
            'email.complaint': async (event) => {
              await recordDeliveryEvent('complained', event as unknown as DeliveryEvent)
            },
            'email.unsubscribed': async (event) => {
              await recordDeliveryEvent('unsubscribed', event as unknown as DeliveryEvent)
            },
          },
        })
        return handler(request)
      },
    },
  },
})
