import { Link } from "@tanstack/react-router";

import { Button } from "@/components/ui/button";
import { CTAS, CTA_DESTINATION, type CtaId } from "@/lib/marketing/site-config";

/**
 * Intent-specific call to action. Always opens the public contact form with
 * the CTA and intent attached for attribution — never account creation.
 */
export function CtaLink({
  cta,
  variant = "default",
  size,
  className,
  label,
  onClick,
}: {
  cta: CtaId;
  variant?: "default" | "outline" | "ghost" | "secondary";
  size?: "sm" | "default" | "lg";
  className?: string;
  label?: string;
  onClick?: () => void;
}) {
  const def = CTAS[cta];
  return (
    <Button asChild variant={variant} size={size} className={className}>
      <Link to={CTA_DESTINATION} search={{ cta, intent: def.intent }} onClick={onClick}>
        {label ?? def.label}
      </Link>
    </Button>
  );
}
