import { useEffect, type ReactNode } from "react";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";

import { getPortalAccess } from "@/lib/portal-access.functions";
import { Button } from "@/components/ui/button";
import { Logo } from "@/components/Logo";
import { ProfileStep } from "@/components/profile-step";

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
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { data, isPending, isError, refetch, isFetching } = useQuery({
    queryKey: ["portal-access"],
    queryFn: () => fetchAccess(),
    staleTime: (q) => (q.state.data?.allowed ? 60_000 : 0),
    retry: 1,
  });

  // An investment was just connected to this account: open it once.
  // Clear the one-time hint from the cache first so returning to the portal doesn't redirect again.
  useEffect(() => {
    const id = data?.openOnboardingId;
    if (!id) return;
    queryClient.setQueryData(["portal-access"], (prev: typeof data) => (prev ? { ...prev, openOnboardingId: null } : prev));
    void navigate({ to: "/onboard/i/$onboardingId", params: { onboardingId: id }, replace: true });
  }, [data?.openOnboardingId, navigate, queryClient]);

  if (isPending) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center text-sm text-muted-foreground">
        Checking your access…
      </div>
    );
  }

  if (isError) {
    return (
      <div className="flex min-h-[70vh] items-center justify-center px-4">
        <div className="w-full max-w-md text-center">
          <Logo variant="navy" className="mx-auto h-7 w-auto" />
          <h1 className="mt-8 text-2xl">We couldn't check your access</h1>
          <p className="mt-3 text-sm text-muted-foreground">Something went wrong on our side. Please try again.</p>
          <Button className="mt-8 w-full" disabled={isFetching} onClick={() => void refetch()}>{isFetching ? "Checking…" : "Try again"}</Button>
        </div>
      </div>
    );
  }

  if (!data?.allowed) {
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
            Otherwise, reply to your fund contact and ask them to add you. If you've just received an invitation, press Check again.
          </p>
          <Button className="mt-8 w-full" disabled={isFetching} onClick={() => void refetch()}>
            {isFetching ? "Checking…" : "Check again"}
          </Button>
          <Button className="mt-3 w-full" variant="outline" onClick={() => void onSignOut()}>
            Sign out
          </Button>
        </div>
      </div>
    );
  }

  return <ProfileStep>{children}</ProfileStep>;
}
