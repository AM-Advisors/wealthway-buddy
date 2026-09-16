import { createFileRoute } from "@tanstack/react-router";
import { createHash } from "crypto";
import { z } from "zod";

/**
 * Invite-link claim submission for outside funds, SPVs and advisers.
 *
 * The caller proves themselves with a one-time token; nothing here is readable
 * or writable without a live, unexpired, unused link. No register data is ever
 * returned — only the company name so the claimant knows where they are.
 */

function hashToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

const submission = z.object({
  token: z.string().min(10).max(200),
  claimantType: z.string().trim().min(2).max(40),
  securityType: z.string().trim().min(2).max(40),
  claimedQuantity: z.number().positive().max(1_000_000_000),
  holdingRoute: z.string().trim().min(2).max(40),
  throughEntity: z.string().trim().max(160).nullable().optional(),
  asOfDate: z.string().trim().max(20).nullable().optional(),
  claimantNote: z.string().trim().max(4000).nullable().optional(),
  documentTitle: z.string().trim().max(200).nullable().optional(),
  documentReference: z.string().trim().max(500).nullable().optional(),
});

async function loadInvite(token: string) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data } = await supabaseAdmin
    .from("ct_claim_invites")
    .select("id, company_id, issuer_id, claimant_name, claimant_email, expires_at, used_at, revoked_at")
    .eq("token_hash", hashToken(token))
    .maybeSingle();
  if (!data) return { invite: null, reason: "This link is not valid." as const };
  if (data.revoked_at) return { invite: null, reason: "This link has been withdrawn by the company." as const };
  if (data.used_at) return { invite: null, reason: "This link has already been used." as const };
  if (new Date(data.expires_at).getTime() < Date.now()) {
    return { invite: null, reason: "This link has expired." as const };
  }
  return { invite: data, reason: null };
}

export const Route = createFileRoute("/api/public/cap-claim")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const token = new URL(request.url).searchParams.get("token") ?? "";
        if (token.length < 10) return Response.json({ ok: false, error: "This link is not valid." }, { status: 400 });
        const { invite, reason } = await loadInvite(token);
        if (!invite) return Response.json({ ok: false, error: reason }, { status: 404 });
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { data: company } = await supabaseAdmin
          .from("ct_companies")
          .select("name")
          .eq("id", invite.company_id)
          .maybeSingle();
        return Response.json({
          ok: true,
          companyName: company?.name ?? "the company",
          claimantName: invite.claimant_name,
        });
      },
      POST: async ({ request }) => {
        let body: unknown;
        try {
          body = await request.json();
        } catch {
          return Response.json({ ok: false, error: "We could not read that submission." }, { status: 400 });
        }
        const parsed = submission.safeParse(body);
        if (!parsed.success) {
          return Response.json({ ok: false, error: "Please check the details and try again." }, { status: 400 });
        }
        const input = parsed.data;
        const { invite, reason } = await loadInvite(input.token);
        if (!invite) return Response.json({ ok: false, error: reason }, { status: 404 });

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { data: claim, error } = await supabaseAdmin
          .from("ct_exposure_claims")
          .insert({
            company_id: invite.company_id,
            issuer_id: invite.issuer_id,
            invite_id: invite.id,
            claimant_name: invite.claimant_name,
            claimant_email: invite.claimant_email,
            claimant_type: input.claimantType,
            security_type: input.securityType,
            claimed_quantity: input.claimedQuantity,
            holding_route: input.holdingRoute,
            through_entity: input.throughEntity ?? null,
            as_of_date: input.asOfDate || null,
            claimant_note: input.claimantNote ?? null,
            status: "submitted",
          })
          .select("id")
          .single();
        if (error) {
          return Response.json({ ok: false, error: "We could not record that claim." }, { status: 500 });
        }

        if (input.documentTitle && input.documentReference) {
          await supabaseAdmin.from("ct_claim_documents").insert({
            claim_id: claim.id,
            company_id: invite.company_id,
            title: input.documentTitle,
            storage_path: input.documentReference,
          });
        }

        await supabaseAdmin
          .from("ct_claim_invites")
          .update({ used_at: new Date().toISOString() })
          .eq("id", invite.id);

        await supabaseAdmin.from("ct_events").insert({
          company_id: invite.company_id,
          actor_id: null,
          action: "exposure_claim_submitted",
          entity_type: "exposure_claim",
          entity_id: claim.id,
          new_state: {
            claimant: invite.claimant_name,
            quantity: input.claimedQuantity,
            route: input.holdingRoute,
            source: "invite link",
          } as any,
        });

        return Response.json({ ok: true });
      },
    },
  },
});
