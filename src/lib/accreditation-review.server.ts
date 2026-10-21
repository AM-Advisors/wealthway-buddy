/**
 * 506(c) accreditation paperwork: the fund's managers (or Harmonious from
 * Operations) verify it. 506(b) never reaches here. Decisions are logged.
 */
async function db() {
  return (await import("@/integrations/supabase/client.server")).supabaseAdmin as any;
}

async function assertManager(d: any, userId: string, offeringId: string) {
  const { data: mgr } = await d.from("fund_managers").select("id").eq("offering_id", offeringId).eq("user_id", userId).maybeSingle();
  if (mgr) return;
  const { data: roles } = await d.from("user_roles").select("role").eq("user_id", userId);
  const staff = ((roles ?? []) as any[]).some((r) => ["admin", "super_admin", "operations", "compliance", "fund_administration"].includes(r.role));
  if (!staff) throw new Error("Only this fund's managers or Harmonious can verify accreditation.");
}

export async function listPending(userId: string, offeringId: string) {
  const d = await db();
  await assertManager(d, userId, offeringId);
  const { data: apps } = await d.from("investor_applications").select("id, user_id").eq("offering_id", offeringId).eq("accreditation_status", "review");
  const rows = (apps ?? []) as any[];
  if (!rows.length) return [];
  const ids = rows.map((a) => a.id);
  const [{ data: recs }, { data: docs }, { data: people }] = await Promise.all([
    d.from("accreditation_records").select("application_id, method, attested_at").in("application_id", ids),
    d.from("accreditation_documents").select("id, application_id, file_name, doc_kind").in("application_id", ids),
    d.from("profiles").select("user_id, legal_name").in("user_id", rows.map((a) => a.user_id)),
  ]);
  return rows.map((a) => ({
    applicationId: a.id as string,
    investor: ((people ?? []) as any[]).find((p) => p.user_id === a.user_id)?.legal_name ?? "Investor",
    method: ((recs ?? []) as any[]).find((r) => r.application_id === a.id)?.method ?? null,
    submittedAt: ((recs ?? []) as any[]).find((r) => r.application_id === a.id)?.attested_at ?? null,
    documents: ((docs ?? []) as any[]).filter((x) => x.application_id === a.id).map((x) => ({ id: x.id as string, name: x.file_name as string, kind: x.doc_kind as string })),
  }));
}

export async function fileUrl(userId: string, documentId: string) {
  const d = await db();
  const { data: doc } = await d.from("accreditation_documents").select("storage_path, application_id").eq("id", documentId).maybeSingle();
  if (!doc) throw new Error("File not found.");
  const { data: app } = await d.from("investor_applications").select("offering_id").eq("id", doc.application_id).maybeSingle();
  await assertManager(d, userId, app.offering_id);
  const { data, error } = await d.storage.from("accreditation-docs").createSignedUrl(doc.storage_path, 300);
  if (error || !data) throw new Error("Couldn't open the file.");
  return { url: data.signedUrl as string };
}

export async function decide(userId: string, input: { applicationId: string; decision: "approved" | "rejected"; notes: string }) {
  const d = await db();
  const { data: app } = await d.from("investor_applications").select("id, offering_id, user_id, accreditation_status").eq("id", input.applicationId).maybeSingle();
  if (!app) throw new Error("Investment not found.");
  await assertManager(d, userId, app.offering_id);
  if (app.user_id === userId) throw new Error("You can't verify your own accreditation.");
  if (app.accreditation_status !== "review") throw new Error("This accreditation isn't waiting for review.");
  if (input.decision === "rejected" && input.notes.length < 3) throw new Error("Give a reason so the investor knows what to fix.");
  const now = new Date().toISOString();
  await d.from("accreditation_records").update({ status: input.decision, reviewer_id: userId, review_notes: input.notes || null, verified_at: input.decision === "approved" ? now : null, updated_at: now }).eq("application_id", app.id);
  const up = await d.from("investor_applications").update({ accreditation_status: input.decision, updated_at: now }).eq("id", app.id);
  if (up.error) throw new Error(up.error.message);
  await d.from("admin_notes").insert({ application_id: app.id, author_id: userId, body: `[accreditation → ${input.decision}] ${input.notes || "Paperwork verified"}` });
  try {
    const { data: onb } = await d.from("investor_onboardings").select("id").eq("application_id", app.id).maybeSingle();
    if (onb) await (await import("@/lib/investor-onboarding.server")).reconcileInvestmentReadiness(onb.id, { actorUserId: userId, trigger: "accreditation_decided" } as any);
  } catch { /* readiness refresh never undoes the decision */ }
  return { ok: true };
}

/** Tells Harmonious (#operations) and the fund's managers that 506(c) paperwork is waiting. Best-effort. */
export async function notifyAccreditationPending(applicationId: string) {
  const d = await db();
  const { data: app } = await d.from("investor_applications").select("offering_id, user_id").eq("id", applicationId).maybeSingle();
  if (!app) return;
  const [{ data: fund }, { data: prof }] = await Promise.all([
    d.from("offerings").select("name").eq("id", app.offering_id).maybeSingle(),
    d.from("profiles").select("legal_name").eq("user_id", app.user_id).maybeSingle(),
  ]);
  const investor = prof?.legal_name || "An investor";
  try {
    const { notifySubmission } = await import("@/lib/ops-slack-notify.server");
    await notifySubmission({ kind: "accreditation_pending", title: `Accreditation paperwork pending review - ${investor}`, offeringId: app.offering_id, ref: `accreditation:${applicationId}:${Math.floor(Date.now() / 3_600_000)}`, once: true, path: `/ops/fund/${app.offering_id}` } as any);
  } catch (e) { console.error("accreditation slack", e); }
  const { data: mgrs } = await d.from("fund_managers").select("user_id").eq("offering_id", app.offering_id);
  const ids = ((mgrs ?? []) as any[]).map((m) => m.user_id).filter(Boolean);
  if (!ids.length) return;
  const { data: people } = await d.from("profiles").select("legal_name, email").in("user_id", ids);
  const { sendTemplateEmail } = await import("@/lib/email-templates/send-email");
  for (const p of (people ?? []) as any[]) {
    if (!p.email) continue;
    try {
      await sendTemplateEmail("manager-alert", p.email, {
        idempotencyKey: `accreditation-pending:${applicationId}:${Math.floor(Date.now() / 3_600_000)}:${String(p.email).toLowerCase()}`,
        templateData: {
          managerName: p.legal_name || "there",
          headline: "Accreditation paperwork is pending",
          intro: `${investor} uploaded accreditation paperwork. You or Harmonious can verify it under Approvals.`,
          offeringName: fund?.name ?? "your fund",
          details: [{ label: "Investor", value: investor }],
          portalUrl: `https://app.harmonious.co/manager/fund/${app.offering_id}/approvals`,
        },
      } as any);
    } catch (e) { console.error("accreditation email", e); }
  }
}
