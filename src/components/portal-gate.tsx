import type { ReactNode } from "react";

import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";

import { getPortalAccess } from "@/lib/portal-access.functions";
import { Button } from "@/components/ui/button";
import { Logo } from "@/components/Logo";

/**
 * Authentication says "who you are"; this says "you were invited".
 * Anyone signed in without fund access sees a hold screen instead of the portal.
 */
export function PortalGate({
  children,
  onSignOut,
}: {
  children: ReactNode;
  onSignOut: () => void | Promise<void>;
}) {
  const fetchAccess = useServerFn(getPortalAccess);
  const { data, isPending, isError } = useQuery({
    queryKey: ["portal-access"],
    queryFn: () => fetchAccess(),
    staleTime: 60_000,
    retry: 1,
  });

  if (isPending) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center text-sm text-muted-foreground">
        Checking your access…
      </div>
    );
  }

  if (isError || !data?.allowed) {
    return (
      <div className="flex min-h-[70vh] items-center justify-center px-4">
        <div className="w-full max-w-md text-center">
          <Logo variant="navy" className="mx-auto h-7 w-auto" />
          <h1 className="mt-8 text-2xl">This account isn't on the fund's list yet</h1>
          <p className="mt-3 text-sm text-muted-foreground">
            {data?.email ? (
              <>
                We could not find an invitation for{" "}
                <span className="text-foreground">{data.email}</span>. Access to the investor
                portal is granted by the fund team.
              </>
            ) : (
              <>Access to the investor portal is granted by the fund team.</>
            )}
          </p>
          <p className="mt-3 text-sm text-muted-foreground">
            If you were invited under a different email address, sign in with that address instead.
            Otherwise, reply to your fund contact and ask them to add you.
          </p>
          <Button className="mt-8 w-full" variant="outline" onClick={() => void onSignOut()}>
            Sign out
          </Button>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}
