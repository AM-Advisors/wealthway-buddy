import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { buildSowSections, HARMONIOUS_LEGAL_NAME, MSA_SECTIONS } from "@/lib/agreement-templates";

/**
 * Agreements & SOW — the contracting workspace.
 *
 * Clients review their master agreement, request a new fund or SPV, review the
 * statement of work that comes back section by section, ask for changes, then
 * sign. Harmonious staff price, answer changes and countersign. Once both sides
 * have signed, the agreement and its pricing are frozen: later edits happen as
 * amendments, never by rewriting the executed record.
 */

const STAFF_ROLES = [
  "admin",
  "super_admin",
  "operations",
  "legal",
  "compliance",
  "fund_administration",
  "tax",
  "finance",
  "client_success",
  "executive",
] as const;

const CONTRACT_ROLES = [
  "admin",
  "super_admin",
  "legal",
  "client_success",
  "compliance",
  "finance",
  "executive",
] as const;

type Who = {
  userId: string;
  email: string;
  roles: string[];
  isStaff: boolean;
  canManage: boolean;
  clientIds: string[];
};

async function whoIs(context: any): Promise<Who> {
  const [{ data: roleRows }, { data: memberships }] = await Promise.all([
    context.supabase.from("user_roles").select("role").eq("user_id", context.userId),
    context.supabase.from("client_users").select("client_id").eq("user_id", context.userId),
  ]);
  const roles = ((roleRows ?? []) as any[]).map((r) => String(r.role));
  return {
    userId: context.userId,
    email: (context.claims?.email as string | undefined) ?? "",
    roles,
    isStaff: roles.some((r) => (STAFF_ROLES as readonly string[]).includes(r)),
    canManage: roles.some((r) => (CONTRACT_ROLES as readonly string[]).includes(r)),
    clientIds: [...new Set(((memberships ?? []) as any[]).map((m) => String(m.client_id)))],
  };
}

async function requireContractAuthority(context: any) {
  const who = await whoIs(context);
  if (!who.canManage) {
    throw new Error(
      "Forbidden: contracting decisions need legal, compliance, finance, client success or admin authority.",
    );
  }
  return who;
}

async function audit(
  context: any,
  who: Who,
  entry: {
    action: string;
    target?: string | null;
    clientId?: string | null;
    offeringId?: string | null;
    previous?: unknown;
    next?: unknown;
  },
) {
  await context.supabase.from("contract_audit_events").insert({
    actor_id: who.userId,
    actor_role: who.roles.join(", ") || "client",
    client_id: entry.clientId ?? null,
    offering_id: entry.offeringId ?? null,
    area: "agreements",
    action: entry.action,
    target: entry.target ?? null,
    previous_value: (entry.previous ?? null) as any,
    new_value: (entry.next ?? null) as any,
    source: "web",
  });
}

async function myClients(context: any, who: Who) {
  if (who.isStaff) {
    const { data } = await context.supabase
      .from("clients")
      .select("id, name, legal_name, status")
      .order("name");
    return (data ?? []) as any[];
  }
  if (who.clientIds.length === 0) return [];
  const { data } = await context.supabase
    .from("clients")
    .select("id, name, legal_name, status")
    .in("id", who.clientIds)
    .order("name");
  return (data ?? []) as any[];
}

async function assertClientAccess(context: any, who: Who, clientId: string) {
  if (who.isStaff || who.clientIds.includes(clientId)) return;
  throw new Error("Forbidden: this agreement belongs to another client.");
}

async function currentMsaVersion(context: any) {
  const { data } = await context.supabase
    .from("msa_versions")
    .select("*")
    .eq("status", "published")
    .order("effective_date", { ascending: false })
    .limit(1)
    .maybeSingle();
  return (data ?? null) as any;
}

async function currentPricingVersion(context: any) {
  const { data } = await context.supabase
    .from("pricing_versions")
    .select("*")
    .eq("status", "published")
    .order("effective_date", { ascending: false })
    .limit(1)
    .maybeSingle();
  return (data ?? null) as any;
}

/* ---------------------------------------------------------------- overview */

export const getAgreementsHome = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ clientId: z.string().uuid().nullish() }).parse(d ?? {}),
  )
  .handler(async ({ context, data }) => {
    const who = await whoIs(context);
    const clients = await myClients(context, who);
    const clientId =
      data.clientId && clients.some((c) => c.id === data.clientId)
        ? data.clientId
        : ((clients[0]?.id as string | undefined) ?? null);

    if (!clientId) {
      return {
        access: { isStaff: who.isStaff, canManage: who.canManage },
        clients,
        clientId: null,
        msa: null,
        funds: [],
        pending: [],
        requests: [],
        changeCount: 0,
      };
    }

    const msaVersion = await currentMsaVersion(context);

    const [{ data: msaRows }, { data: sows }, { data: requests }, { data: changes }] =
      await Promise.all([
        context.supabase
          .from("client_msa_agreements")
          .select("*, msa_versions(version, effective_date, summary)")
          .eq("client_id", clientId)
          .order("created_at", { ascending: false }),
        context.supabase
          .from("client_sows")
          .select("*")
          .eq("client_id", clientId)
          .order("created_at", { ascending: false }),
        context.supabase
          .from("fund_requests")
          .select("*")
          .eq("client_id", clientId)
          .order("created_at", { ascending: false }),
        context.supabase
          .from("agreement_change_requests")
          .select("id, sow_id, status, section_title, updated_at")
          .eq("client_id", clientId),
      ]);

    const sowIds = ((sows ?? []) as any[]).map((s) => s.id);
    const offeringIds = ((sows ?? []) as any[]).map((s) => s.offering_id).filter(Boolean);

    const [{ data: snapshots }, { data: offerings }] = await Promise.all([
      sowIds.length
        ? context.supabase
            .from("sow_pricing_snapshots")
            .select("sow_id, version_label, effective_date")
            .in("sow_id", sowIds)
        : Promise.resolve({ data: [] as any[] }),
      offeringIds.length
        ? context.supabase.from("offerings").select("id, name, is_open").in("id", offeringIds)
        : Promise.resolve({ data: [] as any[] }),
    ]);

    const snapshotBySow = new Map(((snapshots ?? []) as any[]).map((s) => [s.sow_id, s]));
    const offeringById = new Map(((offerings ?? []) as any[]).map((o) => [o.id, o]));
    const openChanges = ((changes ?? []) as any[]).filter(
      (c) => !["approved", "declined", "resolved"].includes(String(c.status)),
    );

    const mapSow = (s: any) => ({
      id: s.id as string,
      title: s.title as string,
      stage: (s.stage as string) ?? "draft",
      status: s.status as string,
      effectiveDate: (s.effective_date as string) ?? null,
      executedAt: (s.executed_at as string) ?? null,
      locked: Boolean(s.locked),
      offeringId: (s.offering_id as string) ?? null,
      offeringName: offeringById.get(s.offering_id)?.name ?? null,
      pricingVersion: snapshotBySow.get(s.id)?.version_label ?? null,
      openChanges: openChanges.filter((c) => c.sow_id === s.id).length,
    });

    const allSows = ((sows ?? []) as any[]).map(mapSow);
    const clientMsa = ((msaRows ?? []) as any[])[0] ?? null;

    return {
      access: { isStaff: who.isStaff, canManage: who.canManage },
      clients,
      clientId,
      msa: {
        currentVersion: msaVersion?.version ?? null,
        currentVersionId: msaVersion?.id ?? null,
        currentEffectiveDate: msaVersion?.effective_date ?? null,
        summary: msaVersion?.summary ?? null,
        agreementId: clientMsa?.id ?? null,
        acceptedVersion: clientMsa?.msa_versions?.version ?? null,
        status: clientMsa?.status ?? "not_started",
        executedAt: clientMsa?.executed_at ?? null,
        needsReview: !clientMsa || clientMsa.msa_version_id !== msaVersion?.id,
      },
      funds: allSows.filter((s) => s.executedAt),
      pending: allSows.filter((s) => !s.executedAt),
      requests: ((requests ?? []) as any[]).map((r) => ({
        id: r.id as string,
        fundName: r.fund_name as string,
        status: r.status as string,
        sowId: (r.sow_id as string) ?? null,
        createdAt: r.created_at as string,
      })),
      changeCount: openChanges.length,
    };
  });

/* --------------------------------------------------------------------- MSA */

export const getMsaWorkspace = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ clientId: z.string().uuid() }).parse(d))
  .handler(async ({ context, data }) => {
    const who = await whoIs(context);
    await assertClientAccess(context, who, data.clientId);

    const version = await currentMsaVersion(context);
    if (!version) throw new Error("No master services agreement has been published yet.");

    const [{ data: sections }, { data: agreementRow }, { data: history }] = await Promise.all([
      context.supabase
        .from("msa_sections")
        .select("*")
        .eq("msa_version_id", version.id)
        .order("sort_order"),
      context.supabase
        .from("client_msa_agreements")
        .select("*")
        .eq("client_id", data.clientId)
        .eq("msa_version_id", version.id)
        .maybeSingle(),
      context.supabase
        .from("client_msa_agreements")
        .select("*, msa_versions(version, effective_date)")
        .eq("client_id", data.clientId)
        .order("created_at", { ascending: false }),
    ]);

    const priorVersions = ((history ?? []) as any[]).filter(
      (h) => h.msa_version_id !== version.id && h.executed_at,
    );

    const { data: signatures } = await context.supabase
      .from("agreement_signatures")
      .select("*")
      .eq("client_id", data.clientId)
      .eq("scope", "msa")
      .order("signed_at");

    return {
      access: { isStaff: who.isStaff, canManage: who.canManage },
      version: {
        id: version.id as string,
        version: version.version as string,
        effectiveDate: version.effective_date as string,
        summary: (version.summary as string) ?? null,
      },
      sections: ((sections ?? []) as any[]).map((s) => ({
        id: s.id as string,
        no: s.section_no as string,
        title: s.title as string,
        body: s.body as string,
      })),
      agreement: agreementRow
        ? {
            id: (agreementRow as any).id as string,
            status: (agreementRow as any).status as string,
            executedAt: ((agreementRow as any).executed_at as string) ?? null,
          }
        : null,
      history: priorVersions.map((h) => ({
        id: h.id as string,
        version: h.msa_versions?.version ?? "—",
        executedAt: h.executed_at as string,
      })),
      signatures: ((signatures ?? []) as any[]).map((s) => ({
        side: s.side as string,
        name: s.signer_name as string,
        title: (s.signer_title as string) ?? null,
        signedAt: s.signed_at as string,
        version: (s.version_label as string) ?? null,
      })),
    };
  });

export const signMsa = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        clientId: z.string().uuid(),
        signerName: z.string().min(2),
        signerTitle: z.string().min(1),
        typedSignature: z.string().min(2),
        company: z.string().nullish(),
      })
      .parse(d),
  )
  .handler(async ({ context, data }) => {
    const who = await whoIs(context);
    await assertClientAccess(context, who, data.clientId);

    const version = await currentMsaVersion(context);
    if (!version) throw new Error("No master services agreement has been published yet.");

    let { data: agreement } = await context.supabase
      .from("client_msa_agreements")
      .select("*")
      .eq("client_id", data.clientId)
      .eq("msa_version_id", version.id)
      .maybeSingle();

    if (!agreement) {
      const { data: created, error } = await context.supabase
        .from("client_msa_agreements")
        .insert({ client_id: data.clientId, msa_version_id: version.id, status: "in_review" })
        .select("*")
        .single();
      if (error) throw new Error(error.message);
      agreement = created;
    }
    if ((agreement as any).executed_at) {
      return { ok: true, alreadyExecuted: true } as const;
    }

    const { error: sigError } = await context.supabase.from("agreement_signatures").insert({
      scope: "msa",
      client_id: data.clientId,
      msa_agreement_id: (agreement as any).id,
      side: "client",
      company: data.company ?? null,
      signer_name: data.signerName,
      signer_title: data.signerTitle,
      signer_email: who.email,
      signer_user_id: who.userId,
      typed_signature: data.typedSignature,
      version_label: version.version,
    });
    if (sigError) throw new Error(sigError.message);

    const now = new Date().toISOString();
    await context.supabase
      .from("client_msa_agreements")
      .update({ status: "executed", client_approved_at: now, executed_at: now })
      .eq("id", (agreement as any).id);

    const { data: sections } = await context.supabase
      .from("msa_sections")
      .select("section_no, title, body")
      .eq("msa_version_id", version.id)
      .order("sort_order");

    await context.supabase.from("agreement_executions").insert({
      scope: "msa",
      client_id: data.clientId,
      msa_agreement_id: (agreement as any).id,
      snapshot: {
        version: version.version,
        effectiveDate: version.effective_date,
        sections: sections ?? [],
        signedBy: data.signerName,
        signedTitle: data.signerTitle,
        signedAt: now,
      } as any,
    });

    await audit(context, who, {
      action: "msa.executed",
      clientId: data.clientId,
      target: version.version,
      next: { signer: data.signerName, version: version.version },
    });

    return { ok: true, alreadyExecuted: false } as const;
  });

/* ------------------------------------------------------------ fund request */

export const requestNewFund = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        clientId: z.string().uuid(),
        fundName: z.string().min(2),
        entityType: z.string().nullish(),
        jurisdiction: z.string().nullish(),
        fundType: z.string().nullish(),
        targetRaiseCents: z.number().int().nonnegative().nullish(),
        expectedInvestors: z.number().int().nonnegative().nullish(),
        expectedInvestments: z.string().nullish(),
        expectedLaunchDate: z.string().nullish(),
        contactName: z.string().nullish(),
        contactEmail: z.string().nullish(),
        services: z.array(z.string()).default([]),
        notes: z.string().nullish(),
      })
      .parse(d),
  )
  .handler(async ({ context, data }) => {
    const who = await whoIs(context);
    await assertClientAccess(context, who, data.clientId);

    const [{ data: client }, msaVersion, pricingVersion] = await Promise.all([
      context.supabase
        .from("clients")
        .select("id, name, legal_name")
        .eq("id", data.clientId)
        .maybeSingle(),
      currentMsaVersion(context),
      currentPricingVersion(context),
    ]);
    if (!client) throw new Error("Client not found.");
    if (!pricingVersion) throw new Error("No pricing schedule has been published yet.");

    const { data: request, error: reqError } = await context.supabase
      .from("fund_requests")
      .insert({
        client_id: data.clientId,
        fund_name: data.fundName,
        entity_type: data.entityType ?? null,
        jurisdiction: data.jurisdiction ?? null,
        fund_type: data.fundType ?? null,
        target_raise_cents: data.targetRaiseCents ?? null,
        expected_investors: data.expectedInvestors ?? null,
        expected_investments: data.expectedInvestments ?? null,
        expected_launch_date: data.expectedLaunchDate || null,
        contact_name: data.contactName ?? null,
        contact_email: data.contactEmail ?? who.email,
        services: data.services,
        notes: data.notes ?? null,
        status: "sow_issued",
        created_by: who.userId,
      })
      .select("*")
      .single();
    if (reqError) throw new Error(reqError.message);

    const { data: items } = await context.supabase
      .from("pricing_items")
      .select("*")
      .eq("version_id", pricingVersion.id)
      .order("sort_order");

    const chosen = data.services;
    const priceItems = ((items ?? []) as any[]).filter(
      (i) => chosen.length === 0 || chosen.includes(String(i.service_key)),
    );

    const effectiveDate = new Date().toISOString().slice(0, 10);
    const { data: sow, error: sowError } = await context.supabase
      .from("client_sows")
      .insert({
        client_id: data.clientId,
        title: `Statement of Work — ${data.fundName}`,
        sow_type: "spv",
        status: "draft",
        stage: "in_review",
        effective_date: effectiveDate,
        notice_days: 60,
        msa_version_id: msaVersion?.id ?? null,
        fund_request_id: (request as any).id,
        created_by: who.userId,
      })
      .select("*")
      .single();
    if (sowError) throw new Error(sowError.message);

    await context.supabase
      .from("fund_requests")
      .update({ sow_id: (sow as any).id })
      .eq("id", (request as any).id);

    const sections = buildSowSections({
      clientName: (client as any).legal_name || (client as any).name,
      fundName: data.fundName,
      entityType: data.entityType,
      jurisdiction: data.jurisdiction,
      fundType: data.fundType,
      targetRaiseCents: data.targetRaiseCents ?? null,
      expectedInvestors: data.expectedInvestors ?? null,
      expectedInvestments: data.expectedInvestments ?? null,
      expectedLaunchDate: data.expectedLaunchDate ?? null,
      contactName: data.contactName ?? null,
      contactEmail: data.contactEmail ?? who.email,
      effectiveDate,
      msaVersion: msaVersion?.version ?? "in force",
      pricingVersion: pricingVersion.label as string,
      services: priceItems.map((i) => ({ label: i.label as string, description: i.condition })),
      noticeDays: 60,
    });

    await context.supabase.from("sow_sections").insert(
      sections.map((s) => ({
        sow_id: (sow as any).id,
        section_no: s.section_no,
        key: s.key,
        title: s.title,
        body: s.body,
        sort_order: s.sort_order,
      })),
    );

    const { data: snapshot, error: snapError } = await context.supabase
      .from("sow_pricing_snapshots")
      .insert({
        sow_id: (sow as any).id,
        version_id: pricingVersion.id,
        version_label: pricingVersion.label,
        effective_date: pricingVersion.effective_date,
        created_by: who.userId,
      })
      .select("*")
      .single();
    if (snapError) throw new Error(snapError.message);

    if (priceItems.length) {
      await context.supabase.from("sow_pricing_lines").insert(
        priceItems.map((i, index) => ({
          snapshot_id: (snapshot as any).id,
          service_key: i.service_key,
          label: i.label,
          pricing_model: i.pricing_model ?? "annual",
          standard_cents: Number(i.amount_cents ?? 0),
          final_cents: Number(i.amount_cents ?? 0),
          pass_through: Boolean(i.pass_through),
          unit: i.unit ?? null,
          sort_order: index,
        })),
      );
    }

    await audit(context, who, {
      action: "fund_request.submitted",
      clientId: data.clientId,
      target: data.fundName,
      next: { sowId: (sow as any).id, pricingVersion: pricingVersion.label },
    });

    return { sowId: (sow as any).id as string, requestId: (request as any).id as string };
  });

/* --------------------------------------------------------------- SOW review */

export const getSowWorkspace = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ sowId: z.string().uuid() }).parse(d))
  .handler(async ({ context, data }) => {
    const who = await whoIs(context);
    const { data: sow, error } = await context.supabase
      .from("client_sows")
      .select("*")
      .eq("id", data.sowId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!sow) throw new Error("Agreement not found.");
    await assertClientAccess(context, who, (sow as any).client_id);

    const [
      { data: client },
      { data: sections },
      { data: approvals },
      { data: snapshot },
      { data: changes },
      { data: signatures },
      { data: execution },
      { data: request },
      { data: amendments },
    ] = await Promise.all([
      context.supabase
        .from("clients")
        .select("id, name, legal_name")
        .eq("id", (sow as any).client_id)
        .maybeSingle(),
      context.supabase.from("sow_sections").select("*").eq("sow_id", data.sowId).order("sort_order"),
      context.supabase.from("sow_section_approvals").select("*").eq("sow_id", data.sowId),
      context.supabase
        .from("sow_pricing_snapshots")
        .select("*")
        .eq("sow_id", data.sowId)
        .maybeSingle(),
      context.supabase
        .from("agreement_change_requests")
        .select("*")
        .eq("sow_id", data.sowId)
        .order("created_at"),
      context.supabase
        .from("agreement_signatures")
        .select("*")
        .eq("sow_id", data.sowId)
        .order("signed_at"),
      context.supabase
        .from("agreement_executions")
        .select("*")
        .eq("sow_id", data.sowId)
        .order("executed_at", { ascending: false })
        .limit(1)
        .maybeSingle(),
      (sow as any).fund_request_id
        ? context.supabase
            .from("fund_requests")
            .select("*")
            .eq("id", (sow as any).fund_request_id)
            .maybeSingle()
        : Promise.resolve({ data: null }),
      context.supabase
        .from("sow_amendments")
        .select("*")
        .eq("sow_id", data.sowId)
        .order("amendment_no"),
    ]);

    const changeIds = ((changes ?? []) as any[]).map((c) => c.id);
    const { data: messages } = changeIds.length
      ? await context.supabase
          .from("agreement_change_messages")
          .select("*")
          .in("change_request_id", changeIds)
          .order("created_at")
      : { data: [] as any[] };

    const { data: lines } = snapshot
      ? await context.supabase
          .from("sow_pricing_lines")
          .select("*")
          .eq("snapshot_id", (snapshot as any).id)
          .order("sort_order")
      : { data: [] as any[] };

    const approvalBySection = new Map(
      ((approvals ?? []) as any[]).map((a) => [a.section_id, a.status]),
    );

    return {
      access: { isStaff: who.isStaff, canManage: who.canManage },
      sow: {
        id: (sow as any).id as string,
        clientId: (sow as any).client_id as string,
        clientName: ((client as any)?.legal_name || (client as any)?.name || "—") as string,
        title: (sow as any).title as string,
        stage: ((sow as any).stage as string) ?? "draft",
        status: (sow as any).status as string,
        effectiveDate: ((sow as any).effective_date as string) ?? null,
        noticeDays: Number((sow as any).notice_days ?? 60),
        executedAt: ((sow as any).executed_at as string) ?? null,
        locked: Boolean((sow as any).locked),
        offeringId: ((sow as any).offering_id as string) ?? null,
        specialTerms: ((sow as any).special_terms as string) ?? null,
        version: Number((sow as any).sow_version ?? 1),
      },
      request: request
        ? {
            id: (request as any).id as string,
            fundName: (request as any).fund_name as string,
            status: (request as any).status as string,
          }
        : null,
      sections: ((sections ?? []) as any[]).map((s) => ({
        id: s.id as string,
        key: s.key as string,
        no: s.section_no as string,
        title: s.title as string,
        body: s.body as string,
        approval: (approvalBySection.get(s.id) as string | undefined) ?? null,
      })),
      pricing: {
        snapshotId: (snapshot as any)?.id ?? null,
        versionLabel: (snapshot as any)?.version_label ?? null,
        locked: Boolean((snapshot as any)?.locked),
        lines: ((lines ?? []) as any[]).map((l) => ({
          id: l.id as string,
          serviceKey: l.service_key as string,
          label: l.label as string,
          pricingModel: l.pricing_model as string,
          standardCents: Number(l.standard_cents ?? 0),
          finalCents: Number(l.final_cents ?? 0),
          adjustmentReason: (l.adjustment_reason as string) ?? null,
          included: Boolean(l.included),
          passThrough: Boolean(l.pass_through),
          unit: (l.unit as string) ?? null,
        })),
      },
      changes: ((changes ?? []) as any[]).map((c) => ({
        id: c.id as string,
        sectionTitle: c.section_title as string,
        sectionNo: (c.section_no as string) ?? null,
        originalText: c.original_text as string,
        requestedText: c.requested_text as string,
        finalText: (c.final_text as string) ?? null,
        reason: (c.reason as string) ?? null,
        status: c.status as string,
        response: (c.harmonious_response as string) ?? null,
        respondedAt: (c.responded_at as string) ?? null,
        createdAt: c.created_at as string,
        messages: ((messages ?? []) as any[])
          .filter((m) => m.change_request_id === c.id)
          .map((m) => ({
            id: m.id as string,
            side: m.author_side as string,
            name: (m.author_name as string) ?? null,
            body: (m.body as string) ?? null,
            proposedText: (m.proposed_text as string) ?? null,
            createdAt: m.created_at as string,
          })),
      })),
      signatures: ((signatures ?? []) as any[]).map((s) => ({
        id: s.id as string,
        side: s.side as string,
        name: s.signer_name as string,
        title: (s.signer_title as string) ?? null,
        email: (s.signer_email as string) ?? null,
        company: (s.company as string) ?? null,
        signedAt: s.signed_at as string,
      })),
      executionId: (execution as any)?.id ?? null,
      amendments: ((amendments ?? []) as any[]).map((a) => ({
        id: a.id as string,
        no: Number(a.amendment_no),
        title: a.title as string,
        status: a.status as string,
        effectiveDate: (a.effective_date as string) ?? null,
        existingTerms: a.existing_terms as string,
        requestedChange: a.requested_change as string,
        newTerms: a.new_terms as string,
        executedAt: (a.executed_at as string) ?? null,
      })),
    };
  });

async function loadSowForWrite(context: any, who: Who, sowId: string) {
  const { data: sow } = await context.supabase
    .from("client_sows")
    .select("*")
    .eq("id", sowId)
    .maybeSingle();
  if (!sow) throw new Error("Agreement not found.");
  await assertClientAccess(context, who, (sow as any).client_id);
  return sow as any;
}

export const decideSection = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        sowId: z.string().uuid(),
        sectionId: z.string().uuid(),
        decision: z.enum(["approve", "change"]),
        requestedText: z.string().nullish(),
        reason: z.string().nullish(),
      })
      .parse(d),
  )
  .handler(async ({ context, data }) => {
    const who = await whoIs(context);
    const sow = await loadSowForWrite(context, who, data.sowId);
    if (sow.locked || sow.executed_at) {
      throw new Error("This agreement is executed. Changes are made through an amendment.");
    }

    const { data: section } = await context.supabase
      .from("sow_sections")
      .select("*")
      .eq("id", data.sectionId)
      .maybeSingle();
    if (!section) throw new Error("Section not found.");

    const status = data.decision === "approve" ? "approved" : "change_requested";
    await context.supabase.from("sow_section_approvals").upsert(
      {
        sow_id: data.sowId,
        section_id: data.sectionId,
        status,
        decided_by: who.userId,
        decided_at: new Date().toISOString(),
      },
      { onConflict: "section_id" },
    );

    if (data.decision === "change") {
      const requested = (data.requestedText ?? "").trim();
      if (requested.length < 5) {
        throw new Error("Describe the wording you would like instead.");
      }
      const { data: change, error } = await context.supabase
        .from("agreement_change_requests")
        .insert({
          scope: "sow",
          client_id: sow.client_id,
          sow_id: data.sowId,
          section_key: (section as any).key,
          section_no: (section as any).section_no,
          section_title: (section as any).title,
          original_text: (section as any).body,
          requested_text: requested,
          reason: data.reason ?? null,
          status: "requested",
          created_by: who.userId,
        })
        .select("id")
        .single();
      if (error) throw new Error(error.message);

      await context.supabase.from("agreement_change_messages").insert({
        change_request_id: (change as any).id,
        author_id: who.userId,
        author_side: who.isStaff ? "harmonious" : "client",
        author_name: who.email,
        body: data.reason ?? null,
        proposed_text: requested,
        status_after: "requested",
      });

      await context.supabase
        .from("client_sows")
        .update({ stage: "changes_requested" })
        .eq("id", data.sowId);
    }

    await audit(context, who, {
      action: data.decision === "approve" ? "sow.section_approved" : "sow.change_requested",
      clientId: sow.client_id,
      target: (section as any).title,
    });

    return { ok: true } as const;
  });

export const respondToCounter = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        changeId: z.string().uuid(),
        action: z.enum(["accept", "revise"]),
        requestedText: z.string().nullish(),
        reason: z.string().nullish(),
      })
      .parse(d),
  )
  .handler(async ({ context, data }) => {
    const who = await whoIs(context);
    const { data: change } = await context.supabase
      .from("agreement_change_requests")
      .select("*")
      .eq("id", data.changeId)
      .maybeSingle();
    if (!change) throw new Error("Change request not found.");
    await assertClientAccess(context, who, (change as any).client_id);

    if (data.action === "accept") {
      const finalText =
        ((change as any).final_text as string) || ((change as any).requested_text as string);
      await context.supabase
        .from("agreement_change_requests")
        .update({ status: "resolved", final_text: finalText, resolved_at: new Date().toISOString() })
        .eq("id", data.changeId);
      if ((change as any).section_key && (change as any).sow_id) {
        await context.supabase
          .from("sow_sections")
          .update({ body: finalText })
          .eq("sow_id", (change as any).sow_id)
          .eq("key", (change as any).section_key);
        await context.supabase
          .from("sow_section_approvals")
          .update({ status: "approved", decided_by: who.userId })
          .eq("sow_id", (change as any).sow_id)
          .eq("section_id", (change as any).section_id ?? "00000000-0000-0000-0000-000000000000");
      }
      await context.supabase.from("agreement_change_messages").insert({
        change_request_id: data.changeId,
        author_id: who.userId,
        author_side: "client",
        author_name: who.email,
        body: "Accepted the proposed wording.",
        proposed_text: finalText,
        status_after: "resolved",
      });
    } else {
      const requested = (data.requestedText ?? "").trim();
      if (requested.length < 5) throw new Error("Describe the wording you would like instead.");
      await context.supabase
        .from("agreement_change_requests")
        .update({ status: "requested", requested_text: requested, reason: data.reason ?? null })
        .eq("id", data.changeId);
      await context.supabase.from("agreement_change_messages").insert({
        change_request_id: data.changeId,
        author_id: who.userId,
        author_side: "client",
        author_name: who.email,
        body: data.reason ?? null,
        proposed_text: requested,
        status_after: "requested",
      });
    }

    await audit(context, who, {
      action: data.action === "accept" ? "change.accepted" : "change.revised",
      clientId: (change as any).client_id,
      target: (change as any).section_title,
    });

    return { ok: true } as const;
  });

export const signSow = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        sowId: z.string().uuid(),
        signerName: z.string().min(2),
        signerTitle: z.string().min(1),
        typedSignature: z.string().min(2),
        company: z.string().nullish(),
      })
      .parse(d),
  )
  .handler(async ({ context, data }) => {
    const who = await whoIs(context);
    const sow = await loadSowForWrite(context, who, data.sowId);
    if (sow.executed_at) return { ok: true, alreadySigned: true } as const;

    const [{ data: sections }, { data: changes }, { data: existing }] = await Promise.all([
      context.supabase.from("sow_sections").select("id").eq("sow_id", data.sowId),
      context.supabase
        .from("agreement_change_requests")
        .select("id, status")
        .eq("sow_id", data.sowId),
      context.supabase
        .from("agreement_signatures")
        .select("id, side")
        .eq("sow_id", data.sowId)
        .eq("side", "client"),
    ]);
    if (((existing ?? []) as any[]).length) return { ok: true, alreadySigned: true } as const;

    const { data: approvals } = await context.supabase
      .from("sow_section_approvals")
      .select("section_id, status")
      .eq("sow_id", data.sowId);
    const approvedIds = new Set(
      ((approvals ?? []) as any[])
        .filter((a) => a.status === "approved")
        .map((a) => String(a.section_id)),
    );
    const missing = ((sections ?? []) as any[]).filter((s) => !approvedIds.has(String(s.id)));
    if (missing.length) throw new Error("Approve every section before signing.");

    const openChange = ((changes ?? []) as any[]).find(
      (c) => !["resolved", "declined", "approved"].includes(String(c.status)),
    );
    if (openChange) throw new Error("A change request is still open. Resolve it before signing.");

    const { error } = await context.supabase.from("agreement_signatures").insert({
      scope: "sow",
      client_id: sow.client_id,
      sow_id: data.sowId,
      side: "client",
      company: data.company ?? null,
      signer_name: data.signerName,
      signer_title: data.signerTitle,
      signer_email: who.email,
      signer_user_id: who.userId,
      typed_signature: data.typedSignature,
      version_label: `v${Number(sow.sow_version ?? 1)}`,
    });
    if (error) throw new Error(error.message);

    await context.supabase
      .from("client_sows")
      .update({
        stage: "client_signed",
        client_signed_at: new Date().toISOString(),
        client_final_approved_at: new Date().toISOString(),
        signed_by: data.signerName,
        signed_on: new Date().toISOString().slice(0, 10),
      })
      .eq("id", data.sowId);

    await audit(context, who, {
      action: "sow.client_signed",
      clientId: sow.client_id,
      target: sow.title,
      next: { signer: data.signerName },
    });

    return { ok: true, alreadySigned: false } as const;
  });
