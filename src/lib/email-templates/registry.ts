import type { ComponentType } from 'react'
import { template as investorMessage } from './investor-message'
import { template as documentSigned } from './document-signed'
import { template as investorInvitation } from './investor-invitation'
import { template as deliveryAlert } from './delivery-alert'
import { template as fundInvitation } from './fund-invitation'
import { template as managerAlert } from './manager-alert'
import { template as investorWelcome } from './investor-welcome'
import { template as ownershipUpdate } from './ownership-update'
import { template as bankSetupRequest } from './bank-setup-request'




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
  'fund-invitation': fundInvitation,
  'manager-alert': managerAlert,
  'investor-welcome': investorWelcome,
  'bank-setup-request': bankSetupRequest,

}
