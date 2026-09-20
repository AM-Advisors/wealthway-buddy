/**
 * Server side of the four Operations record pages.
 *
 * Every function here composes records that already exist — clients, funds,
 * onboarding, positions, capital, accounting, tax, cap table, banking and the
 * audit trails. Nothing is stored, no balance is recalculated, no status is
 * invented. Each call re-checks the staff capability for the area it serves,
 * so reaching a record from another record grants nothing.
 */

import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { requireOperations } from "@/lib/ops-access.functions";
import type { OpsCapability } from "@/lib/ops-capabilities";
import {
  RECORD_AREA,
  bankingDetailVisible,
  canOpenRecord,
  maskAccount,
  redactActivity,
  tabDefinition,
  type OpsRecordType,
} from "@/lib/ops-records";

const NOT_FOUND = "Not found.";

const idInput = z.object({ id: z.string().uuid() });
const tabInput = z.object({ id: z.string().uuid(), tab: z.string().min(1).max(40) });

/** Capability gate shared by every record read. */
async function gateRecord(context: any, type: OpsRecordType) {
  const { capabilities } = await requireOperations(context, RECORD_AREA[type], "see");
  if (!canOpenRecord(type, capabilities)) throw new Error("Forbidden: you don't have that permission.");
  return capabilities;
}

/** Capability gate for one tab. An unknown tab is refused before any read. */
async function gateTab(context: any, type: OpsRecordType, tab: string) {
  const capabilities = await gateRecord(context, type);
  const definition = tabDefinition(type, tab);
  if (!definition) throw new Error(NOT_FOUND);
  if (!capabilities.includes(`${definition.area}:see` as OpsCapability)) {
    throw new Error("Forbidden: you don't have that permission.");
  }
  return capabilities;
}

const rows = <T = any>(res: { data: any; error: any }): T[] => {
  if (res.error) throw new Error(res.error.message);
  return (res.data ?? []) as T[];
};

const sum = (list: any[], key: string) =>
  list.reduce((total, row) => total + Number(row?.[key] ?? 0), 0);

async function namesFor(supabase: any, userIds: string[]) {
  const unique = [...new Set(userIds.filter(Boolean))];
  if (!unique.length) return new Map<string, string>();
  const people = rows(
    await supabase.from("profiles").select("user_id, legal_name, email").in("user_id", unique),
  );
  return new Map<string, string>(
    people.map((p: any) => [p.user_id, p.legal_name || p.email || "Unnamed person"]),
  );
}

function activityFrom(
  list: any[],
  map: (row: any) => { at: string; actor: string; capacity: string; action: string; resource: string; detail?: unknown },
) {
  return list.map((row) => redactActivity(map(row) as any));
}

/* ------------------------------------------------------------------ lists */

export const listOpsRecords = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) =>
    z.object({ type: z.enum(["client", "fund", "investor", "company"]), search: z.string().max(80).optional() }).parse(data),
  )
  .handler(async ({ context, data }) => {
    await gateRecord(context, data.type);
    const s = context.supabase;
    const like = data.search ? `%${data.search}%` : null;

    if (data.type === "client") {
      let q = s.from("clients").select("id, name, legal_name, status").order("name").limit(100);
      if (like) q = q.ilike("name", like);
      return { records: rows(await q).map((c: any) => ({ id: c.id, title: c.name, subtitle: c.legal_name, status: c.status })) };
    }
    if (data.type === "fund") {
      let q = s.from("offerings").select("id, name, legal_entity_name, reg_type, is_open").order("name").limit(100);
      if (like) q = q.ilike("name", like);
      return {
        records: rows(await q).map((f: any) => ({
          id: f.id,
          title: f.name,
          subtitle: f.legal_entity_name ?? f.reg_type,
          status: f.is_open ? "Open" : "Closed",
        })),
      };
    }
    if (data.type === "company") {
      let q = s.from("ct_companies").select("id, name, legal_name, entity_type").order("name").limit(100);
      if (like) q = q.ilike("name", like);
      return { records: rows(await q).map((c: any) => ({ id: c.id, title: c.name, subtitle: c.legal_name, status: c.entity_type })) };
    }
    let q = s
      .from("profiles")
      .select("user_id, legal_name, email, investor_type")
      .order("legal_name")
      .limit(100);
    if (like) q = q.ilike("legal_name", like);
    return {
      records: rows(await q).map((p: any) => ({
        id: p.user_id,
        title: p.legal_name || p.email || "Unnamed person",
        subtitle: p.email,
        status: p.investor_type,
      })),
    };
  });

/* --------------------------------------------------------------- client 360 */

export const getOpsClientRecord = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => idInput.parse(data))
  .handler(async ({ context, data }) => {
    const capabilities = await gateRecord(context, "client");
    const s = context.supabase;
    const { data: client, error } = await s
      .from("clients")
      .select("id, name, legal_name, status, primary_contact_name, primary_contact_email, created_at")
      .eq("id", data.id)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!client) throw new Error(NOT_FOUND);

    const [entities, funds, companies] = await Promise.all([
      s.from("client_entities").select("id, legal_name, entity_type, status").eq("client_id", data.id),
      s.from("offerings").select("id, name, is_open").eq("client_id", data.id),
      s.from("ct_companies").select("id, name").eq("client_id", data.id),
    ]);

    return {
      capabilities,
      record: {
        id: client.id,
        title: client.name,
        subtitle: client.legal_name,
        status: client.status,
        contact: client.primary_contact_name,
        contactEmail: client.primary_contact_email,
        since: client.created_at,
        entityCount: rows(entities).length,
        fundCount: rows(funds).length,
        companyCount: rows(companies).length,
      },
    };
  });

export const getOpsClientTab = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => tabInput.parse(data))
  .handler(async ({ context, data }) => {
    await gateTab(context, "client", data.tab);
    const s = context.supabase;
    const { data: exists } = await s.from("clients").select("id").eq("id", data.id).maybeSingle();
    if (!exists) throw new Error(NOT_FOUND);

    if (data.tab === "overview" || data.tab === "relationships") {
      const [entities, people, funds, companies, engagements] = await Promise.all([
        s.from("client_entities").select("id, legal_name, entity_type, status, jurisdiction").eq("client_id", data.id),
        s.from("client_users").select("user_id, client_role, can_approve").eq("client_id", data.id),
        s.from("offerings").select("id, name, reg_type, is_open").eq("client_id", data.id),
        s.from("ct_companies").select("id, name, entity_type").eq("client_id", data.id),
        s.from("client_engagements").select("id, title, delivery_status, effective_date").eq("client_id", data.id),
      ]);
      const peopleRows = rows(people);
      const names = await namesFor(s, peopleRows.map((p: any) => p.user_id));
      return {
        entities: rows(entities),
        people: peopleRows.map((p: any) => ({
          userId: p.user_id,
          name: names.get(p.user_id) ?? "Unnamed person",
          role: p.client_role,
          canApprove: p.can_approve,
        })),
        funds: rows(funds),
        companies: rows(companies),
        engagements: rows(engagements),
      };
    }

    if (data.tab === "funds") {
      return { funds: rows(await s.from("offerings").select("id, name, reg_type, is_open, target_raise_cents").eq("client_id", data.id)) };
    }
    if (data.tab === "companies") {
      return { companies: rows(await s.from("ct_companies").select("id, name, legal_name, entity_type").eq("client_id", data.id)) };
    }
    if (data.tab === "investors") {
      const funds = rows(await s.from("offerings").select("id, name").eq("client_id", data.id));
      const fundIds = funds.map((f: any) => f.id);
      if (!fundIds.length) return { investors: [] };
      const positions = rows(
        await s
          .from("investor_positions")
          .select("id, offering_id, display_name, capacity, status, investment_profile_id")
          .in("offering_id", fundIds)
          .limit(200),
      );
      const fundName = new Map(funds.map((f: any) => [f.id, f.name]));
      return {
        investors: positions.map((p: any) => ({ ...p, fundName: fundName.get(p.offering_id) })),
      };
    }
    if (data.tab === "documents") {
      const funds = rows(await s.from("offerings").select("id").eq("client_id", data.id));
      const fundIds = funds.map((f: any) => f.id);
      const docs = fundIds.length
        ? rows(
            await s
              .from("fund_setup_documents")
              .select("id, doc_type, file_name, status, created_at, setup_id")
              .limit(100),
          )
        : [];
      return { documents: docs };
    }
    if (data.tab === "tasks") {
      const funds = rows(await s.from("offerings").select("id").eq("client_id", data.id));
      const fundIds = funds.map((f: any) => f.id);
      const items = fundIds.length
        ? rows(
            await s
              .from("fund_compliance_items")
              .select("id, label, category, status, due_date, offering_id")
              .in("offering_id", fundIds)
              .neq("status", "complete")
              .limit(100),
          )
        : [];
      return { tasks: items };
    }

    // activity
    const log = rows(
      await s
        .from("ai_action_log")
        .select("created_at, actor_role, feature, action, summary, actor_id")
        .eq("client_id", data.id)
        .order("created_at", { ascending: false })
        .limit(50),
    );
    const names = await namesFor(s, log.map((l: any) => l.actor_id));
    return {
      activity: activityFrom(log, (row) => ({
        at: row.created_at,
        actor: names.get(row.actor_id) ?? "Harmonious",
        capacity: row.actor_role ?? "staff",
        action: `${row.feature}: ${row.action}`,
        resource: "client",
        detail: { summary: row.summary },
      })),
    };
  });

/* ----------------------------------------------------------------- fund 360 */

export const getOpsFundRecord = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => idInput.parse(data))
  .handler(async ({ context, data }) => {
    const capabilities = await gateRecord(context, "fund");
    const s = context.supabase;
    const { data: fund, error } = await s
      .from("offerings")
      .select("id, name, legal_entity_name, reg_type, fund_type, is_open, client_id, entity_type, state_formed")
      .eq("id", data.id)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!fund) throw new Error(NOT_FOUND);

    const [setup, onboardings, positions, client] = await Promise.all([
      s.from("fund_setups").select("stage, launch_state, investment_strategy, target_size_cents, domicile").eq("offering_id", data.id).maybeSingle(),
      s.from("investor_onboardings").select("accepted_amount_cents, funded_amount_cents").eq("offering_id", data.id),
      s.from("investor_positions").select("id").eq("offering_id", data.id).eq("status", "active"),
      fund.client_id
        ? s.from("clients").select("id, name").eq("id", fund.client_id).maybeSingle()
        : Promise.resolve({ data: null, error: null }),
    ]);
    const onboardingRows = rows(onboardings);

    return {
      capabilities,
      record: {
        id: fund.id,
        title: fund.name,
        subtitle: fund.legal_entity_name,
        regType: fund.reg_type,
        fundType: fund.fund_type,
        entityType: fund.entity_type,
        domicile: (setup as any)?.data?.domicile ?? fund.state_formed,
        strategy: (setup as any)?.data?.investment_strategy ?? null,
        stage: (setup as any)?.data?.stage ?? null,
        launchState: (setup as any)?.data?.launch_state ?? null,
        status: fund.is_open ? "Open" : "Closed",
        clientId: (client as any)?.data?.id ?? null,
        clientName: (client as any)?.data?.name ?? null,
        acceptedCents: sum(onboardingRows, "accepted_amount_cents"),
        fundedCents: sum(onboardingRows, "funded_amount_cents"),
        investorCount: rows(positions).length,
      },
    };
  });

export const getOpsFundTab = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => tabInput.parse(data))
  .handler(async ({ context, data }) => {
    const capabilities = await gateTab(context, "fund", data.tab);
    const s = context.supabase;
    const { data: fund } = await s.from("offerings").select("id, name").eq("id", data.id).maybeSingle();
    if (!fund) throw new Error(NOT_FOUND);

    if (data.tab === "overview") {
      const [nav, books, reports, compliance] = await Promise.all([
        s
          .from("nav_versions")
          .select("as_of_date, status, net_asset_value_cents, cash_cents, published_at")
          .eq("offering_id", data.id)
          .order("as_of_date", { ascending: false })
          .limit(1),
        s.from("ledger_books").select("id, name, basis").eq("offering_id", data.id),
        s
          .from("financial_reports")
          .select("id, report_type, status, period_end")
          .eq("offering_id", data.id)
          .order("period_end", { ascending: false })
          .limit(5),
        s
          .from("fund_compliance_items")
          .select("id, label, status, due_date")
          .eq("offering_id", data.id)
          .neq("status", "complete")
          .order("due_date")
          .limit(10),
      ]);
      const bookIds = rows(books).map((b: any) => b.id);
      const periods = bookIds.length
        ? rows(
            await s
              .from("accounting_periods")
              .select("label, status, period_end")
              .in("book_id", bookIds)
              .order("period_end", { ascending: false })
              .limit(3),
          )
        : [];
      return {
        nav: rows(nav)[0] ?? null,
        periods,
        reports: rows(reports),
        outstanding: rows(compliance),
      };
    }

    if (data.tab === "investors") {
      const onboardings = rows(
        await s
          .from("investor_onboardings")
          .select(
            "id, investor_user_id, investment_profile_id, stage, funding_status, requested_amount_cents, accepted_amount_cents, funded_amount_cents, position_id",
          )
          .eq("offering_id", data.id)
          .limit(300),
      );
      const profileIds = [...new Set(onboardings.map((o: any) => o.investment_profile_id).filter(Boolean))];
      const profiles = profileIds.length
        ? rows(await s.from("investment_profiles").select("id, display_label, profile_type, status").in("id", profileIds))
        : [];
      const profileById = new Map(profiles.map((p: any) => [p.id, p]));
      const names = await namesFor(s, onboardings.map((o: any) => o.investor_user_id));
      return {
        investors: onboardings.map((o: any) => ({
          onboardingId: o.id,
          investorUserId: o.investor_user_id,
          person: names.get(o.investor_user_id) ?? "Unnamed person",
          profileId: o.investment_profile_id,
          profileLabel: profileById.get(o.investment_profile_id)?.display_label ?? null,
          profileType: profileById.get(o.investment_profile_id)?.profile_type ?? null,
          stage: o.stage,
          fundingStatus: o.funding_status,
          requestedCents: o.requested_amount_cents,
          acceptedCents: o.accepted_amount_cents,
          fundedCents: o.funded_amount_cents,
        })),
      };
    }

    if (data.tab === "investments") {
      const assets = rows(
        await s
          .from("fund_target_assets")
          .select("id, name, asset_class, status, amount_cents")
          .eq("offering_id", data.id)
          .limit(100)
          .then((r: any) => r)
          .catch(() => ({ data: [], error: null })),
      );
      const valuations = rows(
        await s
          .from("asset_valuations")
          .select("id, as_of_date, status, fair_value_cents")
          .eq("offering_id", data.id)
          .order("as_of_date", { ascending: false })
          .limit(20),
      );
      return { assets, valuations };
    }

    if (data.tab === "capital") {
      const [calls, expected, accounts] = await Promise.all([
        s
          .from("capital_calls")
          .select("id, call_number, version, status, due_date, total_called_cents, total_received_cents")
          .eq("offering_id", data.id)
          .order("call_number", { ascending: false })
          .limit(25),
        s
          .from("expected_fundings")
          .select("id, expected_amount_cents, received_amount_cents, status, expected_by")
          .eq("offering_id", data.id)
          .limit(100),
        s
          .from("capital_accounts")
          .select("id, ending_capital_cents, unfunded_commitment_cents, status, period_end")
          .eq("offering_id", data.id)
          .order("period_end", { ascending: false })
          .limit(50),
      ]);
      const accountRows = rows(accounts);
      return {
        calls: rows(calls),
        expected: rows(expected),
        capitalAccounts: accountRows,
        totals: {
          endingCapitalCents: sum(accountRows, "ending_capital_cents"),
          unfundedCents: sum(accountRows, "unfunded_commitment_cents"),
        },
      };
    }

    if (data.tab === "banking") {
      const detail = bankingDetailVisible(capabilities);
      const [accounts, transactions] = await Promise.all([
        s.from("bank_accounts").select("id, institution_name, account_name, account_mask, status, last_synced_at").eq("offering_id", data.id),
        s
          .from("bank_transactions")
          .select("id, posted_on, amount_cents, name, matched_application_id")
          .eq("offering_id", data.id)
          .order("posted_on", { ascending: false })
          .limit(25),
      ]);
      return {
        detailVisible: detail,
        accounts: rows(accounts).map((a: any) => ({
          id: a.id,
          institution: a.institution_name,
          accountName: detail ? a.account_name : null,
          mask: detail ? maskAccount(a.account_mask) : null,
          status: a.status,
          lastSynced: a.last_synced_at,
        })),
        transactions: detail ? rows(transactions) : [],
      };
    }

    if (data.tab === "accounting") {
      const books = rows(await s.from("ledger_books").select("id, name, basis, is_active").eq("offering_id", data.id));
      const bookIds = books.map((b: any) => b.id);
      const [periods, journals, navs, allocations] = await Promise.all([
        bookIds.length
          ? s.from("accounting_periods").select("id, label, status, period_end").in("book_id", bookIds).order("period_end", { ascending: false }).limit(12)
          : Promise.resolve({ data: [], error: null }),
        bookIds.length
          ? s.from("journal_entries").select("id, entry_no, entry_date, status, memo").in("book_id", bookIds).order("entry_date", { ascending: false }).limit(25)
          : Promise.resolve({ data: [], error: null }),
        s.from("nav_versions").select("id, as_of_date, status, net_asset_value_cents").eq("offering_id", data.id).order("as_of_date", { ascending: false }).limit(10),
        s.from("allocation_runs").select("id, status, period_end").eq("offering_id", data.id).order("period_end", { ascending: false }).limit(10),
      ]);
      return {
        books,
        periods: rows(periods),
        journals: rows(journals),
        navs: rows(navs),
        allocations: rows(allocations),
      };
    }

    if (data.tab === "tax") {
      const [documents, k1s] = await Promise.all([
        s.from("fund_tax_documents").select("id, doc_type, tax_year, review_status, file_name, created_at").eq("offering_id", data.id).order("created_at", { ascending: false }).limit(50),
        s.from("k1_forms").select("id, tax_year, status, version, investor_user_id").eq("offering_id", data.id).order("tax_year", { ascending: false }).limit(50),
      ]);
      return { documents: rows(documents), k1s: rows(k1s) };
    }

    if (data.tab === "regulatory") {
      const [items, setup] = await Promise.all([
        s.from("fund_compliance_items").select("id, key, label, category, status, due_date, filed_on, reference").eq("offering_id", data.id).order("due_date"),
        s.from("fund_setups").select("id, regulatory_structure").eq("offering_id", data.id).maybeSingle(),
      ]);
      const setupId = (setup as any)?.data?.id;
      const configs = setupId
        ? rows(await s.from("fund_regulatory_configs").select("id, version, status, locked_at, reviewed_at").eq("setup_id", setupId).order("version", { ascending: false }))
        : [];
      return {
        filings: rows(items),
        regulatoryStructure: (setup as any)?.data?.regulatory_structure ?? null,
        configs,
        gaps: rows(items).length === 0 ? ["No authoritative filing records exist for this fund yet."] : [],
      };
    }

    if (data.tab === "documents") {
      const setup = await s.from("fund_setups").select("id").eq("offering_id", data.id).maybeSingle();
      const setupId = (setup as any)?.data?.id;
      const documents = setupId
        ? rows(await s.from("fund_setup_documents").select("id, doc_type, file_name, status, created_at").eq("setup_id", setupId).order("created_at", { ascending: false }).limit(100))
        : [];
      return { documents };
    }

    const setup = await s.from("fund_setups").select("id").eq("offering_id", data.id).maybeSingle();
    const setupId = (setup as any)?.data?.id;
    const events = setupId
      ? rows(await s.from("fund_setup_events").select("*").eq("setup_id", setupId).order("created_at", { ascending: false }).limit(50))
      : [];
    const names = await namesFor(s, events.map((e: any) => e.actor_id ?? e.created_by));
    return {
      activity: activityFrom(events, (row) => ({
        at: row.created_at,
        actor: names.get(row.actor_id ?? row.created_by) ?? "Harmonious",
        capacity: row.actor_role ?? "staff",
        action: row.event_type ?? row.kind ?? "event",
        resource: "fund",
        detail: { note: row.note ?? row.summary ?? null },
      })),
    };
  });

/* ------------------------------------------------------------- investor 360 */

export const getOpsInvestorRecord = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => idInput.parse(data))
  .handler(async ({ context, data }) => {
    const capabilities = await gateRecord(context, "investor");
    const s = context.supabase;
    const { data: person, error } = await s
      .from("profiles")
      .select("user_id, legal_name, email, investor_type, country, created_at")
      .eq("user_id", data.id)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!person) throw new Error(NOT_FOUND);

    const [profiles, positions, onboardings] = await Promise.all([
      s.from("investment_profiles").select("id").eq("owner_user_id", data.id),
      s.from("investor_positions").select("id").eq("investor_user_id", data.id).eq("status", "active"),
      s.from("investor_onboardings").select("accepted_amount_cents, funded_amount_cents, stage").eq("investor_user_id", data.id),
    ]);
    const onboardingRows = rows(onboardings);
    return {
      capabilities,
      record: {
        id: person.user_id,
        title: person.legal_name || person.email || "Unnamed person",
        subtitle: person.email,
        investorType: person.investor_type,
        country: person.country,
        since: person.created_at,
        profileCount: rows(profiles).length,
        investmentCount: rows(positions).length,
        acceptedCents: sum(onboardingRows, "accepted_amount_cents"),
        fundedCents: sum(onboardingRows, "funded_amount_cents"),
        openOnboardings: onboardingRows.filter((o: any) => o.stage && o.stage !== "closed").length,
      },
    };
  });

export const getOpsInvestorTab = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => tabInput.parse(data))
  .handler(async ({ context, data }) => {
    await gateTab(context, "investor", data.tab);
    const s = context.supabase;
    const { data: person } = await s.from("profiles").select("user_id").eq("user_id", data.id).maybeSingle();
    if (!person) throw new Error(NOT_FOUND);

    const profileRows = rows(
      await s
        .from("investment_profiles")
        .select("id, display_label, legal_name, profile_type, status, created_at")
        .eq("owner_user_id", data.id),
    );

    if (data.tab === "overview" || data.tab === "profiles") {
      const applications = rows(
        await s
          .from("investor_applications")
          .select("id, offering_id, status, kyc_status, aml_status, accreditation_status, commitment_cents")
          .eq("user_id", data.id)
          .limit(50),
      );
      return {
        profiles: profileRows,
        checks: applications.map((a: any) => ({
          applicationId: a.id,
          offeringId: a.offering_id,
          status: a.status,
          kyc: a.kyc_status,
          aml: a.aml_status,
          accreditation: a.accreditation_status,
        })),
      };
    }

    if (data.tab === "investments") {
      const onboardings = rows(
        await s
          .from("investor_onboardings")
          .select("id, offering_id, investment_profile_id, stage, funding_status, accepted_amount_cents, funded_amount_cents")
          .eq("investor_user_id", data.id)
          .limit(100),
      );
      const fundIds = [...new Set(onboardings.map((o: any) => o.offering_id))];
      const funds = fundIds.length ? rows(await s.from("offerings").select("id, name").in("id", fundIds)) : [];
      const fundName = new Map(funds.map((f: any) => [f.id, f.name]));
      const profileLabel = new Map(profileRows.map((p: any) => [p.id, p.display_label]));
      return {
        investments: onboardings.map((o: any) => ({
          ...o,
          fundName: fundName.get(o.offering_id) ?? null,
          profileLabel: profileLabel.get(o.investment_profile_id) ?? null,
        })),
      };
    }

    if (data.tab === "capital") {
      const accounts = rows(
        await s
          .from("capital_accounts")
          .select("id, offering_id, investment_profile_id, period_end, ending_capital_cents, unfunded_commitment_cents, status")
          .eq("investor_user_id", data.id)
          .order("period_end", { ascending: false })
          .limit(100),
      );
      const lines = rows(
        await s
          .from("capital_call_lines")
          .select("id, offering_id, called_cents, received_cents, status, due_date")
          .eq("investor_user_id", data.id)
          .limit(100),
      );
      return { capitalAccounts: accounts, callLines: lines };
    }

    if (data.tab === "tax") {
      const [k1s, docs] = await Promise.all([
        s.from("k1_forms").select("id, offering_id, tax_year, status, version").eq("investor_user_id", data.id).order("tax_year", { ascending: false }).limit(50),
        s.from("fund_tax_documents").select("id, offering_id, doc_type, tax_year, review_status").eq("investor_user_id", data.id).limit(50),
      ]);
      return { k1s: rows(k1s), documents: rows(docs) };
    }

    if (data.tab === "documents") {
      const docs = rows(
        await s
          .from("investor_documents")
          .select("id, doc_type, file_name, status, created_at")
          .eq("user_id", data.id)
          .order("created_at", { ascending: false })
          .limit(100)
          .then((r: any) => r)
          .catch(() => ({ data: [], error: null })),
      );
      return { documents: docs };
    }

    if (data.tab === "identity") {
      const applications = rows(
        await s.from("investor_applications").select("id, offering_id, kyc_status, aml_status, accreditation_status, status").eq("user_id", data.id).limit(50),
      );
      const appIds = applications.map((a: any) => a.id);
      const [kyc, aml, accreditation] = appIds.length
        ? await Promise.all([
            s.from("kyc_verifications").select("application_id, provider, status, completed_at, expired_at").in("application_id", appIds),
            s.from("aml_screenings").select("application_id, provider, status, completed_at").in("application_id", appIds),
            s.from("accreditation_records").select("application_id, method, status, verified_at, expires_at").in("application_id", appIds),
          ])
        : [{ data: [], error: null }, { data: [], error: null }, { data: [], error: null }];
      // Only the operational summary: provider payloads and результат blobs stay behind their own controls.
      return {
        applications,
        kyc: rows(kyc).map((k: any) => ({ applicationId: k.application_id, provider: k.provider, status: k.status, completedAt: k.completed_at, expiresAt: k.expired_at })),
        aml: rows(aml).map((a: any) => ({ applicationId: a.application_id, provider: a.provider, status: a.status, completedAt: a.completed_at })),
        accreditation: rows(accreditation).map((a: any) => ({ applicationId: a.application_id, method: a.method, status: a.status, verifiedAt: a.verified_at, expiresAt: a.expires_at })),
      };
    }

    const events = rows(
      await s
        .from("investor_onboarding_events")
        .select("*")
        .eq("investor_user_id", data.id)
        .order("created_at", { ascending: false })
        .limit(50)
        .then((r: any) => r)
        .catch(() => ({ data: [], error: null })),
    );
    const names = await namesFor(s, events.map((e: any) => e.actor_id ?? e.created_by));
    return {
      activity: activityFrom(events, (row) => ({
        at: row.created_at,
        actor: names.get(row.actor_id ?? row.created_by) ?? "Harmonious",
        capacity: row.actor_role ?? "staff",
        action: row.event_type ?? row.kind ?? "event",
        resource: "investor onboarding",
        detail: { note: row.note ?? null, stage: row.to_stage ?? null },
      })),
    };
  });

/* -------------------------------------------------------------- company 360 */

export const getOpsCompanyRecord = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => idInput.parse(data))
  .handler(async ({ context, data }) => {
    const capabilities = await gateRecord(context, "company");
    const s = context.supabase;
    const { data: company, error } = await s
      .from("ct_companies")
      .select("id, name, legal_name, entity_type, jurisdiction, incorporation_date, authorized_shares, currency, client_id")
      .eq("id", data.id)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!company) throw new Error(NOT_FOUND);

    const [stakeholders, securities] = await Promise.all([
      s.from("ct_stakeholders").select("id").eq("company_id", data.id),
      s.from("ct_securities").select("quantity, status").eq("company_id", data.id),
    ]);
    const outstanding = rows(securities).filter((sec: any) => sec.status === "outstanding" || sec.status === "active");

    return {
      capabilities,
      record: {
        id: company.id,
        title: company.name,
        subtitle: company.legal_name,
        entityType: company.entity_type,
        jurisdiction: company.jurisdiction,
        incorporated: company.incorporation_date,
        authorizedShares: company.authorized_shares,
        currency: company.currency,
        clientId: company.client_id,
        stakeholderCount: rows(stakeholders).length,
        outstandingQuantity: sum(outstanding, "quantity"),
      },
    };
  });

export const getOpsCompanyTab = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => tabInput.parse(data))
  .handler(async ({ context, data }) => {
    await gateTab(context, "company", data.tab);
    const s = context.supabase;
    const { data: company } = await s.from("ct_companies").select("id").eq("id", data.id).maybeSingle();
    if (!company) throw new Error(NOT_FOUND);

    if (data.tab === "overview" || data.tab === "cap-table") {
      const [securities, classes] = await Promise.all([
        s.from("ct_securities").select("id, label, security_type, quantity, status, stakeholder_id, class_id").eq("company_id", data.id).limit(500),
        s.from("ct_security_classes").select("id, name").eq("company_id", data.id),
      ]);
      const className = new Map(rows(classes).map((c: any) => [c.id, c.name]));
      const securityRows = rows(securities);
      const stakeholderIds = [...new Set(securityRows.map((x: any) => x.stakeholder_id).filter(Boolean))];
      const holders = stakeholderIds.length
        ? rows(await s.from("ct_stakeholders").select("id, name, entity_name").in("id", stakeholderIds))
        : [];
      const holderName = new Map(holders.map((h: any) => [h.id, h.entity_name || h.name]));
      return {
        securities: securityRows.map((sec: any) => ({
          id: sec.id,
          label: sec.label,
          type: sec.security_type,
          quantity: sec.quantity,
          status: sec.status,
          className: className.get(sec.class_id) ?? null,
          holder: holderName.get(sec.stakeholder_id) ?? null,
          stakeholderId: sec.stakeholder_id,
        })),
        totalQuantity: sum(securityRows, "quantity"),
      };
    }

    if (data.tab === "stakeholders") {
      return {
        stakeholders: rows(
          await s.from("ct_stakeholders").select("id, name, entity_name, stakeholder_type, title, email").eq("company_id", data.id).order("name").limit(500),
        ).map((h: any) => ({ id: h.id, name: h.entity_name || h.name, type: h.stakeholder_type, title: h.title, email: h.email })),
      };
    }

    if (data.tab === "transactions") {
      return {
        transactions: rows(
          await s
            .from("ct_transactions")
            .select("id, kind, quantity, amount, effective_date, status")
            .eq("company_id", data.id)
            .order("effective_date", { ascending: false })
            .limit(100),
        ),
      };
    }

    if (data.tab === "documents") {
      return {
        documents: rows(
          await s.from("ct_documents").select("id, title, doc_type, status, created_at").eq("company_id", data.id).order("created_at", { ascending: false }).limit(100),
        ),
      };
    }

    if (data.tab === "reports") {
      return {
        reports: rows(
          await s
            .from("financial_reports")
            .select("id, report_type, status, period_end, version")
            .eq("ct_company_id", data.id)
            .order("period_end", { ascending: false })
            .limit(25),
        ),
      };
    }

    const events = rows(
      await s.from("ct_events").select("*").eq("company_id", data.id).order("created_at", { ascending: false }).limit(50),
    );
    const names = await namesFor(s, events.map((e: any) => e.actor_id ?? e.created_by));
    return {
      activity: activityFrom(events, (row) => ({
        at: row.created_at,
        actor: names.get(row.actor_id ?? row.created_by) ?? "Harmonious",
        capacity: row.actor_role ?? "staff",
        action: row.event_type ?? row.kind ?? "event",
        resource: "company",
        detail: { note: row.note ?? row.summary ?? null },
      })),
    };
  });
