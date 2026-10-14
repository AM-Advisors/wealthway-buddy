import { Check, ShieldCheck, ShieldAlert, ShieldQuestion } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

export type KycState = "verified" | "in_progress" | "none";
export type PickPerson = { key: string; name: string; email?: string | null; detail?: string | null; source: string; kyc: KycState; hasAccount?: boolean };

export function KycBadge({ kyc }: { kyc: KycState }) {
  if (kyc === "verified") return <Badge className="gap-1"><ShieldCheck className="h-3 w-3" />ID verified</Badge>;
  if (kyc === "in_progress") return <Badge variant="secondary" className="gap-1"><ShieldAlert className="h-3 w-3" />ID check in progress</Badge>;
  return <Badge variant="outline" className="gap-1"><ShieldQuestion className="h-3 w-3" />No ID check yet</Badge>;
}

/** Click-to-choose list of people already on the Client or Fund, with identity-check state. */
export function FundPersonPicker({ people, value, onChange, empty }: { people: PickPerson[]; value: string; onChange: (key: string) => void; empty: string }) {
  if (people.length === 0) return <p className="text-xs text-muted-foreground">{empty}</p>;
  return (
    <div role="listbox" className="grid gap-2 sm:grid-cols-2">
      {people.map((p) => {
        const on = value === p.key;
        return (
          <button
            key={p.key} type="button" role="option" aria-selected={on}
            onClick={() => onChange(on ? "" : p.key)}
            className={cn("flex items-start justify-between gap-2 rounded-md border bg-background p-3 text-left text-sm transition-colors hover:border-primary", on && "border-primary ring-1 ring-primary")}
          >
            <span className="min-w-0 space-y-1">
              <span className="block font-medium">{p.name}</span>
              <span className="block truncate text-xs text-muted-foreground">{[p.source, p.detail ?? p.email].filter(Boolean).join(" · ")}</span>
              <span className="flex flex-wrap gap-1"><KycBadge kyc={p.kyc} />{p.hasAccount === false && <Badge variant="outline">No sign-in yet</Badge>}</span>
            </span>
            {on && <Check className="h-4 w-4 shrink-0 text-primary" />}
          </button>
        );
      })}
    </div>
  );
}
