import { supabase } from "@/integrations/supabase/client";

/** Where a person belongs right after signing in. */
export async function destinationAfterSignIn(userId: string): Promise<string> {
  try {
    const { data: roles } = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", userId);
    const list = (roles ?? []).map((r: any) => r.role as string);
    if (list.includes("admin")) return "/admin";
    if (list.includes("fund_manager")) return "/manager";
  } catch {
    /* fall through to the investor paths */
  }

  try {
    const { data } = await supabase
      .from("investor_applications")
      .select("id")
      .eq("user_id", userId)
      .limit(1);
    if (data && data.length > 0) return "/dashboard";
  } catch {
    /* fall through */
  }
  return "/onboarding/kyc";
}

/**
 * Where a reviewer belongs after using the fund manager sign-in.
 * Returns null when the account is neither a fund manager nor an admin.
 */
export async function managerDestination(userId: string): Promise<string | null> {
  const { data } = await supabase.from("user_roles").select("role").eq("user_id", userId);
  const list = (data ?? []).map((r: any) => r.role as string);
  if (list.includes("fund_manager")) return "/manager";
  if (list.includes("admin")) return "/admin";
  return null;
}
