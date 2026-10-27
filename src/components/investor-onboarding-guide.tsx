import guideVideo from "@/assets/investor-onboarding-walkthrough-narrated.mp4.asset.json";

const steps = [
  ["About You", "Choose the person or entity investing, then review their details."],
  ["Verification", "Complete identity verification and provide applicable accreditation evidence."],
  ["Sign", "Review and sign the fund documents. Submitted accreditation may remain under review."],
  ["Fund", "Once required approvals are complete, use the released instructions to send funds through your own bank."],
] as const;

export function InvestorOnboardingGuide() {
  return <section className="w-full space-y-4" aria-label="Investor onboarding walkthrough">
    <video src={guideVideo.url} className="aspect-video w-full rounded-md bg-muted" preload="metadata" playsInline controls aria-label="Narrated walkthrough of investor onboarding" />
    <h2 className="font-heading text-lg font-semibold">Investor onboarding</h2>
    <p className="text-xs text-muted-foreground">1 minute 26 seconds · Narrated guide with illustrative screens</p>
    <ol className="space-y-3 text-sm text-muted-foreground">
      {steps.map(([title, description], index) => <li key={title} className="flex gap-3"><span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary text-xs font-semibold text-primary-foreground">{index + 1}</span><span><span className="font-medium text-foreground">{title}.</span> {description}</span></li>)}
    </ol>
  </section>;
}