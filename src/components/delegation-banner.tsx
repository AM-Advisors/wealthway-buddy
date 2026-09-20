import { Link } from "@tanstack/react-router";

import { delegationBanner } from "@/lib/client-navigation";

/**
 * Shown the whole time someone is acting for a client, so it is never unclear
 * whose records are on screen.
 */
export function DelegationBanner({
  principalName,
  organizationName,
}: {
  principalName: string;
  organizationName?: string | null;
}) {
  const banner = delegationBanner({ principalName, organizationName });
  return (
    <div className="flex flex-wrap items-center justify-between gap-2 border-b bg-accent/40 px-4 py-2 text-sm">
      <div>
        <span className="font-medium">{banner.acting}</span>
        {banner.through && <span className="ml-2 text-muted-foreground">{banner.through}</span>}
      </div>
      <Link to={banner.exitUrl as never} className="text-sm font-medium underline">
        {banner.exitLabel}
      </Link>
    </div>
  );
}
