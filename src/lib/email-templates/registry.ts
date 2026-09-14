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
import { template as opsReviewRequest } from './ops-review-request'
import { template as opsReviewDecision } from './ops-review-decision'
import { template as clientAdminAlert } from './client-admin-alert'
import { template as clientInvitation } from './client-invitation'
import { template as clientWelcome } from './client-welcome'
import { template as invoiceIssued } from './invoice-issued'
import { template as invoiceReminder } from './invoice-reminder'
import { template as wireRequestApproved } from './wire-request-approved'




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
  'ops-review-request': opsReviewRequest,
  'ops-review-decision': opsReviewDecision,
  'client-admin-alert': clientAdminAlert,
  'client-invitation': clientInvitation,
  'client-welcome': clientWelcome,
  'invoice-issued': invoiceIssued,
  'invoice-reminder': invoiceReminder,
  'wire-request-approved': wireRequestApproved,

}
