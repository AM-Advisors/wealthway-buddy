import type { ComponentType } from 'react'
import { template as salesResponse } from './sales-response'
import { template as investmentApproval } from './investment-approval'
import { template as investorProgress } from './investor-progress'
import { template as investorMessage } from './investor-message'
import { template as documentSigned } from './document-signed'
import { template as investorInvitation } from './investor-invitation'
import { template as deliveryAlert } from './delivery-alert'
import { template as fundInvitation } from './fund-invitation'
import { template as sowReady } from './sow-ready'
import { template as commissionScheduled } from './commission-scheduled'
import { template as paymentDueRep } from './payment-due-rep'
import { template as selfServeWelcome } from './self-serve-welcome'
import { template as upgradeAccountManager } from './upgrade-account-manager'
import { template as managerAlert } from './manager-alert'
import { template as signingReminder } from './signing-reminder'
import { template as investorWelcome } from './investor-welcome'
import { template as ownershipUpdate } from './ownership-update'
import { template as bankSetupRequest } from './bank-setup-request'
import { template as opsReviewRequest } from './ops-review-request'
import { template as opsReviewDecision } from './ops-review-decision'
import { template as clientAdminAlert } from './client-admin-alert'
import { template as clientInvitation } from './client-invitation'
import { template as clientWelcome } from './client-welcome'
import { template as fundOnboardingWelcome } from './fund-onboarding-welcome'
import { template as invoiceIssued } from './invoice-issued'
import { template as invoiceReminder } from './invoice-reminder'
import { template as wireRequestApproved } from './wire-request-approved'
import { template as shareholderInvitation } from './shareholder-invitation'
import { template as investmentOnboarding } from './investment-onboarding'
import { template as documentsSent } from './documents-sent'
import { template as statementReady } from './statement-ready'
import { template as crmCampaign } from './crm-campaign'
import { template as paymentReceived } from './payment-received'
import { template as securityAlert } from './security-alert'
import { template as saleSigned } from './sale-signed'
import { template as identityReviewDecided } from './identity-review-decided'




export interface TemplateEntry {
  component: ComponentType<any>
  subject: string | ((data: Record<string, any>) => string)
  displayName?: string
  previewData?: Record<string, any>
  /** Fixed recipient - overrides caller-provided recipientEmail when set. */
  to?: string
}

/**
 * Template registry, maps template names to their React Email components.
 * Import and register new templates here after creating them in this directory.
 *
 * Example:
 *   import { template as welcomeTemplate } from './welcome'
 *   // then add to TEMPLATES: 'welcome': welcomeTemplate
 */
export const TEMPLATES: Record<string, TemplateEntry> = {
  'sales-response': salesResponse,
  'investment-approval': investmentApproval,
  'investor-progress': investorProgress,
  'investor-message': investorMessage,
  'document-signed': documentSigned,
  'investor-invitation': investorInvitation,
  'delivery-alert': deliveryAlert,
  'fund-invitation': fundInvitation,
  'sow-ready': sowReady,
  'commission-scheduled': commissionScheduled,
  'payment-due-rep': paymentDueRep,
  'self-serve-welcome': selfServeWelcome,
  'upgrade-account-manager': upgradeAccountManager,
  'manager-alert': managerAlert,
  'signing-reminder': signingReminder,
  'investor-welcome': investorWelcome,
  'bank-setup-request': bankSetupRequest,
  'ops-review-request': opsReviewRequest,
  'ops-review-decision': opsReviewDecision,
  'identity-review-decided': identityReviewDecided,
  'client-admin-alert': clientAdminAlert,
  'client-invitation': clientInvitation,
  'client-welcome': clientWelcome,
  'fund-onboarding-welcome': fundOnboardingWelcome,
  'invoice-issued': invoiceIssued,
  'invoice-reminder': invoiceReminder,
  'wire-request-approved': wireRequestApproved,
  'shareholder-invitation': shareholderInvitation,
  'investment-onboarding': investmentOnboarding,
  'documents-sent': documentsSent,
  'statement-ready': statementReady,
  'crm-campaign': crmCampaign,
  'payment-received': paymentReceived,
  'security-alert': securityAlert,
  'sale-signed': saleSigned,
  'ownership-update': ownershipUpdate,


}
