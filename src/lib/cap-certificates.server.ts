/** Server-only helpers for share certificates and shareholder access links.
 *  Certificate numbers are allocated here so every share record gets one
 *  automatically and no two certificates in a company share a number. */

function pad(n: number) {
  return String(n).padStart(4, "0");
}

export async function nextCertificateNo(admin: any, clientId: string): Promise<string> {
  const { data } = await admin
    .from("cap_certificates")
    .select("certificate_no")
    .eq("client_id", clientId);
  let max = 0;
  for (const row of (data ?? []) as any[]) {
    const m = /^CERT-(\d+)$/.exec(String(row.certificate_no ?? ""));
    if (m) max = Math.max(max, Number(m[1]));
  }
  return `CERT-${pad(max + 1)}`;
}

export function verificationCode(): string {
  const bytes = new Uint8Array(6);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0"))
    .join("")
    .toUpperCase();
}

export function newToken(): string {
  const bytes = new Uint8Array(24);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

export async function hashToken(token: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(token));
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, "0")).join("");
}

/** Builds the snapshot printed on a certificate so the document never changes
 *  once the shares behind it move on. */
export async function buildSnapshot(admin: any, holdingId: string) {
  const { data: holding } = await admin
    .from("cap_holdings")
    .select("*")
    .eq("id", holdingId)
    .maybeSingle();
  if (!holding) throw new Error("That share record no longer exists.");
  const [{ data: stakeholder }, { data: client }] = await Promise.all([
    admin.from("cap_stakeholders").select("*").eq("id", holding.stakeholder_id).maybeSingle(),
    admin.from("clients").select("name, legal_name").eq("id", holding.client_id).maybeSingle(),
  ]);
  return {
    holding,
    snapshot: {
      companyName: (client as any)?.legal_name || (client as any)?.name || "",
      holderName: (stakeholder as any)?.name ?? "",
      holderEmail: (stakeholder as any)?.email ?? null,
      holderType: (stakeholder as any)?.holder_type ?? null,
      securityType: holding.security_type,
      shareClass: holding.share_class,
      quantity: Number(holding.quantity ?? 0),
      pricePerShareCents: holding.price_per_share_cents ?? null,
      issuedOn: holding.issued_on ?? new Date().toISOString().slice(0, 10),
    },
  };
}

/** Creates the draft certificate that belongs to a share record. */
export async function createDraftCertificate(
  admin: any,
  args: { holdingId: string; createdBy: string; transferId?: string | null },
) {
  const { holding, snapshot } = await buildSnapshot(admin, args.holdingId);
  const clientId = String(holding.client_id);
  const certificate_no = holding.certificate_no || (await nextCertificateNo(admin, clientId));

  const { data, error } = await admin
    .from("cap_certificates")
    .insert({
      client_id: clientId,
      holding_id: args.holdingId,
      stakeholder_id: holding.stakeholder_id,
      certificate_no,
      verification_code: verificationCode(),
      snapshot: { ...snapshot, certificateNo: certificate_no },
      transfer_id: args.transferId ?? null,
      created_by: args.createdBy,
    })
    .select("id, certificate_no")
    .single();
  if (error) throw new Error(error.message);

  if (!holding.certificate_no) {
    await admin.from("cap_holdings").update({ certificate_no }).eq("id", args.holdingId);
  }
  return data as { id: string; certificate_no: string };
}

/** Marks every live certificate behind a share record as cancelled or replaced. */
export async function closeCertificatesForHolding(
  admin: any,
  holdingId: string,
  status: "cancelled" | "replaced",
  reason: string,
) {
  await admin
    .from("cap_certificates")
    .update({ status, cancelled_at: new Date().toISOString(), cancelled_reason: reason })
    .eq("holding_id", holdingId)
    .in("status", ["draft", "issued"]);
}
