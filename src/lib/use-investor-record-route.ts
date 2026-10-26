import { useRouterState } from "@tanstack/react-router";

/** Investor record route for the current address: staff on Operations stay on Operations, so they keep their sign-in. */
export function useInvestorRecordRoute() {
  const onOps = useRouterState({ select: (s) => s.location.pathname.startsWith("/ops") });
  return onOps ? ("/ops/fund/$fundId/investor/$onboardingId" as const) : ("/manager/fund/$fundId/investor/$onboardingId" as const);
}
