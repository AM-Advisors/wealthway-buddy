import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/**
 * One fund, seen by the manager who runs it: how far setup has got,
 * every document the fund holds, and every investor application.
 */

async function reviewerContext(supabase: any, userId: string, offeringId: string) {
  const { data: roles, error } = await supabase
    .from("user_roles")
    .select("role")
    .eq("user_id", userId)
    .in("role", ["admin", "fund_manager"]);
  if (error) throw new Error(error.message);
  const list = (roles ?? []).map((r: any) => r.role as string);
  if (list.length === 0) throw new Error("Forbidden: reviewer access required.");
  const isAdmin = list.includes("admin");
  if (!isAdmin) {
    const { data: assignment, error: assignError } = await supabase
      .from("fund_managers")
      .select("id")
      .eq("user_id", userId)
      .eq("offering_id", offeringId)
      .maybeSingle();
    if (assignError) throw new Error(assignError.message);
    if (!assignment) throw new Error("Forbidden: you do not manage that fund.");
  }
  return { isAdmin };
}

type Step = {
  key: string;
  label: string;
  done: boolean;
  detail: string;
  href: string;
};

const schema = z.object({ offeringId: z.string().uuid() });

export const getManagerFundHome = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => schema.parse(data))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { isAdmin } = await reviewerContext(supabase, userId, data.offeringId);
    const offeringId = data.offeringId;

    const { data: offering, error: offeringError } = await supabase
      .from("offerings")
      .select(
        "id, name, slug, summary, reg_type, is_open, min_investment_cents, target_raise_cents, share_price_cents, wire_fee_cents, closing_cost_cents, legal_entity_name, fund_type, fund_type_other, entity_type, state_formed, date_formed, public_page_enabled",
      )
      .eq("id", offeringId)
      .maybeSingle();
    if (offeringError) throw new Error(offeringError.message);
    if (!offering) throw new Error("Fund not found, or you do not have access to it.");

    const [
      docsRes,
      roomRes,
      memoRes,
      statementRes,
      timelineRes,
      bankRes,
      taxRes,
      appsRes,
      accessRes,
    ] = await Promise.all([
      supabase
        .from("offering_documents")
        .select(
          "id, title, doc_type, requires_signature, sort_order, file_name, file_path, current_version, file_updated_at, template_pack, created_at",
        )
        .eq("offering_id", offeringId)
        .order("sort_order")
        .limit(200),
      supabase
        .from("diligence_rooms")
        .select("id, created_at, nda_required, nda_signing_enabled")
        .eq("offering_id", offeringId)
        .maybeSingle(),
      supabase
        .from("offering_memos")
        .select("id, is_published, published_at, updated_at")
        .eq("offering_id", offeringId)
        .maybeSingle(),
      supabase
        .from("offering_statements")
        .select("id, is_published, published_at, updated_at")
        .eq("offering_id", offeringId)
        .maybeSingle(),
      supabase
        .from("offering_timeline_events")
        .select("id, title, event_date, kind, status, is_published")
        .eq("offering_id", offeringId)
        .order("event_date")
        .limit(100),
      supabase
        .from("offering_bank_setup_requests")
        .select("id, bank, status, review_status, note, created_at")
        .eq("offering_id", offeringId)
        .order("created_at", { ascending: false })
        .limit(1),
      supabase
        .from("fund_tax_documents")
        .select("id, doc_type, tax_year, file_name, review_status, reviewed_at, created_at")
        .eq("offering_id", offeringId)
        .eq("review_status", "approved")
        .order("created_at", { ascending: false })
        .limit(100),
      supabase
        .from("investor_applications")
        .select(
          "id, user_id, persona_id, status, current_step, kyc_status, aml_status, accreditation_status, documents_status, funding_status, manager_review_status, commitment_cents, submitted_at, created_at, updated_at",
        )
        .eq("offering_id", offeringId)
        .order("updated_at", { ascending: false })
        .limit(500),
      supabase
        .from("investor_fund_access")
        .select("id")
        .eq("offering_id", offeringId)
        .limit(500),
    ]);
    if (appsRes.error) throw new Error(appsRes.error.message);

    const documents = (docsRes.data ?? []) as any[];
    const applications = (appsRes.data ?? []) as any[];
    const appIds = applications.map((a) => a.id as string);
    const userIds = [...new Set(applications.map((a) => a.user_id as string))];
    const personaIds = [
      ...new Set(applications.map((a) => a.persona_id as string | null).filter(Boolean)),
    ] as string[];

    const [profilesRes, personasRes, signaturesRes, wiresRes, paymentsRes, roomDocsRes] =
      await Promise.all([
        userIds.length
          ? supabase
              .from("profiles")
              .select("user_id, legal_name, email, investor_type")
              .in("user_id", userIds)
          : Promise.resolve({ data: [] as any[] }),
        personaIds.length
          ? supabase.from("investor_personas").select("id, label, kind").in("id", personaIds)
          : Promise.resolve({ data: [] as any[] }),
        appIds.length
          ? supabase
              .from("document_signatures")
              .select("id, application_id, offering_document_id, signed_at, box_uploaded_at")
              .in("application_id", appIds)
              .limit(2000)
          : Promise.resolve({ data: [] as any[] }),
        appIds.length
          ? supabase
              .from("wire_confirmations")
              .select("id, application_id, status, amount_cents, sent_on, reviewed_at")
              .in("application_id", appIds)
              .limit(2000)
          : Promise.resolve({ data: [] as any[] }),
        appIds.length
          ? supabase
              .from("payments")
              .select("id, application_id, status, amount_cents, method, confirmed_at")
              .in("application_id", appIds)
              .limit(2000)
          : Promise.resolve({ data: [] as any[] }),
        (roomRes.data as any)?.id
          ? supabase
              .from("diligence_documents")
              .select("id, category, title, file_name, uploaded_at, version, visibility")
              .eq("offering_id", offeringId)
              .order("uploaded_at", { ascending: false })
              .limit(300)
          : Promise.resolve({ data: [] as any[] }),
      ]);

    const profileMap = new Map(((profilesRes as any).data ?? []).map((p: any) => [p.user_id, p]));
    const personaMap = new Map(((personasRes as any).data ?? []).map((p: any) => [p.id, p]));
    const signatures = ((signaturesRes as any).data ?? []) as any[];
    const wires = ((wiresRes as any).data ?? []) as any[];
    const payments = ((paymentsRes as any).data ?? []) as any[];
    const roomDocuments = ((roomDocsRes as any).data ?? []) as any[];

    // Wire instructions and entity details live in locked-down storage.
    let hasWireInstructions = false;
    try {
      const { data: wireRows } = await supabase.rpc("get_wire_instructions", {
        p_offering_id: offeringId,
      });
      const details = (((wireRows ?? []) as any[])[0]?.details ?? {}) as Record<string, unknown>;
      hasWireInstructions = Boolean(
        String(details["bank_name"] ?? "").trim() && String(details["account_number"] ?? "").trim(),
      );
    } catch {
      hasWireInstructions = false;
    }

    let entity: {
      hasEin: boolean;
      einApproved: boolean;
      ss4GeneratedAt: string | null;
      ss4Approved: boolean;
    } = { hasEin: false, einApproved: false, ss4GeneratedAt: null, ss4Approved: false };
    try {
      const { data: entityRows } = await supabase.rpc("get_offering_entity_details", {
        p_offering_id: offeringId,
      });
      const row = (entityRows ?? [])[0] ?? null;
      if (row) {
        entity = {
          hasEin: Boolean(row.has_ein && String(row.ein ?? "").trim()),
          einApproved: (row.ein_review_status ?? "pending") === "approved",
          ss4GeneratedAt: (row.ss4_generated_at as string | null) ?? null,
          ss4Approved: (row.ss4_review_status ?? "pending") === "approved",
        };
      }
    } catch {
      // Operations has not shared these details yet.
    }

    const bank = ((bankRes as any).data ?? [])[0] ?? null;
    const room = (roomRes as any).data ?? null;
    const memo = (memoRes as any).data ?? null;
    const statement = (statementRes as any).data ?? null;
    const timeline = ((timelineRes as any).data ?? []) as any[];
    const taxDocuments = ((taxRes as any).data ?? []) as any[];
    const invitedCount = ((accessRes as any).data ?? []).length;

    const signable = documents.filter((d) => d.requires_signature);
    const roomCategories = [...new Set(roomDocuments.map((d) => String(d.category ?? "Other")))];

    const fundOf = (o: any) => ({
      basics:
        Boolean(o.name) &&
        Number(o.min_investment_cents ?? 0) > 0 &&
        Number(o.target_raise_cents ?? 0) > 0,
    });

    const dateFmt = (v?: string | null) =>
      v ? new Date(v).toLocaleDateString("en-US", { dateStyle: "medium" }) : "";

    const steps: Step[] = [
      {
        key: "basics",
        label: "Fund basics",
        done: fundOf(offering).basics,
        detail: fundOf(offering).basics
          ? `${(offering as any).reg_type === "506c" ? "506(c)" : "506(b)"} · minimum $${(
              Number((offering as any).min_investment_cents ?? 0) / 100
            ).toLocaleString("en-US")} · target $${(
              Number((offering as any).target_raise_cents ?? 0) / 100
            ).toLocaleString("en-US")}`
          : "Add the minimum investment and target raise",
        href: "/admin/setup",
      },
      {
        key: "entity",
        label: "Legal entity",
        done: Boolean(
          (offering as any).legal_entity_name &&
            (offering as any).entity_type &&
            (offering as any).state_formed,
        ),
        detail: (offering as any).legal_entity_name
          ? [
              (offering as any).legal_entity_name,
              (offering as any).entity_type,
              (offering as any).state_formed,
              dateFmt((offering as any).date_formed),
            ]
              .filter(Boolean)
              .join(" · ")
          : "Add the legal name, entity type, state and date formed",
        href: "/admin/setup",
      },
      {
        key: "tax-id",
        label: "Tax ID",
        done: (entity.hasEin && entity.einApproved) || entity.ss4Approved,
        detail: entity.hasEin
          ? entity.einApproved
            ? "EIN on file"
            : "EIN entered, with operations for review"
          : entity.ss4GeneratedAt
            ? entity.ss4Approved
              ? `Form SS-4 approved ${dateFmt(entity.ss4GeneratedAt)}`
              : "Form SS-4 generated, with operations for review"
            : "Enter the EIN, or fill out Form SS-4",
        href: "/admin/setup",
      },
      {
        key: "bank",
        label: "Bank account",
        done: hasWireInstructions,
        detail: hasWireInstructions
          ? "Wire instructions saved"
          : bank
            ? `Setup requested with ${bank.bank} · ${String(bank.status ?? "requested").replace(/_/g, " ")}`
            : "Add wire instructions, or ask Harmonious to open the account",
        href: "/admin/wire",
      },
      {
        key: "documents",
        label: "Fund documents",
        done: signable.length > 0,
        detail: signable.length
          ? `${signable.length} document${signable.length === 1 ? "" : "s"} investors sign`
          : "Add at least one document investors must sign",
        href: "/manager/documents",
      },
      {
        key: "memo",
        label: "Offering memo",
        done: Boolean(memo?.is_published),
        detail: memo
          ? memo.is_published
            ? `Published ${dateFmt(memo.published_at)}`
            : "Drafted, not published yet"
          : "Write the fund's story for investors",
        href: "/manager/memo",
      },
      {
        key: "statement",
        label: "Offering terms",
        done: Boolean(statement?.is_published),
        detail: statement
          ? statement.is_published
            ? `Published ${dateFmt(statement.published_at)}`
            : "Drafted, not published yet"
          : "Enter the fund's terms",
        href: "/manager/offering-statement",
      },
      {
        key: "room",
        label: "Diligence room",
        done: Boolean(room) && roomDocuments.length > 0,
        detail: room
          ? roomDocuments.length
            ? `${roomDocuments.length} file${roomDocuments.length === 1 ? "" : "s"} across ${roomCategories.length} section${roomCategories.length === 1 ? "" : "s"}`
            : "Room created, no materials uploaded yet"
          : "Create the room and upload fund materials",
        href: "/manager/diligence",
      },
      {
        key: "timeline",
        label: "Key dates",
        done: timeline.length > 0,
        detail: timeline.length
          ? `${timeline.length} date${timeline.length === 1 ? "" : "s"} set`
          : "Add closing, wire deadline and launch dates",
        href: "/manager/timeline",
      },
      {
        key: "investors",
        label: "Investors invited",
        done: invitedCount > 0 || applications.length > 0,
        detail:
          invitedCount > 0 || applications.length > 0
            ? `${applications.length} application${applications.length === 1 ? "" : "s"} · ${invitedCount} invited`
            : "Invite your first investor",
        href: "/manager/investors",
      },
    ];

    const doneCount = steps.filter((s) => s.done).length;

    // Documents investors sign, with signature counts.
    const signedByDoc = new Map<string, number>();
    for (const sig of signatures) {
      if (!sig.signed_at) continue;
      const key = sig.offering_document_id as string;
      signedByDoc.set(key, (signedByDoc.get(key) ?? 0) + 1);
    }

    const fundDocuments = documents.map((d) => ({
      id: d.id as string,
      title: d.title as string,
      docType: d.doc_type as string,
      requiresSignature: Boolean(d.requires_signature),
      fileName: (d.file_name as string | null) ?? null,
      hasFile: Boolean(d.file_path),
      version: (d.current_version as number | null) ?? 1,
      updatedAt: (d.file_updated_at as string | null) ?? (d.created_at as string),
      templatePack: (d.template_pack as string | null) ?? null,
      signedCount: signedByDoc.get(d.id as string) ?? 0,
    }));

    const signedCopies = signatures
      .filter((s) => s.signed_at)
      .sort((a, b) => String(b.signed_at).localeCompare(String(a.signed_at)))
      .slice(0, 25)
      .map((s) => ({
        id: s.id as string,
        applicationId: s.application_id as string,
        documentTitle:
          documents.find((d) => d.id === s.offering_document_id)?.title ?? "Fund document",
        signedAt: s.signed_at as string,
        filedAt: (s.box_uploaded_at as string | null) ?? null,
      }));

    // Investor applications.
    const wiresByApp = new Map<string, any[]>();
    for (const w of wires) {
      const list = wiresByApp.get(w.application_id as string) ?? [];
      list.push(w);
      wiresByApp.set(w.application_id as string, list);
    }
    const paymentsByApp = new Map<string, any[]>();
    for (const p of payments) {
      const list = paymentsByApp.get(p.application_id as string) ?? [];
      list.push(p);
      paymentsByApp.set(p.application_id as string, list);
    }
    const signedByApp = new Map<string, number>();
    for (const s of signatures) {
      if (!s.signed_at) continue;
      signedByApp.set(
        s.application_id as string,
        (signedByApp.get(s.application_id as string) ?? 0) + 1,
      );
    }

    function stageOf(app: any) {
      if (app.funding_status === "settled") return "complete";
      if (app.kyc_status !== "approved" || app.aml_status !== "approved") return "identity";
      if (app.accreditation_status !== "approved") return "accreditation";
      if (app.documents_status !== "approved") return "documents";
      return "funding";
    }

    let committedCents = 0;
    let receivedCents = 0;
    let inTransitCents = 0;

    const rows = applications.map((app) => {
      const profile = profileMap.get(app.user_id) as any;
      const persona = app.persona_id ? (personaMap.get(app.persona_id) as any) : null;
      const appWires = wiresByApp.get(app.id as string) ?? [];
      const appPayments = paymentsByApp.get(app.id as string) ?? [];
      const settled = appPayments
        .filter((p) => p.status === "settled")
        .reduce((sum, p) => sum + (p.amount_cents ?? 0), 0);
      const inFlight = appPayments
        .filter((p) => p.status === "processing" || p.status === "awaiting_wire")
        .reduce((sum, p) => sum + (p.amount_cents ?? 0), 0);
      committedCents += app.commitment_cents ?? 0;
      receivedCents += settled;
      inTransitCents += inFlight;
      const latestWire = appWires
        .slice()
        .sort((a, b) => String(b.created_at ?? "").localeCompare(String(a.created_at ?? "")))[0];
      return {
        applicationId: app.id as string,
        name: (profile?.legal_name as string) ?? (profile?.email as string) ?? "Investor",
        email: (profile?.email as string) ?? null,
        accountLabel:
          (persona?.label as string) ?? (profile?.investor_type as string) ?? "individual",
        commitmentCents: (app.commitment_cents as number | null) ?? 0,
        stage: stageOf(app),
        kycStatus: app.kyc_status as string,
        amlStatus: app.aml_status as string,
        accreditationStatus: app.accreditation_status as string,
        documentsStatus: app.documents_status as string,
        fundingStatus: app.funding_status as string,
        managerReviewStatus: (app.manager_review_status as string | null) ?? "not_started",
        signedCount: signedByApp.get(app.id as string) ?? 0,
        requiredSignatures: signable.length,
        wireStatus: (latestWire?.status as string | null) ?? null,
        receivedCents: settled,
        updatedAt: app.updated_at as string,
      };
    });

    const stageCounts = {
      total: rows.length,
      identity: rows.filter((r) => r.stage === "identity").length,
      accreditation: rows.filter((r) => r.stage === "accreditation").length,
      documents: rows.filter((r) => r.stage === "documents").length,
      funding: rows.filter((r) => r.stage === "funding").length,
      complete: rows.filter((r) => r.stage === "complete").length,
    };

    return {
      isAdmin,
      fund: {
        id: offering.id as string,
        name: offering.name as string,
        slug: offering.slug as string,
        regType: offering.reg_type as string,
        isOpen: Boolean((offering as any).is_open),
        summary: ((offering as any).summary as string | null) ?? null,
        legalEntityName: ((offering as any).legal_entity_name as string | null) ?? null,
        fundType: ((offering as any).fund_type as string | null) ?? null,
        entityType: ((offering as any).entity_type as string | null) ?? null,
        stateFormed: ((offering as any).state_formed as string | null) ?? null,
        dateFormed: ((offering as any).date_formed as string | null) ?? null,
        minInvestmentCents: Number((offering as any).min_investment_cents ?? 0),
        targetRaiseCents: Number((offering as any).target_raise_cents ?? 0),
        sharePriceCents: Number((offering as any).share_price_cents ?? 0),
        publicPageEnabled: Boolean((offering as any).public_page_enabled),
      },
      progress: { steps, done: doneCount, total: steps.length },
      documents: {
        fund: fundDocuments,
        room: roomDocuments.map((d) => ({
          id: d.id as string,
          category: (d.category as string) ?? "Other",
          title: (d.title as string) ?? (d.file_name as string) ?? "Document",
          fileName: (d.file_name as string | null) ?? null,
          uploadedAt: (d.uploaded_at as string | null) ?? null,
          version: (d.version as number | null) ?? 1,
          visibility: (d.visibility as string | null) ?? "all",
        })),
        signedCopies,
        tax: taxDocuments.map((t) => ({
          id: t.id as string,
          docType: t.doc_type as string,
          taxYear: (t.tax_year as number | null) ?? null,
          fileName: (t.file_name as string | null) ?? null,
          reviewedAt: (t.reviewed_at as string | null) ?? null,
        })),
      },
      applications: rows,
      counts: stageCounts,
      totals: {
        committedCents,
        receivedCents,
        inTransitCents,
        targetRaiseCents: Number((offering as any).target_raise_cents ?? 0),
      },
    };
  });

/** Setup completion per fund, for the manager panel's fund cards. */
export const getManagerFundProgress = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const { data: roles, error } = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", userId)
      .in("role", ["admin", "fund_manager"]);
    if (error) throw new Error(error.message);
    const list = (roles ?? []).map((r: any) => r.role as string);
    if (list.length === 0) throw new Error("Forbidden: reviewer access required.");
    const isAdmin = list.includes("admin");

    let offeringIds: string[] | null = null;
    if (!isAdmin) {
      const { data: assignments } = await supabase
        .from("fund_managers")
        .select("offering_id")
        .eq("user_id", userId);
      offeringIds = [...new Set((assignments ?? []).map((a: any) => a.offering_id as string))];
      if (offeringIds.length === 0) return { funds: [] as any[] };
    }

    let query = supabase
      .from("offerings")
      .select(
        "id, legal_entity_name, entity_type, state_formed, min_investment_cents, target_raise_cents",
      )
      .order("name");
    if (offeringIds) query = query.in("id", offeringIds);
    const { data: offerings, error: offeringsError } = await query;
    if (offeringsError) throw new Error(offeringsError.message);

    const ids = (offerings ?? []).map((o: any) => o.id as string);
    if (ids.length === 0) return { funds: [] as any[] };

    const [docsRes, roomsRes, memosRes, statementsRes, timelineRes] = await Promise.all([
      supabase
        .from("offering_documents")
        .select("offering_id, requires_signature")
        .in("offering_id", ids)
        .eq("requires_signature", true)
        .limit(1000),
      supabase.from("diligence_documents").select("offering_id").in("offering_id", ids).limit(2000),
      supabase
        .from("offering_memos")
        .select("offering_id, is_published")
        .in("offering_id", ids)
        .limit(500),
      supabase
        .from("offering_statements")
        .select("offering_id, is_published")
        .in("offering_id", ids)
        .limit(500),
      supabase
        .from("offering_timeline_events")
        .select("offering_id")
        .in("offering_id", ids)
        .limit(2000),
    ]);

    const has = (rows: any[] | null | undefined, id: string, extra?: (r: any) => boolean) =>
      (rows ?? []).some((r) => r.offering_id === id && (!extra || extra(r)));

    return {
      funds: (offerings ?? []).map((o: any) => {
        const checks = [
          Number(o.min_investment_cents ?? 0) > 0 && Number(o.target_raise_cents ?? 0) > 0,
          Boolean(o.legal_entity_name && o.entity_type && o.state_formed),
          has(docsRes.data as any[], o.id),
          has(roomsRes.data as any[], o.id),
          has(memosRes.data as any[], o.id, (r) => Boolean(r.is_published)),
          has(statementsRes.data as any[], o.id, (r) => Boolean(r.is_published)),
          has(timelineRes.data as any[], o.id),
        ];
        const done = checks.filter(Boolean).length;
        return {
          id: o.id as string,
          done,
          total: checks.length,
          percent: Math.round((done / checks.length) * 100),
        };
      }),
    };
  });
