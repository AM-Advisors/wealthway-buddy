import { Outlet, createFileRoute, redirect, useNavigate } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";

import { supabase } from "@/integrations/supabase/client";
import { clearStoredClientContext } from "@/lib/client-context-storage";
import { PolicyGate } from "@/components/policy-gate";
import { AccountKycGate } from "@/components/account-kyc-gate";
import { SecurityGate } from "@/components/security-gate";
import { InvestorPortalFrame } from "@/components/investor-portal-frame";
import { logSecurityEvent } from "@/lib/account-security.functions";

/**
 * The investor portal: its own sign-in and its own shell. It never renders the
 * client or Operations menus, workspace switcher or staff directory - only the
 * signed-in person's own investments. Every screen is still authorized on the
 * server against the person's own investor records.
 */
export const Route = createFileRoute("/investor")({
  head: () => ({ meta: [{ name: "robots", content: "noindex, nofollow" }] }),
  ssr: false,
  beforeLoad: async ({ location }) => {
    const { data, error } = await supabase.auth.getUser();
    if (error || !data.user) {
      throw redirect({ to: "/investor-login", search: { next: location.pathname } as never });
    }
    return { user: data.user };
  },
  component: InvestorLayout,
});

function InvestorLayout() {
  const navigate = useNavigate();
  const qc = useQueryClient();

  async function signOut() {
    await logSecurityEvent({ data: { eventType: "sign_out", action: "Explicit sign-out requested" } }).catch(() => {});
    await qc.cancelQueries();
    qc.clear();
    clearStoredClientContext();
    await supabase.auth.signOut();
    navigate({ to: "/investor-login", replace: true });
  }

  return (
    <InvestorPortalFrame onSignOut={signOut}>
      <PolicyGate onSignOut={signOut}>
        <AccountKycGate onSignOut={signOut}>
          <SecurityGate onSignOut={signOut}>
            <Outlet />
          </SecurityGate>
        </AccountKycGate>
      </PolicyGate>
    </InvestorPortalFrame>
  );
}
