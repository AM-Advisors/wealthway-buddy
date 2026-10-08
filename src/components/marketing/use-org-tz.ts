import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { getOrgTimezone } from "@/lib/org-timezone.functions";

/** Organization editorial/publishing time zone (stored UTC, displayed here). */
export function useOrgTz(): string {
  const load = useServerFn(getOrgTimezone);
  const q = useQuery({ queryKey: ["org-tz"], queryFn: () => load(), staleTime: 10 * 60_000 });
  return q.data?.timezone ?? "America/Chicago";
}
