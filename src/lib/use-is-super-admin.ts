import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

/** Display only: shows self-approve buttons to Super Admins. The server re-checks every approval. */
export function useIsSuperAdmin(): boolean {
  const { data } = useQuery({
    queryKey: ["is-super-admin"],
    staleTime: 5 * 60 * 1000,
    queryFn: async () => {
      const { data: u } = await supabase.auth.getUser();
      if (!u.user) return false;
      const { data: r } = await supabase.from("user_roles").select("role").eq("user_id", u.user.id).eq("role", "super_admin").maybeSingle();
      return !!r;
    },
  });
  return !!data;
}
