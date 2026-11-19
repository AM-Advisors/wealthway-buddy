import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";

import { myServiceMenuFn } from "@/lib/service-menu.functions";
import type { ServiceMenu } from "@/lib/service-menu";

/** Which optional services (Wealth, Report Cards) the signed-in person has. Null while unknown. */
export function useServiceMenu(enabled = true): ServiceMenu | null {
  const fn = useServerFn(myServiceMenuFn);
  const q = useQuery({ queryKey: ["my-service-menu"], queryFn: () => fn(), staleTime: 60_000, enabled });
  return q.data ?? null;
}
