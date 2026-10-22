import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { createQuoteDeal } from "@/lib/sales-hub.functions";

export type DealOption = { id: string; title: string; contact_id?: string | null; client_id?: string | null };

/** Type-to-search deal selection with inline "New deal" creation. */
export function DealPicker({ deals, value, onChange, contactId, clientId, defaultTitle }: {
  deals: DealOption[]; value: string; onChange: (deal: DealOption | null) => void;
  contactId?: string | null; clientId?: string | null; defaultTitle?: string;
}) {
  const create = useServerFn(createQuoteDeal);
  const [adding, setAdding] = useState(false);
  const [title, setTitle] = useState("");
  const [busy, setBusy] = useState(false);
  const [extra, setExtra] = useState<DealOption[]>([]);
  const all = [...extra.filter((e) => !deals.some((d) => d.id === e.id)), ...deals];
  const save = async () => {
    if (!title.trim()) return;
    setBusy(true);
    try {
      const d = await create({ data: { title: title.trim(), contactId: contactId || null, clientId: clientId || null } });
      setExtra((x) => [d, ...x]); onChange(d); setAdding(false); setTitle(""); toast.success("Deal created");
    } catch (e) { toast.error((e as Error).message); } finally { setBusy(false); }
  };
  if (adding) return (
    <div className="flex gap-2">
      <Input autoFocus placeholder="New deal name" value={title} onChange={(e) => setTitle(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); void save(); } }} />
      <Button type="button" size="sm" disabled={busy || !title.trim()} onClick={save}>Add</Button>
      <Button type="button" size="sm" variant="ghost" onClick={() => setAdding(false)}>Cancel</Button>
    </div>
  );
  return (
    <div className="flex gap-2">
      <SearchableSelect aria-label="Deal" placeholder="Search deals…" value={value}
        options={[{ value: "", label: "No deal" }, ...all.map((d) => ({ value: d.id, label: d.title }))]}
        onValueChange={(v) => onChange(all.find((d) => d.id === v) ?? null)} />
      <Button type="button" size="sm" variant="outline" className="shrink-0" onClick={() => { setTitle(defaultTitle ?? ""); setAdding(true); }}><Plus className="mr-1 h-4 w-4" />New deal</Button>
    </div>
  );
}
