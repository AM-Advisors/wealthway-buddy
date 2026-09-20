import { resolveSession } from "@/lib/session.functions";
import { safeInternalPath } from "@/lib/app-origins";

/**
 * Where a person belongs right after signing in.
 *
 * The answer comes from the server resolver, which reads the authoritative
 * relationship records. The browser asks; it never decides. If the resolver
 * cannot be reached we send people to their own dashboard rather than
 * guessing at anything privileged.
 */
export async function destinationAfterSignIn(
  _userId: string,
  intended?: string | null,
): Promise<string> {
  try {
    const result: any = await resolveSession({
      data: { intended: intended ? safeInternalPath(intended, "") : null },
    });
    return safeInternalPath(result?.destination, "/dashboard");
  } catch {
    return "/dashboard";
  }
}

/** Reads a "where I was heading" path from the current URL, safely. */
export function intendedPathFromLocation(search: string): string | null {
  try {
    const params = new URLSearchParams(search);
    const next = params.get("next") ?? params.get("redirect");
    if (!next) return null;
    const safe = safeInternalPath(next, "");
    return safe || null;
  } catch {
    return null;
  }
}
