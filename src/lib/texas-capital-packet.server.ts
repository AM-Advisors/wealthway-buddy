// Server-only helpers for the Texas Capital account package.
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import { requiredDocuments, needsIdentification, formatEin, type EntityKind, type PacketAnswers } from "@/lib/texas-capital-packet-model";

export const PACKET_BUCKET = "bank-packets";
const TPL = "templates/texas-capital/";

export async function adminDb() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin as any;
}

/** Harmonious admins, or a manager of this exact fund. */
export async function packetAuthority(supabase: any, userId: string, offeringId: string): Promise<{ authorized: boolean; isAdmin: boolean }> {
  const { data: role } = await supabase.from("user_roles").select("role").eq("user_id", userId).eq("role", "admin").maybeSingle();
  if (role) return { authorized: true, isAdmin: true };
  const { data: mgr } = await supabase.from("fund_managers").select("id").eq("user_id", userId).eq("offering_id", offeringId).maybeSingle();
  return { authorized: !!mgr, isAdmin: false };
}

export async function logPacket(db: any, packetId: string, event: string, actorId: string | null, detail: Record<string, unknown> = {}) {
  await db.from("texas_capital_packet_events").insert({ packet_id: packetId, event, actor_id: actorId, detail });
}

/** Facts already on the account. Never includes personal tax IDs or birth dates. */
export async function recordFacts(db: any, offeringId: string): Promise<Partial<PacketAnswers>> {
  const [{ data: o }, { data: det }, { data: team }] = await Promise.all([
    db.from("offerings").select("name, legal_entity_name, entity_type, state_formed, date_formed, principal_address, contact_phone, summary").eq("id", offeringId).maybeSingle(),
    db.from("offering_entity_details").select("ein").eq("offering_id", offeringId).maybeSingle(),
    db.from("fund_team_members").select("full_name, email, phone, team_role").eq("offering_id", offeringId).is("removed_at", null).in("team_role", ["gp", "manager"]),
  ]);
  const people = ((team ?? []) as any[]).filter((t) => t.full_name).map((t, i) => ({
    name: t.full_name as string, email: t.email ?? "", phone: t.phone ?? "", title: t.team_role === "gp" ? "General Partner" : "Manager",
    roles: (i === 0 ? ["signer", "controlling_party"] : ["signer"]) as PacketAnswers["people"][number]["roles"],
    ownershipPercent: null, onFileWithBank: false,
  }));
  const state = (o?.state_formed ?? "") as string;
  return {
    legalName: o?.legal_entity_name || o?.name || "",
    entityType: o?.entity_type ?? "",
    ein: formatEin(det?.ein ?? ""),
    stateOfIncorporation: state,
    registeredInTexas: /^(tx|texas)$/i.test(state.trim()) ? true : null,
    dateEstablished: o?.date_formed ?? "",
    physicalAddress: o?.principal_address ?? "",
    mailingAddress: o?.principal_address ?? "",
    businessPhone: o?.contact_phone ?? "",
    narrative: o?.summary ?? "",
    primaryContactEmail: people[0]?.email ?? "",
    people,
  };
}

/** Saved answers win; record facts fill anything left blank. */
export function mergeAnswers(saved: Partial<PacketAnswers>, facts: Partial<PacketAnswers>): PacketAnswers {
  const out: any = { ...facts };
  for (const [k, v] of Object.entries(saved ?? {})) {
    if (v === undefined || v === null || (typeof v === "string" && !v.trim())) continue;
    if (Array.isArray(v) && !v.length && k === "people") continue;
    out[k] = v;
  }
  out.accounts = { count: 1, type: "checking", addToBankNow: true, ...(saved?.accounts ?? {}) };
  out.people = out.people ?? [];
  return out as PacketAnswers;
}

async function download(db: any, path: string): Promise<Uint8Array | null> {
  const { data } = await db.storage.from(PACKET_BUCKET).download(path);
  return data ? new Uint8Array(await data.arrayBuffer()) : null;
}

const yes = (b: boolean | null | undefined) => b === true;

/** Fills the three Texas Capital forms and appends uploaded documents into one PDF. */
export async function buildPackagePdf(db: any, packetId: string, kind: EntityKind, a: PacketAnswers, docs: Record<string, { path?: string; onFile?: boolean }>): Promise<Uint8Array> {
  const out = await PDFDocument.create();
  const font = await out.embedFont(StandardFonts.Helvetica);
  const bold = await out.embedFont(StandardFonts.HelveticaBold);
  const navy = rgb(0.078, 0.149, 0.278);

  // Cover sheet
  const cover = out.addPage([612, 792]);
  let y = 740;
  const line = (t: string, f = font, size = 11) => { cover.drawText(t.slice(0, 95), { x: 50, y, size, font: f, color: navy }); y -= size + 7; };
  line("Account opening package", bold, 18); y -= 6;
  line(a.legalName ?? "", bold, 13);
  line(`Prepared by Harmonious for Texas Capital · ${new Date().toISOString().slice(0, 10)}`);
  y -= 8; line("Account details", bold, 12);
  line(`Number of accounts: ${a.accounts.count}`);
  line(`Account type: ${a.accounts.type === "savings" ? "Savings" : "Checking"}`);
  line(`Add to existing BankNow online portal: ${a.accounts.addToBankNow ? "Yes" : "No"}`);
  y -= 8; line("People", bold, 12);
  for (const p of a.people) {
    const roles = p.roles.map((r) => r.replace("_", " ")).join(", ");
    line(`${p.name}${p.title ? ` (${p.title})` : ""}: ${roles}${p.ownershipPercent ? `, ${p.ownershipPercent}% owner` : ""}${p.onFileWithBank ? ". Already on file with Texas Capital" : ". ID included"}`);
  }
  y -= 8; line("Entity documents", bold, 12);
  for (const d of requiredDocuments(kind, !!a.dba?.trim())) line(`${docs[d.key]?.path ? "Included" : docs[d.key]?.onFile ? "Already on file with Texas Capital" : "Not included"}: ${d.label}`);
  y -= 8; line("Signature required", bold, 12);
  line("Each signer signs the Customer Account BSA Profile and the Beneficial Ownership Certification.");
  line("Social Security numbers and birth dates are left blank for each signer to complete.");

  // 1. Customer BSA Profile (fillable)
  const bsaBytes = await download(db, TPL + "customer-bsa-profile.pdf");
  if (bsaBytes) {
    const bsa = await PDFDocument.load(bsaBytes);
    const form = bsa.getForm();
    const setT = (n: string, v?: string | null) => { try { if (v) form.getTextField(n).setText(String(v)); } catch { /* field missing */ } };
    const check = (n: string, on: boolean) => { try { if (on) form.getCheckBox(n).check(); } catch { /* field missing */ } };
    setT("Entity Name", a.legalName); setT("Entity Type", a.entityType); setT("Tax ID Number", a.ein);
    setT("DBA Sole Member LLC IOLTA Disregarded EntityDBAParent Company Name if applicable", a.dba);
    check("DBA", !!a.dba?.trim());
    setT("Business Phone", a.businessPhone); setT("Business Web Address", a.website); setT("NAICS Code", a.naics);
    setT("Narrative", a.narrative); setT("Date Entity Established", a.dateEstablished);
    setT("State of Incorporation", a.stateOfIncorporation); setT("Country of Incorporation", "United States");
    check("Texas Yes", yes(a.registeredInTexas)); check("Texas No", a.registeredInTexas === false);
    check("Privately Owned", true);
    setT("Mailing Address", a.mailingAddress);
    setT("Location Details", a.physicalAddress);
    try { form.updateFieldAppearances(await bsa.embedFont(StandardFonts.Helvetica)); } catch { /* keep defaults */ }
    const pages = await out.copyPages(bsa, bsa.getPageIndices());
    pages.forEach((p) => out.addPage(p));
  }

  // 2. Customer Account BSA Profile (flat form; text placed beside labels on page 1)
  const accBytes = await download(db, TPL + "customer-account-bsa-profile.pdf");
  if (accBytes) {
    const acc = await PDFDocument.load(accBytes);
    const p1 = acc.getPage(0);
    const f = await acc.embedFont(StandardFonts.Helvetica);
    const put = (x: number, top: number, t?: string | null) => { if (t) p1.drawText(String(t).slice(0, 60), { x, y: 792 - top - 8, size: 8.5, font: f, color: rgb(0, 0, 0) }); };
    put(369, 101, "X"); // New customer
    put(94, 117, a.legalName); put(95, 132, a.ein);
    put(98, 148, a.mailingAddress); put(100, 165, a.physicalAddress);
    put(95, 182, a.businessPhone); put(300, 197, a.primaryContactEmail);
    const signers = a.people.filter((p) => p.roles.includes("signer")).slice(0, 3);
    const blocks = [253, 378, 504];
    signers.forEach((s, i) => {
      const top = blocks[i]!;
      put(s.onFileWithBank ? 205 : 133, top - 12, "X");
      put(60, top, s.name); put(374, top + 47, s.phone); put(90, top + 63, s.email);
    });
    const pages = await out.copyPages(acc, acc.getPageIndices());
    pages.forEach((p) => out.addPage(p));
  }

  // 3. Beneficial Ownership Certification (scanned form) with a prefilled answer sheet in front
  const sheet = out.addPage([612, 792]);
  y = 740;
  const sl = (t: string, f = font, size = 11) => { sheet.drawText(t.slice(0, 95), { x: 50, y, size, font: f, color: navy }); y -= size + 7; };
  sl("Beneficial Ownership Certification: answers to copy onto the form", bold, 13);
  sl(`Legal entity: ${a.legalName ?? ""}`); sl(`Address: ${a.physicalAddress ?? ""}`); sl(`Tax ID: ${a.ein ?? ""}`);
  y -= 6; sl("Owners of 25% or more", bold, 12);
  const owners = a.people.filter((p) => p.roles.includes("beneficial_owner"));
  if (!owners.length) sl("None listed");
  owners.forEach((p) => sl(`${p.name}${p.ownershipPercent ? `, ${p.ownershipPercent}%` : ""}`));
  y -= 6; sl("Controlling party", bold, 12);
  a.people.filter((p) => p.roles.includes("controlling_party")).forEach((p) => sl(`${p.name}${p.title ? `, ${p.title}` : ""}`));
  const boBytes = await download(db, TPL + "beneficial-ownership-certification.pdf");
  if (boBytes) {
    const bo = await PDFDocument.load(boBytes);
    const pages = await out.copyPages(bo, bo.getPageIndices());
    pages.forEach((p) => out.addPage(p));
  }

  // Uploaded entity documents and IDs
  const uploads = Object.entries(docs).filter(([, v]) => v?.path);
  for (const [, v] of uploads) {
    const bytes = await download(db, v.path!);
    if (!bytes) continue;
    const lower = v.path!.toLowerCase();
    if (lower.endsWith(".pdf")) {
      try { const d = await PDFDocument.load(bytes, { ignoreEncryption: true }); (await out.copyPages(d, d.getPageIndices())).forEach((p) => out.addPage(p)); } catch { /* unreadable PDF skipped */ }
    } else {
      const img = lower.endsWith(".png") ? await out.embedPng(bytes) : await out.embedJpg(bytes);
      const page = out.addPage([612, 792]);
      const s = Math.min(512 / img.width, 692 / img.height, 1);
      page.drawImage(img, { x: 50, y: 742 - img.height * s, width: img.width * s, height: img.height * s });
    }
  }
  void packetId; void needsIdentification;
  return out.save();
}

export async function sha256Hex(s: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s));
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

export function newToken(): string {
  const b = new Uint8Array(32); crypto.getRandomValues(b);
  return btoa(String.fromCharCode(...b)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
