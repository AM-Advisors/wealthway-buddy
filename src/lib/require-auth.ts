// Same runtime middleware as the generated requireSupabaseAuth, re-typed with a light context.
// The generated context carries the full Database client type into every server function,
// which made the whole-app typecheck too slow for the preview.
//
// requireSupabaseAuth additionally enforces the account identity check: non-staff accounts
// get 403 until their identity is verified (src/lib/account-kyc.server.ts).
// requireSupabaseAuthUnverified is only for the short allowlist a person needs before
// verification: policies, sign-in/session, invitations/claims, workspace shell, the check itself.
import { createMiddleware } from "@tanstack/react-start";
import type { JwtPayload, SupabaseClient } from "@supabase/supabase-js";
import { requireSupabaseAuth as generated } from "@/integrations/supabase/auth-middleware";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AuthContext = { supabase: SupabaseClient<any, "public", any>; userId: string; claims: JwtPayload };
const shape = () => createMiddleware({ type: "function" }).server(async ({ next }) => next({ context: {} as AuthContext }));

export const requireSupabaseAuthUnverified = generated as unknown as ReturnType<typeof shape>;

const verified = createMiddleware({ type: "function" })
  .middleware([generated])
  .server(async ({ next, context }) => {
    const uid = (context as unknown as AuthContext).userId;
    const { assertAccountVerified } = await import("@/lib/account-kyc.server");
    await assertAccountVerified(uid);
    return next();
  });

export const requireSupabaseAuth = verified as unknown as ReturnType<typeof shape>;
