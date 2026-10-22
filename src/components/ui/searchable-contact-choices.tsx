import { Children, isValidElement, useState, type ReactNode } from "react";
import { Input } from "@/components/ui/input";

function text(node: ReactNode): string {
  return Children.toArray(node).map((part) => isValidElement<{ children?: ReactNode }>(part) ? text(part.props.children) : String(part)).join(" ");
}
function checked(node: ReactNode): boolean {
  return Children.toArray(node).some((part) => isValidElement<{ checked?: boolean; children?: ReactNode }>(part) && (part.props.checked === true || checked(part.props.children)));
}

/** Keep selected recipients visible while filtering the existing checkbox choices. */
export function SearchableContactChoices({ children, "aria-label": label = "Search contacts" }: { children: ReactNode; "aria-label"?: string }) {
  const [search, setSearch] = useState("");
  const terms = search.trim().toLocaleLowerCase().split(/\s+/).filter(Boolean);
  const rows = Children.toArray(children);
  const visible = rows.filter((row) => checked(row) || terms.every((term) => text(row).toLocaleLowerCase().includes(term)));
  return <div className="space-y-2">
    <Input aria-label={label} placeholder="Search name or email…" value={search} onChange={(event) => setSearch(event.target.value)} />
    <div className="max-h-44 space-y-1 overflow-y-auto">{visible.length ? visible : <p className="text-xs text-muted-foreground">No matches found.</p>}</div>
  </div>;
}