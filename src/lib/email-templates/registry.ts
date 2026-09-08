import type { ComponentType } from 'react'
import { template as investorMessage } from './investor-message'
import { template as documentSigned } from './document-signed'
import { template as investorInvitation } from './investor-invitation'
import { template as deliveryAlert } from './delivery-alert'
import { template as fundInvitation } from './fund-invitation'



export interface TemplateEntry {
  component: ComponentType<any>
  subject: string | ((data: Record<string, any>) => string)
  displayName?: string
  previewData?: Record<string, any>
  /** Fixed recipient — overrides caller-provided recipientEmail when set. */
  to?: string
}

/**
 * Template registry — maps template names to their React Email components.
 * Import and register new templates here after creating them in this directory.
 *
 * Example:
 *   import { template as welcomeTemplate } from './welcome'
 *   // then add to TEMPLATES: 'welcome': welcomeTemplate
 */
export const TEMPLATES: Record<string, TemplateEntry> = {
  'investor-message': investorMessage,
  'document-signed': documentSigned,
  'investor-invitation': investorInvitation,
  'delivery-alert': deliveryAlert,
}
