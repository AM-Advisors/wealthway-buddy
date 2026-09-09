import { regTypeLabel, requiresPreExistingRelationship } from "@/lib/reg-types";
import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { supabase } from "@/integrations/supabase/client";
import {
  getRoomApplication,
  recordRoomUpload,
  saveRoomAccreditation,
  saveRoomIdentity,
  submitRoomApplication,
} from "@/lib/room-kyc.functions";

type Kind = "identification" | "proof_of_address";

const statusLook: Record<string, { label: string; tone: "default" | "secondary" | "outline" | "destructive" }> = {
  not_started: { label: "Not started", tone: "outline" },
  pending: { label: "In progress", tone: "secondary" },
  review: { label: "With the fund team", tone: "secondary" },
  approved: { label: "Approved", tone: "default" },
  declined: { label: "Needs your attention", tone: "destructive" },
};

function when(value?: string | null) {
  if (!value) return "";
  return new Date(value).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
}

export function RoomKycApplication({ offeringId }: { offeringId: string }) {
  const queryClient = useQueryClient();
  const load = useServerFn(getRoomApplication);
  const saveIdentity = useServerFn(saveRoomIdentity);
  const saveAccreditation = useServerFn(saveRoomAccreditation);
  const record = useServerFn(recordRoomUpload);
  const submitAll = useServerFn(submitRoomApplication);

  const { data, isLoading } = useQuery({
    queryKey: ["room-kyc", offeringId],
    queryFn: () => load({ data: { offering_id: offeringId } }),
  });

  const app = (data as any)?.application ?? null;
  const profile = (data as any)?.profile ?? null;
  const kyc = (data as any)?.kyc ?? null;
  const accreditation = (data as any)?.accreditation ?? null;
  const uploads = ((data as any)?.uploads ?? []) as any[];
  const offering = (data as any)?.offering ?? null;
  const reg = (offering?.reg_type ?? "506b") as string;

  const [form, setForm] = useState<Record<string, string>>({});
  const [acc, setAcc] = useState<Record<string, any>>({
    basis: "income",
    income_last_two_years: false,
    net_worth_over_1m: false,
    professional_license: "",
    pre_existing_relationship: "",
    attested_signature: "",
    attests: false,
  });
  const [uploading, setUploading] = useState<Kind | null>(null);

  useEffect(() => {
    if (!profile) return;
    const identity = (kyc?.result ?? {}) as any;
    setForm((prev) =>
      Object.keys(prev).length
        ? prev
        : {
            legal_name: profile.legal_name ?? "",
            investor_type: profile.investor_type ?? "individual",
            email: profile.email ?? "",
            phone: profile.phone ?? "",
            date_of_birth: profile.date_of_birth ?? "",
            tax_id: profile.tax_id ?? "",
            entity_name: profile.entity_name ?? "",
            address_line1: profile.address_line1 ?? "",
            address_line2: profile.address_line2 ?? "",
            city: profile.city ?? "",
            region: profile.region ?? "",
            postal_code: profile.postal_code ?? "",
            country: profile.country ?? "United States",
            id_document_type: identity.id_document_type ?? "passport",
            id_document_number: "",
            id_issuing_country: identity.id_issuing_country ?? "United States",
            id_expiration: identity.id_expiration ?? "",
          },
    );
  }, [profile, kyc]);

  useEffect(() => {
    const q = (accreditation?.questionnaire ?? null) as any;
    if (!q) return;
    setAcc((prev) => (prev["attested_signature"] ? prev : { ...prev, ...q, attests: true }));
  }, [accreditation]);

  const set = (key: string) => (value: string) => setForm((f) => ({ ...f, [key]: value }));

  const has = useMemo(
    () => ({
      identification: uploads.some((u) => u.doc_kind === "identification"),
      proof_of_address: uploads.some((u) => u.doc_kind === "proof_of_address"),
    }),
    [uploads],
  );

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ["room-kyc", offeringId] });
  const onError = (e: any) => toast.error(e?.message ?? "Something went wrong.");

  const identityMutation = useMutation({
    mutationFn: () => saveIdentity({ data: { ...(form as any), offering_id: offeringId } }),
    onSuccess: () => {
      toast.success("Your details are saved.");
      invalidate();
    },
    onError,
  });

  const accreditationMutation = useMutation({
    mutationFn: () => saveAccreditation({ data: { ...(acc as any), offering_id: offeringId } }),
    onSuccess: () => {
      toast.success("Accreditation answers saved.");
      invalidate();
    },
    onError,
  });

  const submitMutation = useMutation({
    mutationFn: () => submitAll({ data: { offering_id: offeringId } }),
    onSuccess: () => {
      toast.success("Application sent — the fund team will review it.");
      invalidate();
      queryClient.invalidateQueries({ queryKey: ["step-rail", offeringId] });
      queryClient.invalidateQueries({ queryKey: ["diligence-activity", offeringId] });
    },
    onError,
  });

  async function onFile(kind: Kind, e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 25 * 1024 * 1024) {
      toast.error("Files must be 25 MB or smaller.");
      e.target.value = "";
      return;
    }
    setUploading(kind);
    try {
      const { data: userData } = await supabase.auth.getUser();
      const uid = userData.user?.id;
      if (!uid) throw new Error("Your session expired. Please sign in again.");
      const path = `${uid}/${crypto.randomUUID()}-${file.name.replace(/[^\w.\-]/g, "_")}`;
      const { error } = await supabase.storage.from("investor-uploads").upload(path, file);
      if (error) throw new Error(error.message);
      await record({
        data: { offering_id: offeringId, storage_path: path, file_name: file.name, doc_kind: kind },
      });
      toast.success("Uploaded.");
      invalidate();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Upload failed.");
    } finally {
      setUploading(null);
      e.target.value = "";
    }
  }

  if (isLoading) return <p className="text-sm text-muted-foreground">Loading your application…</p>;

  if (!app) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Your application</CardTitle>
          <CardDescription>
            The fund team has not opened an application for you in this fund yet. Ask them for an invitation
            and it will appear here.
          </CardDescription>
        </CardHeader>
      </Card>
    );
  }

  const kycLook = statusLook[app.kyc_status] ?? statusLook["not_started"]!;
  const accLook = statusLook[app.accreditation_status] ?? statusLook["not_started"]!;
  const bothApproved = app.kyc_status === "approved" && app.accreditation_status === "approved";
  const inReview = app.kyc_status === "review" || app.accreditation_status === "review";
  const declined = app.kyc_status === "declined" || app.accreditation_status === "declined";
  const locked = inReview || bothApproved;

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <CardTitle>Your application to {offering?.name}</CardTitle>
              <CardDescription>
                Send your identity details, a government ID, a proof of address and your accreditation
                answers. The fund team approves them before the wire step opens.
              </CardDescription>
            </div>
            <div className="flex gap-2">
              <Badge variant={kycLook.tone}>Identity: {kycLook.label}</Badge>
              <Badge variant={accLook.tone}>Accreditation: {accLook.label}</Badge>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          {bothApproved ? (
            <p className="rounded-md border border-emerald-300 bg-emerald-50 p-3 text-emerald-900">
              You are approved. The funding step is open — you can send your wire or set up a debit.
            </p>
          ) : inReview ? (
            <p className="rounded-md border border-amber-300 bg-amber-50 p-3 text-amber-900">
              Your application is with the fund team. You will hear from them once it is reviewed; the wire
              step stays closed until then.
            </p>
          ) : declined ? (
            <p className="rounded-md border border-destructive/30 bg-destructive/5 p-3 text-destructive">
              The fund team asked for something to be corrected
              {accreditation?.review_notes ? `: ${accreditation.review_notes}` : ""}. Update your answers and
              send the application again.
            </p>
          ) : (
            <p className="text-muted-foreground">
              Nothing is shared with anyone outside the fund team. You can save each part as you go and send
              it all when you are ready.
            </p>
          )}
        </CardContent>
      </Card>

      {/* ---------------------------- Identity ---------------------------- */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">1. About you</CardTitle>
          <CardDescription>Your legal details, exactly as they appear on your ID.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <Field id="legal_name" label="Full legal name" value={form["legal_name"]} onChange={set("legal_name")} />
          <div className="space-y-2">
            <Label>Investor type</Label>
            <Select value={form["investor_type"] ?? "individual"} onValueChange={set("investor_type")}>
              <SelectTrigger><SelectValue placeholder="Select" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="individual">Individual</SelectItem>
                <SelectItem value="joint">Joint</SelectItem>
                <SelectItem value="entity">Entity / company</SelectItem>
                <SelectItem value="trust">Trust</SelectItem>
                <SelectItem value="ira">IRA / retirement account</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <Field id="email" label="Email" value={form["email"]} onChange={set("email")} />
          <Field id="phone" label="Phone" value={form["phone"]} onChange={set("phone")} />
          <Field id="date_of_birth" label="Date of birth" type="date" value={form["date_of_birth"]} onChange={set("date_of_birth")} />
          <Field id="tax_id" label="SSN or EIN" value={form["tax_id"]} onChange={set("tax_id")} />
          <Field id="entity_name" label="Entity name (if investing through one)" value={form["entity_name"]} onChange={set("entity_name")} />
          <Field id="address_line1" label="Street address" value={form["address_line1"]} onChange={set("address_line1")} />
          <Field id="address_line2" label="Address line 2" value={form["address_line2"]} onChange={set("address_line2")} />
          <Field id="city" label="City" value={form["city"]} onChange={set("city")} />
          <Field id="region" label="State / region" value={form["region"]} onChange={set("region")} />
          <Field id="postal_code" label="Postal code" value={form["postal_code"]} onChange={set("postal_code")} />
          <Field id="country" label="Country" value={form["country"]} onChange={set("country")} />
          <div className="space-y-2">
            <Label>ID document type</Label>
            <Select value={form["id_document_type"] ?? "passport"} onValueChange={set("id_document_type")}>
              <SelectTrigger><SelectValue placeholder="Select" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="passport">Passport</SelectItem>
                <SelectItem value="drivers_license">Driver's licence</SelectItem>
                <SelectItem value="state_id">State ID</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <Field id="id_document_number" label="ID number" value={form["id_document_number"]} onChange={set("id_document_number")} />
          <Field id="id_issuing_country" label="Issuing country" value={form["id_issuing_country"]} onChange={set("id_issuing_country")} />
          <Field id="id_expiration" label="ID expiry date" type="date" value={form["id_expiration"]} onChange={set("id_expiration")} />
          <div className="sm:col-span-2">
            <Button
              disabled={locked || identityMutation.isPending}
              onClick={() => identityMutation.mutate()}
            >
              {identityMutation.isPending ? "Saving…" : "Save my details"}
            </Button>
            {kyc?.result?.id_document_type ? (
              <span className="ml-3 text-xs text-muted-foreground">
                Saved {when(kyc.updated_at)} · we only keep the last four digits of your ID number
              </span>
            ) : null}
          </div>
        </CardContent>
      </Card>

      {/* ----------------------------- Files ------------------------------ */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">2. Your documents</CardTitle>
          <CardDescription>
            A government ID and something showing your home address dated in the last three months — a utility
            bill or bank statement works.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-6 sm:grid-cols-2">
          {(["identification", "proof_of_address"] as Kind[]).map((kind) => (
            <div key={kind} className="space-y-2 rounded-md border p-4">
              <div className="flex items-center justify-between">
                <p className="text-sm font-medium">
                  {kind === "identification" ? "Government ID" : "Proof of address"}
                </p>
                <Badge variant={has[kind] ? "secondary" : "outline"}>
                  {has[kind] ? "Received" : "Needed"}
                </Badge>
              </div>
              <Input
                type="file"
                accept=".pdf,.png,.jpg,.jpeg,.heic"
                disabled={locked || uploading !== null}
                onChange={(e) => onFile(kind, e)}
              />
              <ul className="space-y-1 text-xs text-muted-foreground">
                {uploads
                  .filter((u) => u.doc_kind === kind)
                  .map((u) => (
                    <li key={u.id}>
                      {u.file_name} · sent {when(u.uploaded_at)}
                      {u.review_status && u.review_status !== "pending" ? ` · ${u.review_status}` : ""}
                    </li>
                  ))}
              </ul>
            </div>
          ))}
        </CardContent>
      </Card>

      {/* ------------------------- Accreditation -------------------------- */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">3. Accreditation</CardTitle>
          <CardDescription>
            This is a {regTypeLabel(reg)} offering, so you must qualify as an
            accredited investor.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4 text-sm">
          <div className="space-y-2">
            <Label>How do you qualify?</Label>
            <Select value={acc["basis"]} onValueChange={(v) => setAcc((a) => ({ ...a, basis: v }))}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="income">Income over $200k ($300k with spouse)</SelectItem>
                <SelectItem value="net_worth">Net worth over $1m, excluding my home</SelectItem>
                <SelectItem value="professional_certification">Series 7, 65 or 82 licence</SelectItem>
                <SelectItem value="entity_assets">Entity with over $5m in assets</SelectItem>
                <SelectItem value="knowledgeable_employee">Knowledgeable employee of the fund</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <label className="flex items-start gap-3">
            <Checkbox
              checked={Boolean(acc["income_last_two_years"])}
              onCheckedChange={(v) => setAcc((a) => ({ ...a, income_last_two_years: Boolean(v) }))}
            />
            <span>I earned over $200,000 (or $300,000 jointly) in each of the last two years.</span>
          </label>
          <label className="flex items-start gap-3">
            <Checkbox
              checked={Boolean(acc["net_worth_over_1m"])}
              onCheckedChange={(v) => setAcc((a) => ({ ...a, net_worth_over_1m: Boolean(v) }))}
            />
            <span>My net worth is over $1,000,000, not counting my primary home.</span>
          </label>

          <div className="space-y-2">
            <Label htmlFor="licence">Professional licence (if any)</Label>
            <Input
              id="licence"
              maxLength={120}
              value={acc["professional_license"] ?? ""}
              onChange={(e) => setAcc((a) => ({ ...a, professional_license: e.target.value }))}
            />
          </div>

          {requiresPreExistingRelationship(reg) ? (
            <div className="space-y-2">
              <Label htmlFor="relationship">Your existing relationship with the fund manager</Label>
              <Textarea
                id="relationship"
                maxLength={600}
                rows={3}
                value={acc["pre_existing_relationship"] ?? ""}
                onChange={(e) => setAcc((a) => ({ ...a, pre_existing_relationship: e.target.value }))}
              />
            </div>
          ) : null}

          <div className="space-y-2">
            <Label htmlFor="sign">Type your full legal name to attest</Label>
            <Input
              id="sign"
              maxLength={120}
              value={acc["attested_signature"] ?? ""}
              onChange={(e) => setAcc((a) => ({ ...a, attested_signature: e.target.value }))}
            />
          </div>
          <label className="flex items-start gap-3">
            <Checkbox
              checked={Boolean(acc["attests"])}
              onCheckedChange={(v) => setAcc((a) => ({ ...a, attests: Boolean(v) }))}
            />
            <span>These answers are true and complete, and I understand the fund will rely on them.</span>
          </label>

          <Button
            disabled={locked || !acc["attests"] || accreditationMutation.isPending}
            onClick={() => accreditationMutation.mutate()}
          >
            {accreditationMutation.isPending ? "Saving…" : "Save accreditation answers"}
          </Button>
          {accreditation?.attested_at ? (
            <p className="text-xs text-muted-foreground">Signed {when(accreditation.attested_at)}.</p>
          ) : null}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">4. Send it for approval</CardTitle>
          <CardDescription>
            The fund team checks your details and documents. Until they approve you, the wire step stays
            closed.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Button
            size="lg"
            disabled={locked || submitMutation.isPending}
            onClick={() => submitMutation.mutate()}
          >
            {submitMutation.isPending
              ? "Sending…"
              : inReview
                ? "Already with the fund team"
                : bothApproved
                  ? "Approved"
                  : "Send my application"}
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}

function Field({
  id,
  label,
  value,
  onChange,
  type = "text",
}: {
  id: string;
  label: string;
  value: string | undefined;
  onChange: (value: string) => void;
  type?: string;
}) {
  return (
    <div className="space-y-2">
      <Label htmlFor={id}>{label}</Label>
      <Input id={id} type={type} value={value ?? ""} onChange={(e) => onChange(e.target.value)} />
    </div>
  );
}
