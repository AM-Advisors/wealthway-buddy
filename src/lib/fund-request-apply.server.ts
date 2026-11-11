/**
 * Server-only: copies every answer of a new fund request into the fund it created, so Setup is the
 * one place to read and edit them. Shared by the client's submission and Operations' "Create fund
 * from this request". Callers authorize first. Nothing is approved, signed, sent or filed here;
 * blanks never erase what Setup already holds; anything that could not be copied becomes one
 * Operations task naming exactly what to enter.
 */
import type { FundRequest } from "@/lib/fund-request-model";

type Issue = { title: string; description: string };

export async function applyRequestToFund(input: {
  actorId: string;
  /** The caller's own client (RLS applies) for the guarded entity-details RPC. */
  actorSupabase: any;
  clientId: string;
  offeringId: string;
  request: FundRequest;
}): Promise<{ issues: Issue[] }> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const db = supabaseAdmin as any;
  const r = input.request;
  const { offeringId, actorId, clientId } = input;
  const issues: Issue[] = [];

  // Setup record, prefilled. Extra answers go to setup_details / service_providers.
  const { setupPrefillFor, setupDetailsFor, ss4For } = await import("@/lib/fund-request-model");
  const { fillDetailsFromRequest, fillProvidersFromRequest } = await import("@/lib/fund-setup-details");
  const prefill = setupPrefillFor(r);
  const { bootstrapFundSetup } = await import("@/lib/fund-setup.server");
  const setup = await bootstrapFundSetup(actorId, {
    offeringId, clientId, structure: prefill.structure,
    legalFundName: r.legal_name.trim() || null, displayName: prefill.display_name,
  });
  const { data: cur } = await db.from("fund_setups").select("*").eq("id", (setup as any).id).maybeSingle();
  const { structure: _s, service_providers, ...rest } = prefill;
  const patch: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(rest)) if (v != null && v !== "" && (cur?.[k] == null || cur?.[k] === "")) patch[k] = v;
  patch["service_providers"] = fillProvidersFromRequest(cur?.service_providers ?? {}, service_providers as any);
  patch["setup_details"] = fillDetailsFromRequest(cur?.setup_details ?? {}, setupDetailsFor(r));
  const { error: setupError } = await db.from("fund_setups").update(patch).eq("id", (setup as any).id);
  if (setupError) issues.push({ title: "Fund details not copied into Setup", description: "Enter the request's strategy, providers, eligibility, GP commitment and notes in Setup → More fund details." });

  // Fees, carry and classes: Setup's Fees & terms (draft for the usual approval) and the Team tab fee row.
  const { economicsFromRequest } = await import("@/lib/request-economics");
  const econ = economicsFromRequest(r);
  if (econ.hasAny) {
    const cls = (r.classes ?? []).filter((c) => c.name || c.fee || c.carry || c.hurdle);
    const notes = ["From the client's fund request.", ...cls.map((c) => `${c.name || "Class"}: fee ${c.fee || "-"}, carry ${c.carry || "-"}, hurdle ${c.hurdle || "-"}`)].join(" ");
    try {
      const { setFees } = await import("@/lib/fund-tabs.server");
      await setFees(actorId, offeringId, { managementFeePct: econ.fees.managementFeePct, managementFeeBasis: "", carryPct: econ.fees.carryPct, hurdlePct: econ.fees.hurdlePct, notes }, { skipSetupSync: true });
    } catch (e: any) { console.warn("Team-tab fee row not saved:", e?.message); }
    try {
      const { syncFeesToEconomics } = await import("@/lib/fund-setup.server");
      const res = await syncFeesToEconomics({ offeringId, actorId, fees: econ.fees, classes: econ.classes, seedTerms: econ.terms as any, onlyIfEmpty: true, reason: "From the client's fund request" });
      if (!res.synced && res.reason !== "already_has_terms") throw new Error(res.reason);
    } catch (e: any) {
      console.warn("Setup fees & terms not copied:", e?.message);
      issues.push({ title: "Fees & terms not copied into Setup", description: "Enter the request's fee, carry and class answers in Setup → Fees & terms." });
    }
  }

  // People: managers join the Team; the named signer becomes the fund's signatory.
  const { data: existingTeam } = await db.from("fund_team_members").select("full_name, email").eq("offering_id", offeringId).is("removed_at", null);
  const seen = new Set<string>(((existingTeam ?? []) as any[]).map((t) => String(t.email || t.full_name || "").trim().toLowerCase()).filter(Boolean));
  const signerEmail = r.signatory?.email?.trim().toLowerCase() || "";
  const people = [
    ...(r.managers ?? []).filter((p) => p.name?.trim()).map((p) => ({ ...p, role: "gp" })),
    ...(r.signatory?.name?.trim() ? [{ ...r.signatory, role: "manager" }] : []),
  ];
  const rows = people.filter((p) => { const k = (p.email || p.name).trim().toLowerCase(); if (seen.has(k)) return false; seen.add(k); return true; })
    .map((p) => {
      const isSigner = !!r.signatory?.name?.trim() && ((signerEmail && p.email?.trim().toLowerCase() === signerEmail) || p.name.trim().toLowerCase() === r.signatory.name.trim().toLowerCase());
      return {
        offering_id: offeringId, full_name: p.name.trim(), email: p.email?.trim().toLowerCase() || null,
        team_role: p.role, permissions: isSigner ? ["view", "authorized_signatory"] : ["view"], created_by: actorId, added_as: "client_request",
      };
    });
  if (rows.length) {
    const { error } = await db.from("fund_team_members").insert(rows as any);
    if (error) issues.push({ title: "Team contacts not copied", description: `Add these people on the Team tab: ${rows.map((x) => x.full_name).join(", ")}.` });
  }
  if (r.signatory?.name?.trim()) {
    const { addRequestedSignatory } = await import("@/lib/fund-signatories.server");
    const res = await addRequestedSignatory(actorId, offeringId, { fullName: r.signatory.name, email: r.signatory.email, title: r.signatory.title });
    if (!res.added && res.note) issues.push({ title: "Requested signer not recorded", description: `Add ${r.signatory.name.trim()} as the fund signer in Setup → Team & Signatory. ${res.note}` });
  }

  // SS-4 answers prefill EIN & SS-4 for review. Never filed.
  const ss4 = ss4For(r);
  if (ss4) {
    const { error } = await input.actorSupabase.rpc("save_offering_entity_details", { p_offering_id: offeringId, p_has_ein: false, p_ein: "", p_ss4: ss4 as any });
    if (error) issues.push({ title: "SS-4 answers not saved", description: "The client's SS-4 answers are on the request. Enter them in Setup → EIN & SS-4." });
  }

  // Documents uploaded with the request become Setup document versions (review and activation still required).
  const docs = (r.documents ?? []).filter((d) => d?.path && d?.fileName);
  if (docs.length) {
    const { importRequestDocuments } = await import("@/lib/offering-document-setup.server");
    const res = await importRequestDocuments(actorId, { offeringId, clientId, documents: docs });
    if (res.failed.length) issues.push({ title: "Request documents not copied", description: `Upload these in Setup → Documents: ${res.failed.join(", ")}.` });
  }

  for (const issue of issues) {
    await db.from("staff_tasks").insert({
      title: `${issue.title} for ${r.fund_name}`, description: issue.description,
      priority: "high", status: "open", created_by: actorId, team: "operations", responsibility_status: "HARMONIOUS_HANDLING", related_workflow_type: "client_fund_request", offering_id: offeringId, client_id: clientId,
    } as any).then(() => undefined, () => undefined);
  }
  return { issues };
}
