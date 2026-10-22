import { ShieldCheck, ShieldAlert, ShieldQuestion } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { SearchableSelect } from "@/components/ui/searchable-select";

export type KycState = "verified" | "in_progress" | "none";
export type PickPerson = { key: string; name: string; email?: string | null; detail?: string | null; source: string; kyc: KycState; hasAccount?: boolean };

export function KycBadge({ kyc }: { kyc: KycState }) {
  if (kyc === "verified") return <Badge className="gap-1"><ShieldCheck className="h-3 w-3" />ID verified</Badge>;
  if (kyc === "in_progress") return <Badge variant="secondary" className="gap-1"><ShieldAlert className="h-3 w-3" />ID check in progress</Badge>;
  return <Badge variant="outline" className="gap-1"><ShieldQuestion className="h-3 w-3" />No ID check yet</Badge>;
}

/** Search existing Client/Fund people while retaining identity-check evidence. */
export function FundPersonPicker({ people, value, onChange, empty }: { people: PickPerson[]; value: string; onChange: (key: string) => void; empty: string }) {
  if (people.length === 0) return <p className="text-xs text-muted-foreground">{empty}</p>;
  return (
    <SearchableSelect value={value} onValueChange={onChange} aria-label="Person" options={[
      { value: "", label: "Choose a person…" },
      ...people.map((p) => ({ value: p.key, label: p.name, keywords: [p.email ?? "", p.detail ?? "", p.source], content: <span className="space-y-1">
        <span className="block font-medium">{p.name}</span>
        <span className="block break-words text-xs text-muted-foreground">{[p.source, p.detail ?? p.email].filter(Boolean).join(" · ")}</span>
        <span className="flex flex-wrap gap-1"><KycBadge kyc={p.kyc} />{p.hasAccount === false && <Badge variant="outline">No sign-in yet</Badge>}</span>
      </span> })),
    ]} />
  );
}
