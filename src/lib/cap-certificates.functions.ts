/** Share certificates and shareholder access for the founder cap table.
 *  Certificates are generated automatically for every share record, signed by
 *  a company signatory before issue, and may carry an uploaded signed copy.
 *  Shareholders reach their own records either with a portal login or with a
 *  private link that can expire and be revoked. */

import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const APPROVER_ROLES = ["client_gp", "client_signatory", "client_legal", "client_finance"];

type Who = { clientId: string; role: string; canEdit: boolean; canSign: boolean };

async function who(context: any, clientId: string): Promise<Who> {
  const { data } = await context.supabase
    .from("client_users")
    .select("client_id, client_role")
    .eq("user_id", context.userId)
    .eq("client_id", clientId)
    .maybeSingle();
  if (!data) throw new Error("You do not have access to this cap table.");
  const role = String((data as any).client_role ?? "");
  return {
    clientId,
    role,
    canEdit: role !== "client_readonly",
    canSign: APPROVER_ROLES.includes(role),
  };
}

async function audit(context: any, entry: Record<string, any>) {
  try {
    await context.supabase.from("contract_audit_events").insert({
      client_id: entry.clientId,
      actor_id: context.userId,
      actor_role: "client",
      area: "cap table",
      action: entry.action,
      target: entry.target ?? null,
      new_value: entry.next ?? null,
      source: "web",
    });
  } catch {
    /* an audit write must never block the action itself */
  }
}

/* ------------------------------------------------------------ certificates */

export const listCertificates = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ clientId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const me = await who(context, data.clientId);
    const [{ data: certificates }, { data: accessRows }] = await Promise.all([
      context.supabase
        .from("cap_certificates")
        .select("*")
        .eq("client_id", data.clientId)
        .order("created_at", { ascending: false }),
      context.supabase
        .from("cap_holder_access")
        .select("*")
        .eq("client_id", data.clientId)
        .order("created_at", { ascending: false }),
    ]);
    return {
      canEdit: me.canEdit,
      canSign: me.canSign,
      certificates: (certificates ?? []) as any[],
      access: (accessRows ?? []) as any[],
    };
  });

/** Creates the certificate for a share record that does not have one yet. */
export const generateCertificate = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ clientId: z.string().uuid(), holdingId: z.string().uuid() }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const me = await who(context, data.clientId);
    if (!me.canEdit) throw new Error("You do not have permission to change this cap table.");

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: holding } = await supabaseAdmin
      .from("cap_holdings")
      .select("id, client_id")
      .eq("id", data.holdingId)
      .eq("client_id", data.clientId)
      .maybeSingle();
    if (!holding) throw new Error("That share record no longer exists.");

    const { data: live } = await supabaseAdmin
      .from("cap_certificates")
      .select("id")
      .eq("holding_id", data.holdingId)
      .in("status", ["draft", "issued"])
      .maybeSingle();
    if (live) throw new Error("This share record already has a live certificate.");

    const { createDraftCertificate } = await import("@/lib/cap-certificates.server");
    const created = await createDraftCertificate(supabaseAdmin, {
      holdingId: data.holdingId,
      createdBy: context.userId,
    });
    await audit(context, {
      clientId: data.clientId,
      action: "certificate_created",
      target: created.certificate_no,
    });
    return created;
  });

/** A company signatory signs the certificate, which issues it. */
export const signCertificate = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        clientId: z.string().uuid(),
        id: z.string().uuid(),
        signerName: z.string().min(2).max(200),
        signerTitle: z.string().max(200).optional().nullable(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const me = await who(context, data.clientId);
    if (!me.canSign) {
      throw new Error(
        "Signing a certificate needs signing, GP, legal or finance authority on this account.",
      );
    }
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: cert } = await supabaseAdmin
      .from("cap_certificates")
      .select("id, status, certificate_no")
      .eq("id", data.id)
      .eq("client_id", data.clientId)
      .maybeSingle();
    if (!cert) throw new Error("That certificate no longer exists.");
    if ((cert as any).status !== "draft") throw new Error("That certificate is already signed.");

    const { error } = await supabaseAdmin
      .from("cap_certificates")
      .update({
        status: "issued",
        signer_name: data.signerName.trim(),
        signer_title: data.signerTitle?.trim() || null,
        signed_at: new Date().toISOString(),
        signed_by: context.userId,
      })
      .eq("id", data.id);
    if (error) throw new Error(error.message);

    await audit(context, {
      clientId: data.clientId,
      action: "certificate_issued",
      target: String((cert as any).certificate_no),
      next: { signer: data.signerName.trim(), title: data.signerTitle ?? null },
    });
    return { ok: true };
  });

/** Records a signed copy the company uploaded into private storage. */
export const attachCertificateFile = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        clientId: z.string().uuid(),
        id: z.string().uuid(),
        path: z.string().min(3).max(500),
        fileName: z.string().min(1).max(200),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const me = await who(context, data.clientId);
    if (!me.canEdit) throw new Error("You do not have permission to change this cap table.");
    if (!data.path.startsWith(`${data.clientId}/`)) throw new Error("That file path is not yours.");

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin
      .from("cap_certificates")
      .update({
        file_path: data.path,
        file_name: data.fileName,
        uploaded_at: new Date().toISOString(),
      })
      .eq("id", data.id)
      .eq("client_id", data.clientId);
    if (error) throw new Error(error.message);
    await audit(context, {
      clientId: data.clientId,
      action: "certificate_file_uploaded",
      target: data.id,
      next: { file: data.fileName },
    });
    return { ok: true };
  });

export const certificateFileUrl = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ clientId: z.string().uuid(), id: z.string().uuid() }).parse(d),
  )
  .handler(async ({ data, context }) => {
    await who(context, data.clientId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: cert } = await supabaseAdmin
      .from("cap_certificates")
      .select("file_path")
      .eq("id", data.id)
      .eq("client_id", data.clientId)
      .maybeSingle();
    const path = (cert as any)?.file_path;
    if (!path) throw new Error("No signed copy has been uploaded for this certificate.");
    const { data: signed, error } = await supabaseAdmin.storage
      .from("cap-certificates")
      .createSignedUrl(path, 300);
    if (error) throw new Error(error.message);
    return { url: signed?.signedUrl ?? null };
  });

export const cancelCertificate = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        clientId: z.string().uuid(),
        id: z.string().uuid(),
        reason: z.string().min(3).max(500),
        reissue: z.boolean().optional(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const me = await who(context, data.clientId);
    if (!me.canSign) {
      throw new Error("Cancelling a certificate needs signing authority on this account.");
    }
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: cert } = await supabaseAdmin
      .from("cap_certificates")
      .select("id, status, holding_id, certificate_no")
      .eq("id", data.id)
      .eq("client_id", data.clientId)
      .maybeSingle();
    if (!cert) throw new Error("That certificate no longer exists.");
    if (!["draft", "issued"].includes(String((cert as any).status))) {
      throw new Error("That certificate is no longer live.");
    }

    await supabaseAdmin
      .from("cap_certificates")
      .update({
        status: data.reissue ? "replaced" : "cancelled",
        cancelled_at: new Date().toISOString(),
        cancelled_reason: data.reason.trim(),
      })
      .eq("id", data.id);

    let replacement: { id: string; certificate_no: string } | null = null;
    if (data.reissue) {
      const { createDraftCertificate } = await import("@/lib/cap-certificates.server");
      await supabaseAdmin
        .from("cap_holdings")
        .update({ certificate_no: null })
        .eq("id", (cert as any).holding_id);
      replacement = await createDraftCertificate(supabaseAdmin, {
        holdingId: String((cert as any).holding_id),
        createdBy: context.userId,
      });
      await supabaseAdmin
        .from("cap_certificates")
        .update({ replaced_by: replacement.id })
        .eq("id", data.id);
    }

    await audit(context, {
      clientId: data.clientId,
      action: data.reissue ? "certificate_replaced" : "certificate_cancelled",
      target: String((cert as any).certificate_no),
      next: { reason: data.reason.trim(), replacement: replacement?.certificate_no ?? null },
    });
    return { ok: true, replacement };
  });

/* ------------------------------------------------------- shareholder access */

export const inviteShareholder = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        clientId: z.string().uuid(),
        stakeholderId: z.string().uuid(),
        email: z.string().email(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const me = await who(context, data.clientId);
    if (!me.canEdit) throw new Error("You do not have permission to change this cap table.");

    const email = data.email.trim().toLowerCase();
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: holder } = await supabaseAdmin
      .from("cap_stakeholders")
      .select("id, name")
      .eq("id", data.stakeholderId)
      .eq("client_id", data.clientId)
      .maybeSingle();
    if (!holder) throw new Error("That shareholder no longer exists.");

    const { ensureAccount, setPasswordLink, PORTAL_ORIGIN } = await import(
      "@/lib/account-invite.server"
    );
    const { targetUserId } = await ensureAccount(
      supabaseAdmin,
      email,
      String((holder as any).name ?? ""),
    );
    const passwordUrl = await setPasswordLink(supabaseAdmin, email);

    const { data: company } = await supabaseAdmin
      .from("clients")
      .select("name, legal_name")
      .eq("id", data.clientId)
      .maybeSingle();
    const companyName =
      (company as any)?.legal_name || (company as any)?.name || "the company";

    const { error } = await supabaseAdmin.from("cap_holder_access").insert({
      client_id: data.clientId,
      stakeholder_id: data.stakeholderId,
      kind: "login",
      email,
      user_id: targetUserId,
      invited_by: context.userId,
    });
    if (error) throw new Error(error.message);

    await supabaseAdmin
      .from("cap_stakeholders")
      .update({ email })
      .eq("id", data.stakeholderId);

    let delivery: "sent" | "suppressed" | "failed" = "sent";
    try {
      const { sendTemplateEmail } = await import("@/lib/email-templates/send-email");
      const sent = await sendTemplateEmail("shareholder-invitation", email, {
        idempotencyKey: `shareholder-invite-${data.stakeholderId}-${Date.now()}`,
        templateData: {
          holderName: String((holder as any).name ?? email),
          companyName,
          passwordUrl,
          signInUrl: `${PORTAL_ORIGIN}/shares`,
        },
      });
      if (!sent.sent) delivery = "suppressed";
    } catch {
      delivery = "failed";
    }

    await audit(context, {
      clientId: data.clientId,
      action: "shareholder_invited",
      target: email,
      next: { stakeholder: data.stakeholderId, delivery },
    });
    return { ok: true, delivery };
  });

export const createHolderLink = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        clientId: z.string().uuid(),
        stakeholderId: z.string().uuid(),
        days: z.number().int().min(1).max(365).default(30),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const me = await who(context, data.clientId);
    if (!me.canEdit) throw new Error("You do not have permission to change this cap table.");

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { newToken, hashToken } = await import("@/lib/cap-certificates.server");
    const { PORTAL_ORIGIN } = await import("@/lib/account-invite.server");

    const token = newToken();
    const expires = new Date(Date.now() + data.days * 86_400_000).toISOString();
    const { error } = await supabaseAdmin.from("cap_holder_access").insert({
      client_id: data.clientId,
      stakeholder_id: data.stakeholderId,
      kind: "link",
      token_hash: await hashToken(token),
      expires_at: expires,
      invited_by: context.userId,
    });
    if (error) throw new Error(error.message);

    await audit(context, {
      clientId: data.clientId,
      action: "holder_link_created",
      target: data.stakeholderId,
      next: { expires_at: expires },
    });
    return { url: `${PORTAL_ORIGIN}/shares/${token}`, expires_at: expires };
  });

export const revokeHolderAccess = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ clientId: z.string().uuid(), id: z.string().uuid() }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const me = await who(context, data.clientId);
    if (!me.canEdit) throw new Error("You do not have permission to change this cap table.");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin
      .from("cap_holder_access")
      .update({ revoked_at: new Date().toISOString() })
      .eq("id", data.id)
      .eq("client_id", data.clientId);
    if (error) throw new Error(error.message);
    await audit(context, {
      clientId: data.clientId,
      action: "holder_access_revoked",
      target: data.id,
    });
    return { ok: true };
  });

/* -------------------------------------------------------- shareholder views */

function holderPayload(company: any, holder: any, holdings: any[], certificates: any[]) {
  return {
    companyName: (company as any)?.legal_name || (company as any)?.name || "",
    holderName: String((holder as any)?.name ?? ""),
    holdings: holdings.map((h) => ({
      id: h.id,
      security_type: h.security_type,
      share_class: h.share_class,
      quantity: Number(h.quantity ?? 0),
      price_per_share_cents: h.price_per_share_cents,
      issued_on: h.issued_on,
      certificate_no: h.certificate_no,
      status: h.status,
    })),
    certificates: certificates.map((c) => ({
      id: c.id,
      certificate_no: c.certificate_no,
      status: c.status,
      snapshot: c.snapshot,
      verification_code: c.verification_code,
      signer_name: c.signer_name,
      signer_title: c.signer_title,
      signed_at: c.signed_at,
      cancelled_at: c.cancelled_at,
      cancelled_reason: c.cancelled_reason,
    })),
  };
}

/** Private-link view. Public on purpose: the unguessable token is the key. */
export const getSharesByToken = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => z.object({ token: z.string().min(20).max(200) }).parse(d))
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { hashToken } = await import("@/lib/cap-certificates.server");
    const { data: row } = await supabaseAdmin
      .from("cap_holder_access")
      .select("*")
      .eq("token_hash", await hashToken(data.token))
      .eq("kind", "link")
      .maybeSingle();
    if (!row) return { ok: false as const, reason: "This link is not valid." };
    if ((row as any).revoked_at) return { ok: false as const, reason: "This link was withdrawn." };
    if ((row as any).expires_at && new Date((row as any).expires_at) < new Date()) {
      return { ok: false as const, reason: "This link has expired." };
    }

    const [{ data: holder }, { data: company }, { data: holdings }, { data: certificates }] =
      await Promise.all([
        supabaseAdmin
          .from("cap_stakeholders")
          .select("id, name")
          .eq("id", (row as any).stakeholder_id)
          .maybeSingle(),
        supabaseAdmin
          .from("clients")
          .select("name, legal_name")
          .eq("id", (row as any).client_id)
          .maybeSingle(),
        supabaseAdmin
          .from("cap_holdings")
          .select("*")
          .eq("stakeholder_id", (row as any).stakeholder_id)
          .order("issued_on", { ascending: false }),
        supabaseAdmin
          .from("cap_certificates")
          .select("*")
          .eq("stakeholder_id", (row as any).stakeholder_id)
          .order("created_at", { ascending: false }),
      ]);

    await supabaseAdmin
      .from("cap_holder_access")
      .update({
        last_seen_at: new Date().toISOString(),
        view_count: Number((row as any).view_count ?? 0) + 1,
      })
      .eq("id", (row as any).id);

    return {
      ok: true as const,
      ...holderPayload(company, holder, (holdings ?? []) as any[], (certificates ?? []) as any[]),
    };
  });

/** Signed-in shareholder view: every stakeholder record this account can see. */
export const getMyShares = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data: grants } = await context.supabase
      .from("cap_holder_access")
      .select("id, client_id, stakeholder_id, revoked_at, expires_at, kind")
      .eq("user_id", context.userId)
      .eq("kind", "login");

    const live = ((grants ?? []) as any[]).filter(
      (g) => !g.revoked_at && (!g.expires_at || new Date(g.expires_at) > new Date()),
    );
    if (live.length === 0) return { positions: [] as any[] };

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const positions = [];
    for (const grant of live) {
      const [{ data: holder }, { data: company }, { data: holdings }, { data: certificates }] =
        await Promise.all([
          supabaseAdmin
            .from("cap_stakeholders")
            .select("id, name")
            .eq("id", grant.stakeholder_id)
            .maybeSingle(),
          supabaseAdmin
            .from("clients")
            .select("name, legal_name")
            .eq("id", grant.client_id)
            .maybeSingle(),
          supabaseAdmin
            .from("cap_holdings")
            .select("*")
            .eq("stakeholder_id", grant.stakeholder_id)
            .order("issued_on", { ascending: false }),
          supabaseAdmin
            .from("cap_certificates")
            .select("*")
            .eq("stakeholder_id", grant.stakeholder_id)
            .order("created_at", { ascending: false }),
        ]);
      positions.push(
        holderPayload(company, holder, (holdings ?? []) as any[], (certificates ?? []) as any[]),
      );
    }
    return { positions };
  });
