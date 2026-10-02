// Same runtime middleware as the generated requireSupabaseAuth, re-typed with a light context.
// The generated context carries the full Database client type into every server function,
// which made the whole-app typecheck too slow for the preview. Runtime behavior is identical.
import { createMiddleware } from "@tanstack/react-start";
import type { SupabaseClient } from "@supabase/supabase-js";
import { requireSupabaseAuth as generated } from "@/integrations/supabase/auth-middleware";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AuthContext = { supabase: SupabaseClient<any, "public", any>; userId: string; claims: Record<string, any> };
const shape = () => createMiddleware({ type: "function" }).server(async ({ next }) => next({ context: {} as AuthContext }));

export const requireSupabaseAuth = generated as unknown as ReturnType<typeof shape>;
