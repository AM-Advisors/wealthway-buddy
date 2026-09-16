import { createServerFn } from "@tanstack/react-start";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/**
 * One list of everything the signed-in person has on file with Harmonious:
 * what they signed, what was issued to them, what they sent us and the
 * statements and invoices they received. Read-only — every row points back to
 * the page that owns that step.
 */

export type VaultAction =
  | { type: "signature"; id: string }
  | { type: "upload"; id: string }
  | { type: "fundDocument"; id: string }
  | { type: "link"; to: string }
  | { type: "none" };

export type VaultRow = {
  id: string;
  kind: string;
  kindLabel: string;
  title: string;
  detail: string | null;
  fundId: string | null;
  fundName: string | null;
  date: string | null;
  action: VaultAction;
};

function iso(value: unknown) {
  return typeof value === "string" ? value : null;
}

export const getMyVault = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;

    const [{ data: applications }, { data: uploads }, { data: memberships }, { data: policies }] =
      await Promise.all([
        supabase
          .from("investor_applications")
          .select("id, offering_id, commitment_cents, status")
          .eq("user_id", userId),
        supabase
          .from("investor_documents")
          .select("id, file_name, doc_kind, note, uploaded_at, offering_id")
          .eq("user_id", userId)
          .order("uploaded_at", { ascending: false }),
        supabase.from("client_users").select("client_id").eq("user_id", userId),
        supabase
          .from("policy_acceptances")
          .select("id, kind, version, signer_name, accepted_at")
          .eq("user_id", userId)
          .order("accepted_at", { ascending: false }),
      ]);

    const apps = (applications ?? []) as any[];
    const appIds = apps.map((a) => a.id as string);
    const clientIds = ((memberships ?? []) as any[]).map((m) => m.client_id as string);

    const [
      { data: signatures },
      { data: statements },
      { data: sows },
      { data: invoices },
    ] = await Promise.all([
      appIds.length
        ? supabase
            .from("document_signatures")
            .select(
              "id, application_id, offering_document_id, signer_name, signed_at, pdf_path, provider_completed_at",
            )
            .in("application_id", appIds)
        : Promise.resolve({ data: [] as any[] } as any),
      appIds.length
        ? supabase
            .from("capital_account_statements")
            .select("id, application_id, offering_id, statement_date, version, superseded")
            .in("application_id", appIds)
            .order("statement_date", { ascending: false })
        : Promise.resolve({ data: [] as any[] } as any),
      clientIds.length
        ? supabase
            .from("client_sows")
            .select("id, client_id, offering_id, title, status, effective_date, client_signed_at")
            .in("client_id", clientIds)
        : Promise.resolve({ data: [] as any[] } as any),
      clientIds.length
        ? supabase
            .from("invoices")
            .select("id, client_id, offering_id, number, status, issue_date, due_date, total_cents")
            .in("client_id", clientIds)
            .neq("status", "draft")
            .order("issue_date", { ascending: false })
        : Promise.resolve({ data: [] as any[] } as any),
    ]);

    // Fund documents issued to the funds this person is in.
    const offeringIds = Array.from(
      new Set(
        [
          ...apps.map((a) => a.offering_id),
          ...((sows ?? []) as any[]).map((s) => s.offering_id),
          ...((uploads ?? []) as any[]).map((u) => u.offering_id),
          ...((invoices ?? []) as any[]).map((i) => i.offering_id),
        ].filter(Boolean) as string[],
      ),
    );

    const [{ data: offerings }, { data: fundDocuments }] = await Promise.all([
      offeringIds.length
        ? supabase.from("offerings").select("id, name").in("id", offeringIds)
        : Promise.resolve({ data: [] as any[] } as any),
      apps.length
        ? supabase
            .from("offering_documents")
            .select("id, offering_id, title, doc_type, requires_signature, sort_order")
            .in(
              "offering_id",
              apps.map((a) => a.offering_id),
            )
            .order("sort_order", { ascending: true })
        : Promise.resolve({ data: [] as any[] } as any),
    ]);

    const fundName = new Map(
      ((offerings ?? []) as any[]).map((o) => [String(o.id), (o.name as string) ?? "Fund"]),
    );
    const appOffering = new Map(apps.map((a) => [String(a.id), String(a.offering_id)]));
    const docTitle = new Map(
      ((fundDocuments ?? []) as any[]).map((d) => [String(d.id), (d.title as string) ?? "Document"]),
    );

    const rows: VaultRow[] = [];

    for (const sig of (signatures ?? []) as any[]) {
      const offeringId = appOffering.get(String(sig.application_id)) ?? null;
      const completed = iso(sig.provider_completed_at) ?? iso(sig.signed_at);
      rows.push({
        id: `signature:${sig.id}`,
        kind: "signed",
        kindLabel: "Signed document",
        title: docTitle.get(String(sig.offering_document_id)) ?? "Signed document",
        detail: sig.signer_name ? `Signed by ${sig.signer_name}` : null,
        fundId: offeringId,
        fundName: offeringId ? (fundName.get(offeringId) ?? null) : null,
        date: completed,
        action: sig.pdf_path ? { type: "signature", id: sig.id } : { type: "none" },
      });
    }

    const signedDocIds = new Set(
      ((signatures ?? []) as any[]).map((s) => String(s.offering_document_id)),
    );
    for (const doc of (fundDocuments ?? []) as any[]) {
      if (signedDocIds.has(String(doc.id))) continue;
      rows.push({
        id: `fund-document:${doc.id}`,
        kind: "fund_document",
        kindLabel: "Fund document",
        title: (doc.title as string) ?? "Fund document",
        detail: doc.requires_signature ? "Awaiting your signature" : "For your records",
        fundId: String(doc.offering_id),
        fundName: fundName.get(String(doc.offering_id)) ?? null,
        date: null,
        action: { type: "fundDocument", id: String(doc.id) },
      });
    }

    for (const up of (uploads ?? []) as any[]) {
      rows.push({
        id: `upload:${up.id}`,
        kind: "upload",
        kindLabel: "You sent us",
        title: (up.file_name as string) ?? "Upload",
        detail: String(up.doc_kind ?? "").replace(/_/g, " ") || null,
        fundId: up.offering_id ? String(up.offering_id) : null,
        fundName: up.offering_id ? (fundName.get(String(up.offering_id)) ?? null) : null,
        date: iso(up.uploaded_at),
        action: { type: "upload", id: String(up.id) },
      });
    }

    for (const st of (statements ?? []) as any[]) {
      rows.push({
        id: `statement:${st.id}`,
        kind: "statement",
        kindLabel: "Capital account statement",
        title: `Statement v${st.version}${st.superseded ? " (superseded)" : ""}`,
        detail: st.statement_date ? `As at ${st.statement_date}` : null,
        fundId: st.offering_id ? String(st.offering_id) : null,
        fundName: st.offering_id ? (fundName.get(String(st.offering_id)) ?? null) : null,
        date: iso(st.statement_date),
        action: { type: "link", to: "/capital" },
      });
    }

    for (const sow of (sows ?? []) as any[]) {
      rows.push({
        id: `sow:${sow.id}`,
        kind: "agreement",
        kindLabel: "Agreement",
        title: (sow.title as string) ?? "Statement of work",
        detail: `${String(sow.status ?? "").replace(/_/g, " ")}${
          sow.client_signed_at ? " · signed" : ""
        }`,
        fundId: sow.offering_id ? String(sow.offering_id) : null,
        fundName: sow.offering_id ? (fundName.get(String(sow.offering_id)) ?? null) : null,
        date: iso(sow.client_signed_at) ?? iso(sow.effective_date),
        action: { type: "link", to: "/client/agreements" },
      });
    }

    for (const inv of (invoices ?? []) as any[]) {
      rows.push({
        id: `invoice:${inv.id}`,
        kind: "invoice",
        kindLabel: "Invoice",
        title: `Invoice ${inv.number ?? ""}`.trim(),
        detail: `${String(inv.status ?? "")}${
          inv.due_date ? ` · due ${inv.due_date}` : ""
        }`,
        fundId: inv.offering_id ? String(inv.offering_id) : null,
        fundName: inv.offering_id ? (fundName.get(String(inv.offering_id)) ?? null) : null,
        date: iso(inv.issue_date),
        action: { type: "link", to: "/client/invoices" },
      });
    }

    for (const acc of (policies ?? []) as any[]) {
      rows.push({
        id: `policy:${acc.id}`,
        kind: "policy",
        kindLabel: "Policy acceptance",
        title: `${String(acc.kind ?? "policy").replace(/_/g, " ")} v${acc.version}`,
        detail: acc.signer_name ? `Accepted by ${acc.signer_name}` : null,
        fundId: null,
        fundName: null,
        date: iso(acc.accepted_at),
        action: { type: "link", to: "/sign-off" },
      });
    }

    rows.sort((a, b) => (b.date ?? "").localeCompare(a.date ?? ""));

    const funds = Array.from(fundName.entries()).map(([id, name]) => ({ id, name }));
    return { rows, funds, isClientContact: clientIds.length > 0 };
  });
