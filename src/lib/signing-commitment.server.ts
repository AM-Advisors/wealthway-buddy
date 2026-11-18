/**
 * Server-only: makes sure the legacy signing record exists for an application,
 * filled from the commitment already recorded on the investment. Never invents an
 * amount and never records a tax classification (that stays with the W-9 / tax step).
 */
import { recordedCommitmentCents } from "@/lib/signing-commitment";

export type SigningCommitment = {
  commitment_cents: number;
  ownership_title: string | null;
  tax_classification: string | null;
};

/** Read-only: the commitment already recorded on the investment (for page loads, which never write). */
export async function recordedSigningCommitment(admin: any, applicationId: string): Promise<SigningCommitment | null> {
  const [{ data: app }, { data: obs }] = await Promise.all([
    admin.from("investor_applications").select("commitment_cents").eq("id", applicationId).maybeSingle(),
    admin
      .from("investor_onboardings")
      .select("requested_amount_cents")
      .eq("application_id", applicationId)
      .not("stage", "in", "(closed,declined,cancelled)")
      .order("created_at", { ascending: false })
      .limit(1),
  ]);
  const cents = recordedCommitmentCents({
    onboardingRequestedCents: ((obs ?? []) as any[])[0]?.requested_amount_cents,
    applicationCommitmentCents: (app as any)?.commitment_cents,
  });
  return cents ? { commitment_cents: cents, ownership_title: null, tax_classification: null } : null;
}

/** Used only inside signing actions: fills the missing legacy record from the recorded commitment. */
export async function ensureSigningCommitment(admin: any, applicationId: string): Promise<SigningCommitment | null> {
  const read = async () =>
    (await admin
      .from("subscriptions")
      .select("commitment_cents, ownership_title, tax_classification")
      .eq("application_id", applicationId)
      .maybeSingle()).data as SigningCommitment | null;

  const existing = await read();
  if (existing?.commitment_cents) return existing;

  const [{ data: app }, { data: obs }] = await Promise.all([
    admin.from("investor_applications").select("commitment_cents").eq("id", applicationId).maybeSingle(),
    admin
      .from("investor_onboardings")
      .select("requested_amount_cents, investment_profile_id")
      .eq("application_id", applicationId)
      .not("stage", "in", "(closed,declined,cancelled)")
      .order("created_at", { ascending: false })
      .limit(1),
  ]);
  const ob = ((obs ?? []) as any[])[0] ?? null;
  const cents = recordedCommitmentCents({
    onboardingRequestedCents: ob?.requested_amount_cents,
    applicationCommitmentCents: (app as any)?.commitment_cents,
  });
  if (!cents) return existing ?? null;

  if (existing) {
    // A row without an amount: fill only the missing amount.
    await admin.from("subscriptions").update({ commitment_cents: cents }).eq("application_id", applicationId);
    return await read();
  }

  let ownershipTitle: string | null = null;
  if (ob?.investment_profile_id) {
    const { data: ip } = await admin.from("investment_profiles").select("legal_name").eq("id", ob.investment_profile_id).maybeSingle();
    ownershipTitle = String((ip as any)?.legal_name ?? "").trim() || null;
  }
  await admin
    .from("subscriptions")
    .upsert(
      { application_id: applicationId, commitment_cents: cents, ownership_title: ownershipTitle, status: "draft" },
      { onConflict: "application_id", ignoreDuplicates: true },
    );
  return await read();
}
