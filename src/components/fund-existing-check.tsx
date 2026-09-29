import { useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";

import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { searchFundsFn } from "@/lib/fund-integrity.functions";

const KIND_LABEL = { same_name: "Same name", same_legal_name: "Same Legal Name", similar: "Similar" } as const;

/**
 * Create / Open Fund: before anything is created, show existing canonical Funds
 * that match the typed name. Exact matches block creation (server-enforced);
 * similar ones require an explicit "genuinely distinct" confirmation.
 */
export function FundExistingCheck({
  name, legalName, excludeId, distinct, onDistinctChange, onBlockedChange,
}: {
  name: string; legalName?: string | null; excludeId?: string | null;
  distinct: boolean; onDistinctChange: (v: boolean) => void; onBlockedChange?: (blocked: boolean) => void;
}) {
  const search = useServerFn(searchFundsFn);
  const [q, setQ] = useState(name);
  useEffect(() => { const t = setTimeout(() => setQ(name), 350); return () => clearTimeout(t); }, [name]);
  const res = useQuery({
    queryKey: ["fund-existing", q, legalName ?? "", excludeId ?? ""],
    queryFn: () => search({ data: { name: q, legalName: legalName ?? null, excludeId: excludeId ?? null } }),
    enabled: q.trim().length >= 3,
    retry: false,
  });
  const matches = q.trim().length >= 3 ? res.data?.matches ?? [] : [];
  const blocked = matches.some((m) => m.kind !== "similar");
  const similarOnly = matches.length > 0 && !blocked;
  useEffect(() => { onBlockedChange?.(blocked || (similarOnly && !distinct)); }, [blocked, similarOnly, distinct, onBlockedChange]);
  if (!matches.length) return null;

  return (
    <div className="rounded-md border border-border bg-muted/40 p-3 text-sm">
      <p className="font-medium">{blocked ? "This Fund already exists" : "A similar Fund already exists"}</p>
      <p className="mt-1 text-muted-foreground">
        {blocked
          ? "Open the existing Fund rather than creating another. A new offering or class for it is added from that Fund's setup."
          : "Open it if this is the same Fund, or confirm below that this is a genuinely distinct Fund with its own legal identity."}
      </p>
      <ul className="mt-2 space-y-1">
        {matches.map((m) => (
          <li key={m.id} className="flex flex-wrap items-center justify-between gap-2">
            <span className="min-w-0 break-words">{m.name}{m.legalName && m.legalName !== m.name ? ` · ${m.legalName}` : ""}</span>
            <span className="flex items-center gap-2">
              <Badge variant={m.kind === "similar" ? "outline" : "secondary"}>{KIND_LABEL[m.kind]}</Badge>
              <Link to="/admin/fund/$fundId" params={{ fundId: m.id }} className="font-medium text-primary underline underline-offset-4">Open Fund</Link>
            </span>
          </li>
        ))}
      </ul>
      {similarOnly ? (
        <label className="mt-3 flex items-start gap-2">
          <Checkbox checked={distinct} onCheckedChange={(v) => onDistinctChange(v === true)} />
          <span>This is a genuinely distinct Fund with a different legal identity.</span>
        </label>
      ) : null}
    </div>
  );
}

/** Server errors carry `EXISTING_FUND:<id>:message` so the UI can offer to open it. */
export function parseFundError(message: string): { fundId: string | null; text: string } {
  const m = /^(?:Error: )?EXISTING_FUND:([0-9a-f-]{36}):(.*)$/s.exec(message);
  if (m) return { fundId: m[1]!, text: m[2]! };
  const s = /^(?:Error: )?SIMILAR_FUND:(.*)$/s.exec(message);
  return { fundId: null, text: s ? s[1]! : message };
}
