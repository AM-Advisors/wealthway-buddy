import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { SERVICE_CATEGORIES } from "@/lib/service-catalog.functions";
import { createCustomService, draftCustomServiceWithAi, updateCustomService } from "@/lib/custom-services.functions";
import type { CustomBilling } from "@/lib/custom-service-model";

const BILLING: { id: CustomBilling; label: string }[] = [
  { id: "one_time", label: "One-time" }, { id: "monthly", label: "Monthly" }, { id: "quarterly", label: "Quarterly" }, { id: "annual", label: "Annual" },
];

export type CustomServiceDraft = {
  id?: string; expectedUpdatedAt?: string; name: string; category: string; summary: string;
  included: string[]; excluded: string[]; billingFrequency: CustomBilling; suggestedPriceCents: number | null;
};

const EMPTY: CustomServiceDraft = { name: "", category: "other", summary: "", included: [], excluded: [], billingFrequency: "one_time", suggestedPriceCents: null };

/** Write a custom service by hand or with AI. Saving sends it to the review team; prices still need CEO or CRO on each quote. */
export function CustomServiceForm({ initial, onSaved, onCancel, reviewed }: { initial?: CustomServiceDraft; onSaved: (r: { id: string }) => void; onCancel: () => void; reviewed?: boolean }) {
  const [f, setF] = useState<CustomServiceDraft>(initial ?? EMPTY);
  const [included, setIncluded] = useState((initial?.included ?? []).join("\n"));
  const [excluded, setExcluded] = useState((initial?.excluded ?? []).join("\n"));
  const [price, setPrice] = useState(initial?.suggestedPriceCents ? String(initial.suggestedPriceCents / 100) : "");
  const [brief, setBrief] = useState("");
  const [usedAi, setUsedAi] = useState(false);
  const [busy, setBusy] = useState<"ai" | "save" | null>(null);
  const draftFn = useServerFn(draftCustomServiceWithAi);
  const createFn = useServerFn(createCustomService);
  const updateFn = useServerFn(updateCustomService);

  const write = async () => {
    setBusy("ai");
    try {
      const r = await draftFn({ data: { name: f.name, brief } });
      setF((x) => ({ ...x, summary: r.summary, category: x.category === "other" ? r.category : x.category }));
      setIncluded(r.included.join("\n"));
      setExcluded(r.excluded.join("\n"));
      setUsedAi(true);
      toast.success("Draft written. Check every line before saving.");
    } catch (e) { toast.error((e as Error).message); } finally { setBusy(null); }
  };

  const save = async () => {
    setBusy("save");
    const cents = price.trim() ? Math.round(Number(price.replace(/[$,\s]/g, "")) * 100) : null;
    const body = { name: f.name, category: f.category, summary: f.summary, included: included.split("\n"), excluded: excluded.split("\n"), billingFrequency: f.billingFrequency, suggestedPriceCents: cents && cents > 0 ? cents : null };
    try {
      if (f.id && f.expectedUpdatedAt) {
        const r = await updateFn({ data: { ...body, id: f.id, expectedUpdatedAt: f.expectedUpdatedAt } });
        toast.success(r.reopened ? "Saved. The wording changed, so it went back to the review team." : "Saved");
        onSaved({ id: f.id });
      } else {
        const r = await createFn({ data: { ...body, writtenWith: usedAi ? "ai" : "manual" } });
        toast.success("Custom service saved. The review team has been notified.");
        onSaved(r);
      }
    } catch (e) { toast.error((e as Error).message); } finally { setBusy(null); }
  };

  return (
    <div className="space-y-4 text-sm">
      <div className="grid gap-3 sm:grid-cols-3">
        <div className="space-y-1 sm:col-span-2"><Label htmlFor="cs-name">Service name</Label><Input id="cs-name" value={f.name} maxLength={120} onChange={(e) => setF({ ...f, name: e.target.value })} placeholder="e.g. Quarterly board pack preparation" /></div>
        <div className="space-y-1"><Label>Category</Label>
          <Select value={f.category} onValueChange={(v) => setF({ ...f, category: v })}><SelectTrigger aria-label="Category"><SelectValue /></SelectTrigger>
            <SelectContent>{SERVICE_CATEGORIES.map((c) => <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>)}</SelectContent></Select></div>
      </div>
      {!f.id && <div className="rounded-lg border bg-muted/30 p-3">
        <Label htmlFor="cs-brief">Notes for the AI writer (optional)</Label>
        <Textarea id="cs-brief" rows={2} value={brief} onChange={(e) => setBrief(e.target.value)} placeholder="What the client asked for, in your own words" />
        <div className="mt-2 flex items-center gap-2">
          <Button type="button" variant="outline" size="sm" disabled={busy !== null || (f.name.trim().length < 2 && brief.trim().length < 10)} onClick={write}>{busy === "ai" ? "Writing…" : "Write it with AI"}</Button>
          <span className="text-xs text-muted-foreground">AI writes the description and lists. It never writes prices.</span>
        </div>
      </div>}
      <div className="space-y-1"><Label htmlFor="cs-summary">What the service is</Label><Textarea id="cs-summary" rows={4} value={f.summary} onChange={(e) => setF({ ...f, summary: e.target.value })} placeholder="A few sentences the client will read on the quote and Statement of Work" /></div>
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1"><Label htmlFor="cs-inc">What is included (one per line)</Label><Textarea id="cs-inc" rows={4} value={included} onChange={(e) => setIncluded(e.target.value)} /></div>
        <div className="space-y-1"><Label htmlFor="cs-exc">Not included (one per line)</Label><Textarea id="cs-exc" rows={4} value={excluded} onChange={(e) => setExcluded(e.target.value)} /></div>
      </div>
      <div className="grid gap-3 sm:grid-cols-3">
        <div className="space-y-1"><Label>Usually billed</Label>
          <Select value={f.billingFrequency} onValueChange={(v) => setF({ ...f, billingFrequency: v as CustomBilling })}><SelectTrigger aria-label="Usually billed"><SelectValue /></SelectTrigger>
            <SelectContent>{BILLING.map((b) => <SelectItem key={b.id} value={b.id}>{b.label}</SelectItem>)}</SelectContent></Select></div>
        <div className="space-y-1"><Label htmlFor="cs-price">Suggested price per bill ($, optional)</Label><Input id="cs-price" inputMode="decimal" value={price} onChange={(e) => setPrice(e.target.value)} placeholder="Starting price on new quotes" /></div>
      </div>
      <p className="text-xs text-muted-foreground">Saving adds it to the shared list so anyone in Sales can reuse it. The review team gets a notice to decide whether it needs design or build, belongs in an existing product, or isn't tech related. Custom services have no rate card price, so CEO or CRO approves the price on every quote.{reviewed ? " Changing the name, description or lists sends it back for review." : ""}</p>
      <div className="flex gap-2">
        <Button onClick={save} disabled={busy !== null || f.name.trim().length < 2 || f.summary.trim().length < 10}>{busy === "save" ? "Saving…" : f.id ? "Save changes" : "Save custom service"}</Button>
        <Button variant="ghost" onClick={onCancel} disabled={busy !== null}>Cancel</Button>
      </div>
    </div>
  );
}
