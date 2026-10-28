/**
 * Generates the 506(c) offering circular with its signature page for a fund,
 * from canonical fund records only. The PDF is stored as a new version on the
 * fund's "506(c) Offering Circular" document, set to Signature Required with
 * investor and entity signer blocks. Generated versions enter the independent
 * review gate: a second person must approve and activate before investors sign.
 */
import { offeringCircular506cSpec, type OfferingCircular506cFacts } from "@/lib/offering-circular-506c";
import { assertFundDocumentGeneration } from "@/lib/fund-document-generation-access.server";

const db = async () => (await import("@/integrations/supabase/client.server")).supabaseAdmin as any;

const money = (cents: number | null | undefined) =>
  cents == null ? "Not set" : `$${Math.round(cents / 100).toLocaleString("en-US")}`;

const longDate = (iso: string | null | undefined) =>
  iso ? new Date(`${String(iso).slice(0, 10)}T12:00:00Z`).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric", timeZone: "UTC" }) : "";

function seriesRange(c: any): string {
  if (c.appliesTo) return String(c.appliesTo);
  const min = c.minInvestmentCents != null ? `At least ${money(c.minInvestmentCents)}` : null;
  const max = c.maxInvestmentCents != null ? `less than ${money(c.maxInvestmentCents)}` : null;
  return [min, max].filter(Boolean).join(" and ") || "All investors";
}

export async function loadCircular506cFacts(offeringId: string): Promise<OfferingCircular506cFacts> {
  const d = await db();
  const { data: o } = await d.from("offerings").select("name, legal_entity_name, entity_type, state_formed, date_formed, principal_address, reg_type, min_investment_cents, target_raise_cents, signatory_title, arbitration_city, arbitration_state, gp_entity_name, client_id").eq("id", offeringId).maybeSingle();
  if (!o) throw new Error("Fund not found.");
  if (o.reg_type !== "506c") throw new Error("This fund is not a 506(c) offering.");

  const [{ data: client }, { data: setup }] = await Promise.all([
    o.client_id ? d.from("clients").select("legal_name, name").eq("id", o.client_id).maybeSingle() : Promise.resolve({ data: null }),
    d.from("fund_setups").select("id").eq("offering_id", offeringId).maybeSingle(),
  ]);
  const { data: econ } = setup
    ? await d.from("fund_economics_versions").select("classes, status").eq("setup_id", setup.id).order("version", { ascending: false }).limit(1).maybeSingle()
    : { data: null };

  const classes = ((econ as any)?.classes ?? []) as any[];
  return {
    fundName: o.legal_entity_name || o.name,
    gpName: (client as any)?.legal_name || (client as any)?.name || o.gp_entity_name || "the general partner",
    stateOfFormation: o.state_formed || "Delaware",
    formedDate: longDate(o.date_formed) || "the date of formation",
    principalAddress: o.principal_address || "on file with the Fund",
    targetRaise: money(o.target_raise_cents),
    minimumInvestment: money(o.min_investment_cents),
    signatoryTitle: o.signatory_title || "Authorized Signatory",
    arbitrationCity: o.arbitration_city || "Wilmington",
    arbitrationState: o.arbitration_state || "Delaware",
    circularDate: longDate(new Date().toISOString()),
    series: classes.map((c) => ({
      name: String(c.name ?? c.key),
      range: seriesRange(c),
      preferredReturn: c.preferredReturnPercent != null && Number(c.preferredReturnPercent) > 0 ? `${c.preferredReturnPercent}% preferred return` : "No preferred return",
      notes: c.otherDifferences ?? null,
    })),
  };
}

export async function generate506cCircular(userId: string, offeringId: string) {
  await assertFundDocumentGeneration(userId, offeringId);
  const facts = await loadCircular506cFacts(offeringId);
  const spec = offeringCircular506cSpec(facts);
  const { renderPdf } = await import("@/lib/pdf-render");
  const bytes = await renderPdf(spec);

  const d = await db();
  const path = `${offeringId}/506c-offering-circular-${Date.now()}.pdf`;
  const up = await d.storage.from("offering-files").upload(path, bytes, { contentType: "application/pdf" });
  if (up.error) throw new Error("Could not store the generated circular.");

  const setup = await import("@/lib/offering-document-setup.server");
  // Reuse the fund's existing circular document when present; never duplicate it.
  const { data: existing } = await d.from("offering_documents").select("id").eq("offering_id", offeringId).eq("title", "506(c) Offering Circular").is("removed_at", null).maybeSingle();
  const documentId = existing?.id ?? (await setup.createSetupDocument(userId, { offeringId, category: "other", title: "506(c) Offering Circular" })).id;

  const { version } = await setup.uploadDocumentVersion(userId, {
    documentId,
    filePath: path,
    fileName: spec.fileName,
    fileSizeBytes: bytes.length,
    effectiveDate: new Date().toISOString().slice(0, 10),
    selfServeGenerated: true,
  });
  await setup.setDocumentUsage(userId, { documentId, usage: "signature", applicability: {} });
  await setup.saveSigningConfig(userId, {
    documentId,
    version,
    confirm: true,
    config: {
      signers: [
        { role: "investor", fields: ["signature", "printed_name", "date_signed"], order: 1 },
        { role: "entity_authorized_signer", fields: ["signature", "printed_name", "title", "entity_name", "date_signed"], order: 2 },
      ],
    },
  });
  return { documentId, version, fileName: spec.fileName };
}
