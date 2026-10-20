import { useState } from "react";
import { createFileRoute, redirect } from "@tanstack/react-router";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { preparerAddPartyFn, preparerSaveFn, preparerWorkspaceFn } from "@/lib/investor-helpers.functions";

export const Route = createFileRoute("/onboard/prepare/$token")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Complete Investor Details - Harmonious" },
      { name: "description", content: "Fill in investor details on behalf of the investor you were assigned to help." },
      { property: "og:title", content: "Complete Investor Details - Harmonious" },
      { property: "og:description", content: "Secure investor detail preparation by Harmonious." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
  beforeLoad: async ({ location }) => {
    const { data } = await supabase.auth.getUser();
    if (!data.user) throw redirect({ to: "/auth", search: { next: location.pathname } as never });
  },
  component: PreparePage,
});

const PERSON = [["firstName", "Legal first name"], ["middleName", "Middle name"], ["lastName", "Last name"], ["phone", "Phone"], ["citizenship", "Citizenship"], ["addressLine1", "Street address"], ["addressLine2", "Apt / suite"], ["city", "City"], ["region", "State / region"], ["postalCode", "Postal code"], ["country", "Country"]] as const;
const PERSON_DB: Record<string, string> = { firstName: "legal_first_name", middleName: "legal_middle_name", lastName: "legal_last_name", phone: "phone", citizenship: "citizenship_country", addressLine1: "address_line1", addressLine2: "address_line2", city: "city", region: "region", postalCode: "postal_code", country: "country" };

function PreparePage() {
  const { token } = Route.useParams();
  const load = useServerFn(preparerWorkspaceFn);
  const saveFn = useServerFn(preparerSaveFn);
  const addFn = useServerFn(preparerAddPartyFn);
  const q = useQuery({ queryKey: ["preparer", token], queryFn: () => load({ data: { token } }), retry: false });
  const [f, setF] = useState<Record<string, string>>({});
  const [party, setParty] = useState({ firstName: "", lastName: "", email: "", role: "beneficial_owner", ownership: "", signer: false });
  const w = q.data;
  const val = (k: string) => f[k] ?? (w?.person?.[PERSON_DB[k] ?? ""] ?? "");
  const save = useMutation({
    mutationFn: () => {
      const person: Record<string, string> = {}; for (const [k] of PERSON) if (f[k] !== undefined) person[k] = f[k]!.trim();
      const tin = (f['taxId'] ?? "").replace(/\D/g, "");
      return saveFn({ data: { onboardingId: w!.onboardingId, preparerId: w!.participantId, ...(Object.keys(person).length ? { person } : {}), ...(f['legalName'] !== undefined ? { profile: { legalName: f['legalName']!.trim() || null } } : {}), ...(tin ? { taxId: tin } : {}) } });
    },
    onSuccess: (r: any) => { toast.success(r?.suggested ? `Saved. ${r.suggested} item(s) go to Harmonious to confirm.` : "Saved."); setF({}); q.refetch(); },
    onError: (e) => toast.error((e as Error).message),
  });
  const add = useMutation({
    mutationFn: () => addFn({ data: { onboardingId: w!.onboardingId, preparerId: w!.participantId, add: { firstName: party.firstName, lastName: party.lastName, email: party.email || null, role: party.role, ownershipPercent: party.ownership ? Number(party.ownership) : null, isSigner: party.signer } } }),
    onSuccess: () => { toast.success("Added."); setParty({ firstName: "", lastName: "", email: "", role: "beneficial_owner", ownership: "", signer: false }); q.refetch(); },
    onError: (e) => toast.error((e as Error).message),
  });

  return (
    <main className="mx-auto max-w-2xl space-y-4 p-4 sm:p-8">
      {q.isLoading ? <p className="text-sm text-muted-foreground">Loading…</p> : q.isError ? (
        <Card><CardContent className="p-6 text-sm">{(q.error as Error).message.replace(/^Forbidden: /, "")}</CardContent></Card>
      ) : w && (
        <>
          <div><h1 className="text-2xl font-semibold">Investor details for {w.fundName}</h1>
            <p className="text-sm text-muted-foreground">You're preparing these details for the investor. Identity checks, signing and funding stay with the investor and their signer. Every change is recorded.</p></div>
          {!w.editable ? <Card><CardContent className="p-6 text-sm">Signing or funding has started, so details can no longer be changed here.</CardContent></Card> : (
            <>
              <Card><CardHeader><CardTitle className="text-base">Investor</CardTitle></CardHeader>
                <CardContent className="grid gap-3 sm:grid-cols-2">
                  {w.profile && w.profile.type !== "individual" ? <div className="space-y-1 sm:col-span-2"><Label htmlFor="p-legal">Entity / business legal name</Label><Input id="p-legal" value={f['legalName'] ?? w.profile.legalName ?? ""} onChange={(e) => setF({ ...f, legalName: e.target.value })} /></div> : null}
                  {PERSON.map(([k, label]) => <div key={k} className="space-y-1"><Label htmlFor={`p-${k}`}>{label}</Label><Input id={`p-${k}`} value={val(k)} onChange={(e) => setF({ ...f, [k]: e.target.value })} /></div>)}
                  <div className="space-y-1"><Label htmlFor="p-tin">{w.profile && w.profile.type !== "individual" ? "EIN" : "SSN / Tax ID"}{w.profile?.taxIdLast4 ? ` (on file ••• ${w.profile.taxIdLast4})` : ""}</Label><Input id="p-tin" type="password" inputMode="numeric" autoComplete="off" placeholder="9 digits" value={f['taxId'] ?? ""} onChange={(e) => setF({ ...f, taxId: e.target.value })} /></div>
                  <div className="sm:col-span-2"><Button disabled={save.isPending} onClick={() => save.mutate()}>{save.isPending ? "Saving…" : "Save details"}</Button></div>
                </CardContent></Card>
              <Card><CardHeader><CardTitle className="text-base">Owners and signers</CardTitle></CardHeader>
                <CardContent className="space-y-3">
                  {w.related.length ? <ul className="space-y-1 text-sm">{w.related.map((r: any) => <li key={r.id}>{r.name} · {String(r.role).replace(/_/g, " ")}{r.ownershipPercent != null ? ` · ${r.ownershipPercent}%` : ""}{r.isSigner ? " · signer" : ""}</li>)}</ul> : <p className="text-sm text-muted-foreground">None added yet.</p>}
                  <div className="grid gap-2 sm:grid-cols-2">
                    <Input aria-label="First name" placeholder="First name" value={party.firstName} onChange={(e) => setParty({ ...party, firstName: e.target.value })} />
                    <Input aria-label="Last name" placeholder="Last name" value={party.lastName} onChange={(e) => setParty({ ...party, lastName: e.target.value })} />
                    <Input aria-label="Email" placeholder="Email (optional)" value={party.email} onChange={(e) => setParty({ ...party, email: e.target.value })} />
                    <Input aria-label="Ownership percent" placeholder="Ownership % (optional)" inputMode="decimal" value={party.ownership} onChange={(e) => setParty({ ...party, ownership: e.target.value })} />
                    <select aria-label="Role" className="h-9 rounded-md border bg-background px-2 text-sm" value={party.role} onChange={(e) => setParty({ ...party, role: e.target.value })}>
                      {["beneficial_owner", "control_person", "authorized_signer", "trustee", "officer", "manager", "member"].map((r) => <option key={r} value={r}>{r.replace(/_/g, " ")}</option>)}
                    </select>
                    <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={party.signer} onChange={(e) => setParty({ ...party, signer: e.target.checked })} />Can sign</label>
                  </div>
                  <Button variant="outline" disabled={add.isPending || !party.firstName || !party.lastName} onClick={() => add.mutate()}>Add person</Button>
                </CardContent></Card>
            </>
          )}
        </>
      )}
    </main>
  );
}
