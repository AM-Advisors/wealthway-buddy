export interface OnboardingStepDef {
  key: string
  /** Short label used in pickers. */
  label: string
  /** Title shown in the email step list (without numbering). */
  title: string
  detail: string
  /** Path appended to the portal origin for this step's call to action. */
  path: string
  ctaLabel: string
  /** Lead paragraph shown when this is the investor's current step. */
  lead: string
}

export const ONBOARDING_STEPS: OnboardingStepDef[] = [
  {
    key: 'identity',
    label: 'Identity verification',
    title: 'Identity verification',
    detail: 'A short, guided ID check — a photo of your ID and a selfie.',
    path: '/onboarding/identity',
    ctaLabel: 'Verify your identity',
    lead: 'Your next step is a short identity check. It takes a couple of minutes on your phone.',
  },
  {
    key: 'aml',
    label: 'AML screening',
    title: 'AML screening',
    detail: 'We run standard sanctions and watchlist screening in the background.',
    path: '/dashboard',
    ctaLabel: 'View your status',
    lead: 'Your identity check is done. Standard sanctions and watchlist screening is running now — no action is needed from you.',
  },
  {
    key: 'accreditation',
    label: 'Accreditation',
    title: 'Accreditation',
    detail: 'Confirm your Reg D qualification and upload supporting evidence if required.',
    path: '/onboarding/accreditation',
    ctaLabel: 'Confirm accreditation',
    lead: 'Next, confirm your Reg D qualification and upload any supporting evidence.',
  },
  {
    key: 'documents',
    label: 'Fund documents',
    title: 'Fund documents',
    detail: 'Review and electronically sign the subscription agreement and PPM.',
    path: '/documents',
    ctaLabel: 'Review and sign documents',
    lead: 'Your fund documents are ready to review and sign electronically.',
  },
  {
    key: 'funding',
    label: 'Funding',
    title: 'Funding',
    detail: 'Choose wire or ACH — your instructions and reference code appear in the portal.',
    path: '/onboarding/funding',
    ctaLabel: 'Fund your investment',
    lead: 'Everything is signed. The last step is funding — choose wire or ACH and your instructions appear in the portal.',
  },
  {
    key: 'complete',
    label: 'Complete',
    title: 'Complete',
    detail: 'Your subscription is on file and your dashboard shows live status.',
    path: '/dashboard',
    ctaLabel: 'View your dashboard',
    lead: 'Your onboarding is complete. Your dashboard shows your documents, funding status and confirmations.',
  },
]

export const DEFAULT_PORTAL_ORIGIN = 'https://onboard.harmonious.co'

export function findStep(key?: string | null): OnboardingStepDef | undefined {
  if (!key) return undefined
  const normalized = String(key).toLowerCase().trim()
  return (
    ONBOARDING_STEPS.find((s) => s.key === normalized) ??
    ONBOARDING_STEPS.find((s) => normalized.includes(s.key))
  )
}

/** Maps an investor_applications.current_step value onto a template step key. */
export function stepKeyFromApplication(currentStep?: string | null): string {
  const direct = findStep(currentStep)
  if (direct) return direct.key
  const value = String(currentStep ?? '').toLowerCase()
  if (value.includes('kyc') || value.includes('ident')) return 'identity'
  if (value.includes('screen') || value.includes('aml')) return 'aml'
  if (value.includes('accred')) return 'accreditation'
  if (value.includes('doc') || value.includes('sign')) return 'documents'
  if (value.includes('fund') || value.includes('wire') || value.includes('ach')) return 'funding'
  if (value.includes('complete') || value.includes('done') || value.includes('submitted'))
    return 'complete'
  return 'identity'
}
