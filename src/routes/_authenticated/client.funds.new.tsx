import { useMutation, useQuery } from "@tanstack/react-query";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { format, parseISO } from "date-fns";
import { CalendarIcon, Check, Plus, Trash2, Upload } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { z } from "zod";

import { useClientPortal } from "@/components/client-portal-context";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import {
  EXEMPTIONS, INVESTMENT_ASSET_TYPES, JURISDICTIONS, VEHICLE_STRUCTURES, defaultVehicle, eligibilityFor,
} from "@/lib/client-portal-model";
import {
  getFundRequestDraft, saveFundRequestDraft, submitFundRequest, uploadFundRequestFile,
} from "@/lib/client-fund-request.functions";
import {
  CLASS_TERM_OPTIONS, FUND_KIND_TYPES, REQUEST_STEPS, autoServices, emptyRequest, isSpv, missingFields,
  type FundRequest, type RequestStepKey,
} from "@/lib/fund-request-model";
import { categoryLabel, listServiceCatalog } from "@/lib/service-catalog.functions";

export const Route = createFileRoute("/_authenticated/client/funds/new")({
  validateSearch: (s) => z.object({ draft: z.string().uuid().optional() }).parse(s),
  head: () => ({
    meta: [
      { title: "Launch a new fund or SPV — Harmonious" },
      { name: "description", content: "Tell Harmonious everything needed to set up your new fund or SPV." },
      { property: "og:title", content: "Launch a new fund or SPV — Harmonious" },
      { property: "og:description", content: "A guided form that follows Harmonious Fund Setup." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: NewFundRequest,
});

const DOC_KINDS = ["Subscription agreement", "Operating agreement / LPA", "PPM", "Side letter", "Other"];
const ENTITY_DOC_KINDS = ["Formation document", "Certificate of formation", "IRS EIN letter"];

function NewFundRequest() {
  const { draft } = Route.useSearch();
  const navigate = useNavigate();
  const { data, clientId } = useClientPortal();
  const id = clientId ?? ((data?.client as any)?.id as string | undefined) ?? null;
  const [r, setR] = useState<FundRequest>(emptyRequest());
  const [step, setStep] = useState<RequestStepKey>("details");
  const [draftId, setDraftId] = useState<string | null>(draft ?? null);

  const loadDraft = useServerFn(getFundRequestDraft);
  const save = useServerFn(saveFundRequestDraft);
  const submit = useServerFn(submitFundRequest);
  const catalogueFn = useServerFn(listServiceCatalog);
  const catalogue = useQuery({ queryKey: ["service-catalogue"], queryFn: () => catalogueFn({ data: {} }) });

  const dq = useQuery({ queryKey: ["fund-request-draft", draft], enabled: !!draft, queryFn: () => loadDraft({ data: { draftId: draft! } }) });
  useEffect(() => {
    if (dq.data?.request) setR({ ...emptyRequest(), ...dq.data.request });
  }, [dq.data]);

  const set = <K extends keyof FundRequest>(k: K, v: FundRequest[K]) => setR((p) => ({ ...p, [k]: v }));
  const setKind = (kind: string) =>
    setR((p) => {
      const vehicle = defaultVehicle(kind === "spv" ? "launch_spv" : "launch_fund", kind);
      const next = { ...p, kind, vehicle_structure: vehicle };
      return { ...next, service_keys: Array.from(new Set([...p.service_keys.filter((k) => !autoServices(p).includes(k)), ...autoServices(next)])) };
    });
  const setStructureOrExemption = (k: "vehicle_structure" | "offering_exemption", v: string) =>
    setR((p) => {
      const next = { ...p, [k]: v, ...(k === "offering_exemption" ? { investor_eligibility: eligibilityFor(v) } : {}) };
      return { ...next, service_keys: Array.from(new Set([...p.service_keys.filter((x) => !autoServices(p).includes(x)), ...autoServices(next)])) };
    });

  const saveDraft = useMutation({
    mutationFn: async () => {
      if (!id) throw new Error("No client account selected.");
      const res = await save({ data: { clientId: id, draftId, request: r as any } });
      setDraftId(res.id);
      return res;
    },
    onSuccess: () => toast.success("Draft saved."),
    onError: (e: any) => toast.error(e?.message ?? "Could not save."),
  });
  const send = useMutation({
    mutationFn: async () => {
      if (!id) throw new Error("No client account selected.");
      return submit({ data: { clientId: id, draftId, request: r as any } });
    },
    onSuccess: (res) => {
      toast.success(res.duplicate
        ? "Sent. Harmonious will check whether this matches a fund you already have."
        : "Sent to Harmonious. Your new fund is now in Funds while we set it up.");
      if (res.offeringId) void navigate({ to: "/client/funds/$fundId", params: { fundId: res.offeringId } });
      else void navigate({ to: "/client/home" });
    },
    onError: (e: any) => toast.error(e?.message ?? "Could not send."),
  });

  const missing = missingFields(r);
  const idx = REQUEST_STEPS.findIndex((s) => s.key === step);
  const go = (d: number) => setStep(REQUEST_STEPS[Math.min(REQUEST_STEPS.length - 1, Math.max(0, idx + d))]!.key);
  const spv = isSpv(r);

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <Link to="/client/funds" className="text-xs text-muted-foreground hover:underline">← Funds</Link>
          <h2 className="text-xl font-semibold tracking-tight">Launch a new fund or SPV</h2>
          <p className="text-sm text-muted-foreground">Follows the same steps Harmonious uses for Fund Setup. Save and come back any time.</p>
        </div>
        <Button size="sm" variant="outline" disabled={saveDraft.isPending} onClick={() => saveDraft.mutate()}>Save draft</Button>
      </div>

      <div className="flex flex-col gap-5 md:flex-row">
        <nav aria-label="Steps" className="flex gap-1 overflow-x-auto md:w-52 md:shrink-0 md:flex-col">
          {REQUEST_STEPS.map((s, i) => (
            <button
              key={s.key}
              type="button"
              onClick={() => setStep(s.key)}
              className={cn(
                "flex items-center gap-2 whitespace-nowrap rounded-md px-3 py-2 text-left text-sm text-muted-foreground hover:bg-muted",
                step === s.key && "bg-primary text-primary-foreground hover:bg-primary",
              )}
            >
              <span className="flex size-5 items-center justify-center rounded-full border text-xs">{i + 1}</span>
              {s.label}
              {missing[s.key] ? <span className="ml-auto size-2 rounded-full bg-destructive" aria-label="Needs answers" /> : null}
            </button>
          ))}
        </nav>

        <Card className="min-w-0 flex-1">
          <CardHeader>
            <CardTitle className="text-base">{REQUEST_STEPS[idx]!.label}</CardTitle>
            {missing[step] && <CardDescription className="text-destructive">Still needed: {missing[step]!.join(", ")}</CardDescription>}
          </CardHeader>
          <CardContent className="space-y-4">
            {step === "details" && (
              <Grid>
                <F label="Fund or SPV type *">
                  <Pick value={r.kind} onChange={setKind} options={FUND_KIND_TYPES.map((k) => ({ value: k.value, label: k.label }))} />
                </F>
                <F label={`${spv ? "SPV" : "Fund"} name *`}><Input value={r.fund_name} onChange={(e) => set("fund_name", e.target.value)} /></F>
                <F label="Investment / asset type"><Pick value={r.investment_asset} onChange={(v) => set("investment_asset", v)} options={INVESTMENT_ASSET_TYPES} /></F>
                <F label={spv ? "Target raise" : "Target fund size"}><Money value={r.target_raise} onChange={(v) => set("target_raise", v)} /></F>
                <F label="Minimum investment"><Money value={r.minimum_investment} onChange={(v) => set("minimum_investment", v)} /></F>
                <F label="Expected close"><DatePick value={r.expected_close} onChange={(v) => set("expected_close", v)} /></F>
                <F label="Bank or custodian"><Input value={r.bank_or_custodian} onChange={(e) => set("bank_or_custodian", e.target.value)} placeholder="Name, if known" /></F>
                <F label="Counsel"><Input value={r.counsel} onChange={(e) => set("counsel", e.target.value)} placeholder="Law firm, if known" /></F>
                <F label="Auditor"><Input value={r.auditor} onChange={(e) => set("auditor", e.target.value)} placeholder="If applicable" /></F>
                <F label="Tax preparer">
                  <Pick value={r.tax_preparer === "Harmonious" ? "Harmonious" : "Someone else"} onChange={(v) => set("tax_preparer", v === "Harmonious" ? "Harmonious" : "")} options={["Harmonious", "Someone else"]} />
                  {r.tax_preparer !== "Harmonious" && <Input className="mt-2" placeholder="Tax preparer name" value={r.tax_preparer} onChange={(e) => set("tax_preparer", e.target.value)} />}
                </F>
              </Grid>
            )}

            {step === "entity" && (
              <>
                <Grid>
                  <F label="Legal name"><Input value={r.legal_name} onChange={(e) => set("legal_name", e.target.value)} placeholder="e.g. Acme Ventures I, LP" /></F>
                  <F label="Vehicle / entity structure *"><Pick value={r.vehicle_structure} onChange={(v) => setStructureOrExemption("vehicle_structure", v)} options={VEHICLE_STRUCTURES} /></F>
                  <F label="Jurisdiction *"><Pick value={r.jurisdiction} onChange={(v) => set("jurisdiction", v)} options={JURISDICTIONS} /></F>
                  <F label="Already formed?"><Pick value={r.already_formed} onChange={(v) => set("already_formed", v as any)} options={[{ value: "yes", label: "Yes" }, { value: "no", label: "No — Harmonious to form" }]} /></F>
                  {r.already_formed === "yes" && <F label="Date formed"><DatePick value={r.date_formed} onChange={(v) => set("date_formed", v)} /></F>}
                  <F label="Has an EIN?"><Pick value={r.has_ein} onChange={(v) => set("has_ein", v as any)} options={[{ value: "yes", label: "Yes" }, { value: "no", label: "No — Harmonious to apply" }]} /></F>
                </Grid>
                <p className="text-xs text-muted-foreground">Don't type the EIN here — upload the IRS letter instead.</p>
                <DocUploads clientId={id} kinds={ENTITY_DOC_KINDS} docs={r.documents} onChange={(d) => set("documents", d)} />
              </>
            )}

            {step === "economics" && (
              <Grid>
                <F label="Offering exemption *">
                  <Pick value={r.offering_exemption} onChange={(v) => setStructureOrExemption("offering_exemption", v)} options={EXEMPTIONS.map((e) => e.value)} />
                  {r.offering_exemption && (
                    <div className="mt-2 rounded-md border bg-muted p-3 text-xs">
                      <p className="font-medium">Who can invest</p>
                      <p className="mt-1 text-muted-foreground">{eligibilityFor(r.offering_exemption)}</p>
                      <p className="mt-1 text-muted-foreground">General guidance — counsel confirms.</p>
                    </div>
                  )}
                </F>
                <F label="Management fee"><Fee value={r.management_fee} onChange={(v) => set("management_fee", v)} /></F>
                <F label={r.kind === "real_estate" ? "Promote" : "Carried interest / promote"}><Fee value={r.carried_interest} onChange={(v) => set("carried_interest", v)} /></F>
                <F label="Preferred return"><Pick value={r.preferred_return} onChange={(v) => set("preferred_return", v)} options={CLASS_TERM_OPTIONS.hurdle} /></F>
                <F label="GP commitment"><Money value={r.gp_commitment} onChange={(v) => set("gp_commitment", v)} /></F>
                {!spv && <F label="Fund term"><Input value={r.fund_term} onChange={(e) => set("fund_term", e.target.value)} placeholder="e.g. 10 years" /></F>}
                {!spv && <F label="Investment period"><Input value={r.investment_period} onChange={(e) => set("investment_period", e.target.value)} placeholder="e.g. 3 years" /></F>}
              </Grid>
            )}

            {step === "classes" && (
              <div className="space-y-3">
                {r.classes.map((c, i) => (
                  <div key={i} className="grid gap-3 rounded-md border p-3 sm:grid-cols-5">
                    <F label="Class name"><Input value={c.name} onChange={(e) => set("classes", r.classes.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)))} /></F>
                    <F label="Fee"><Pick value={c.fee} onChange={(v) => set("classes", r.classes.map((x, j) => (j === i ? { ...x, fee: v } : x)))} options={CLASS_TERM_OPTIONS.fee} /></F>
                    <F label="Carry"><Pick value={c.carry} onChange={(v) => set("classes", r.classes.map((x, j) => (j === i ? { ...x, carry: v } : x)))} options={CLASS_TERM_OPTIONS.carry} /></F>
                    <F label="Hurdle"><Pick value={c.hurdle} onChange={(v) => set("classes", r.classes.map((x, j) => (j === i ? { ...x, hurdle: v } : x)))} options={CLASS_TERM_OPTIONS.hurdle} /></F>
                    <F label="Minimum">
                      <div className="flex gap-1">
                        <Money value={c.minimum} onChange={(v) => set("classes", r.classes.map((x, j) => (j === i ? { ...x, minimum: v } : x)))} />
                        {r.classes.length > 1 && <Button size="icon" variant="ghost" aria-label="Remove class" onClick={() => set("classes", r.classes.filter((_, j) => j !== i))}><Trash2 className="size-4" /></Button>}
                      </div>
                    </F>
                  </div>
                ))}
                <Button size="sm" variant="outline" onClick={() => set("classes", [...r.classes, { name: `Class ${String.fromCharCode(65 + r.classes.length)}`, fee: "", carry: "", hurdle: "", minimum: "" }])}><Plus className="mr-1 size-4" />Add class</Button>
              </div>
            )}

            {step === "documents" && (
              <div className="space-y-3">
                <F label="Offering documents">
                  <Pick value={r.documents_path} onChange={(v) => set("documents_path", v as any)} options={[{ value: "have", label: "I have documents to upload" }, { value: "prepare", label: "Harmonious to prepare from templates" }]} />
                </F>
                {r.documents_path === "have" && <DocUploads clientId={id} kinds={DOC_KINDS} docs={r.documents} onChange={(d) => set("documents", d)} />}
                <p className="text-xs text-muted-foreground">Harmonious reviews every document and sets up signing before anything goes to investors.</p>
              </div>
            )}

            {step === "banking" && (
              <Grid>
                <F label="Bank account">
                  <Pick value={r.banking_path} onChange={(v) => set("banking_path", v as any)} options={[{ value: "harmonious", label: "Harmonious to coordinate bank setup" }, { value: "client", label: "We'll use our own bank" }]} />
                </F>
                {r.banking_path === "client" && <F label="Bank name"><Input value={r.bank_name} onChange={(e) => set("bank_name", e.target.value)} /></F>}
                <p className="text-xs text-muted-foreground sm:col-span-2">Don't enter account or wire numbers here — Harmonious collects and verifies them separately.</p>
              </Grid>
            )}

            {step === "people" && (
              <div className="space-y-4">
                <div>
                  <p className="mb-2 text-sm font-medium">Signatory *</p>
                  <Grid>
                    <F label="Name"><Input value={r.signatory.name} onChange={(e) => set("signatory", { ...r.signatory, name: e.target.value })} /></F>
                    <F label="Email"><Input type="email" value={r.signatory.email} onChange={(e) => set("signatory", { ...r.signatory, email: e.target.value })} /></F>
                    <F label="Title"><Input value={r.signatory.title} onChange={(e) => set("signatory", { ...r.signatory, title: e.target.value })} placeholder="e.g. Managing Member" /></F>
                  </Grid>
                </div>
                <div className="space-y-2">
                  <p className="text-sm font-medium">Fund managers</p>
                  {r.managers.map((m, i) => (
                    <div key={i} className="flex gap-2">
                      <Input placeholder="Name" value={m.name} onChange={(e) => set("managers", r.managers.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)))} />
                      <Input placeholder="Email" value={m.email} onChange={(e) => set("managers", r.managers.map((x, j) => (j === i ? { ...x, email: e.target.value } : x)))} />
                      <Button size="icon" variant="ghost" aria-label="Remove" onClick={() => set("managers", r.managers.filter((_, j) => j !== i))}><Trash2 className="size-4" /></Button>
                    </div>
                  ))}
                  <Button size="sm" variant="outline" onClick={() => set("managers", [...r.managers, { name: "", email: "", title: "" }])}><Plus className="mr-1 size-4" />Add fund manager</Button>
                  <p className="text-xs text-muted-foreground">Nobody is invited yet — Harmonious confirms access during setup.</p>
                </div>
              </div>
            )}

            {step === "services" && (
              <div className="space-y-4">
                {(["core", "addon"] as const).map((group) => {
                  const core = autoServices(r);
                  const list = (catalogue.data?.services ?? []).filter((s: any) => (group === "core" ? core.includes(s.key) : !core.includes(s.key)));
                  if (!list.length) return null;
                  return (
                    <div key={group} className="space-y-2">
                      <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{group === "core" ? "Included with your setup" : "Add-ons (à la carte)"}</p>
                      {list.map((s: any) => (
                        <label key={s.id} className="flex cursor-pointer items-start gap-3 rounded-md border p-3">
                          <Checkbox checked={r.service_keys.includes(s.key)} onCheckedChange={() => set("service_keys", r.service_keys.includes(s.key) ? r.service_keys.filter((k) => k !== s.key) : [...r.service_keys, s.key])} />
                          <span className="text-sm"><span className="font-medium">{s.name}</span><span className="block text-xs text-muted-foreground">{categoryLabel(s.category)}</span></span>
                        </label>
                      ))}
                    </div>
                  );
                })}
                <p className="text-xs text-muted-foreground">Harmonious confirms the final services and price before anything is agreed.</p>
              </div>
            )}

            {step === "review" && (
              <div className="space-y-4">
                {REQUEST_STEPS.filter((s) => s.key !== "review").map((s) => (
                  <div key={s.key} className="flex items-start justify-between gap-3 rounded-md border p-3 text-sm">
                    <div>
                      <p className="font-medium">{s.label}</p>
                      <p className="text-xs text-muted-foreground">{missing[s.key] ? `Still needed: ${missing[s.key]!.join(", ")}` : "Ready"}</p>
                    </div>
                    <div className="flex items-center gap-2">
                      {!missing[s.key] && <Check className="size-4 text-primary" />}
                      <Button size="sm" variant="ghost" onClick={() => setStep(s.key)}>Edit</Button>
                    </div>
                  </div>
                ))}
                <F label="Anything else Harmonious should know?"><Textarea rows={3} value={r.notes} onChange={(e) => set("notes", e.target.value)} /></F>
                <div className="rounded-md border bg-muted p-3 text-xs text-muted-foreground">
                  Sending creates your {spv ? "SPV" : "fund"} in Funds, closed to investors, and tells the Harmonious Operations team. Harmonious confirms every detail before launch. Nothing is filed, paid or sent to investors automatically.
                </div>
                <Button disabled={send.isPending || Object.keys(missing).length > 0} onClick={() => send.mutate()}>Send to Harmonious</Button>
              </div>
            )}

            {step !== "review" && (
              <div className="flex justify-between pt-2">
                <Button variant="ghost" disabled={idx === 0} onClick={() => go(-1)}>Back</Button>
                <Button onClick={() => go(1)}>Next</Button>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function Grid({ children }: { children: React.ReactNode }) {
  return <div className="grid gap-3 sm:grid-cols-2">{children}</div>;
}
function F({ label, children }: { label: string; children: React.ReactNode }) {
  return <div><Label className="text-xs">{label}</Label><div className="mt-1">{children}</div></div>;
}
function Pick({ value, onChange, options }: { value: string; onChange: (v: string) => void; options: (string | { value: string; label: string })[] }) {
  const opts = options.map((o) => (typeof o === "string" ? { value: o, label: o } : o));
  return (
    <Select value={value || undefined} onValueChange={onChange}>
      <SelectTrigger><SelectValue placeholder="Choose…" /></SelectTrigger>
      <SelectContent>{opts.map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}</SelectContent>
    </Select>
  );
}
function Money({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <div className="relative">
      <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">$</span>
      <Input className="pl-6" inputMode="decimal" value={value} onChange={(e) => onChange(e.target.value.replace(/[^0-9.,]/g, ""))} />
    </div>
  );
}
function Fee({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const unit = value.startsWith("$") ? "$" : "%";
  const num = value.replace(/[$%]/g, "");
  const emit = (n: string, u: string) => onChange(n ? (u === "$" ? `$${n}` : `${n}%`) : "");
  return (
    <div className="flex gap-2">
      <Select value={unit} onValueChange={(u) => emit(num, u)}>
        <SelectTrigger className="w-20"><SelectValue /></SelectTrigger>
        <SelectContent><SelectItem value="%">%</SelectItem><SelectItem value="$">$</SelectItem></SelectContent>
      </Select>
      <Input inputMode="decimal" value={num} placeholder={unit === "%" ? "e.g. 2" : "e.g. 25000"} onChange={(e) => emit(e.target.value.replace(/[^0-9.]/g, ""), unit)} />
    </div>
  );
}
function DatePick({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const d = value ? parseISO(value) : undefined;
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="outline" className="w-full justify-start font-normal">
          <CalendarIcon className="mr-2 size-4" />
          {d ? format(d, "PPP") : <span className="text-muted-foreground">Pick a date</span>}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0" align="start">
        <Calendar mode="single" selected={d} onSelect={(x) => onChange(x ? format(x, "yyyy-MM-dd") : "")} initialFocus className="pointer-events-auto p-3" />
      </PopoverContent>
    </Popover>
  );
}
function DocUploads({ clientId, kinds, docs, onChange }: { clientId: string | null; kinds: string[]; docs: FundRequest["documents"]; onChange: (d: FundRequest["documents"]) => void }) {
  const upload = useServerFn(uploadFundRequestFile);
  const ref = useRef<HTMLInputElement>(null);
  const [kind, setKind] = useState(kinds[0]!);
  const [busy, setBusy] = useState(false);
  const pick = async (file: File | undefined) => {
    if (!file || !clientId) return;
    if (file.size > 10 * 1024 * 1024) return toast.error("Files must be 10 MB or smaller.");
    setBusy(true);
    try {
      const buf = new Uint8Array(await file.arrayBuffer());
      let bin = "";
      for (let i = 0; i < buf.length; i += 0x8000) bin += String.fromCharCode(...buf.subarray(i, i + 0x8000));
      const res = await upload({ data: { clientId, kind, fileName: file.name, contentType: file.type || "application/pdf", base64: btoa(bin) } });
      onChange([...docs, res]);
      toast.success(`${file.name} uploaded.`);
    } catch (e: any) {
      toast.error(e?.message ?? "Upload failed.");
    } finally {
      setBusy(false);
      if (ref.current) ref.current.value = "";
    }
  };
  const mine = docs.filter((d) => kinds.includes(d.kind));
  return (
    <div className="space-y-2 rounded-md border border-dashed p-3">
      <div className="flex flex-wrap items-center gap-2">
        <div className="w-56"><Pick value={kind} onChange={setKind} options={kinds} /></div>
        <input ref={ref} type="file" className="hidden" accept=".pdf,.doc,.docx,image/*" onChange={(e) => void pick(e.target.files?.[0])} />
        <Button size="sm" variant="outline" disabled={busy || !clientId} onClick={() => ref.current?.click()}><Upload className="mr-1 size-4" />{busy ? "Uploading…" : "Upload"}</Button>
      </div>
      {mine.map((d, i) => (
        <div key={d.path} className="flex items-center justify-between text-sm">
          <span><Badge variant="secondary" className="mr-2">{d.kind}</Badge>{d.fileName}</span>
          <Button size="icon" variant="ghost" aria-label="Remove file" onClick={() => onChange(docs.filter((x) => x !== mine[i]))}><Trash2 className="size-4" /></Button>
        </div>
      ))}
    </div>
  );
}
