import { Children, isValidElement, type ReactNode } from "react";
import { SearchableSelect, type SearchableOption } from "@/components/ui/searchable-select";

function textOf(node: ReactNode): string {
  return Children.toArray(node).map((part) => isValidElement<{ children?: ReactNode }>(part) ? textOf(part.props.children) : String(part)).join("");
}

/** Adapter for existing person option lists; save callbacks and disabled choices stay intact. */
export function SearchablePeoplePicker({ children, ...props }: { children: ReactNode; value?: string; onValueChange?: (value: string) => void; disabled?: boolean }) {
  const options: SearchableOption[] = [];
  let className: string | undefined;
  let label: string | undefined;
  let id: string | undefined;
  let placeholder: string | undefined;
  function visit(nodes: ReactNode) {
    Children.forEach(nodes, (child) => {
      if (!isValidElement<{ value?: string; children?: ReactNode; className?: string; "aria-label"?: string; id?: string; placeholder?: string; disabled?: boolean }>(child)) return;
      const p = child.props;
      if (typeof p.value === "string") {
        options.push({ value: p.value, label: textOf(p.children), disabled: p.disabled });
        return;
      }
      if (p.placeholder) placeholder = p.placeholder;
      if (p["aria-label"]) label = p["aria-label"];
      if (p.id) id = p.id;
      // Existing trigger dimensions, not option-list styling.
      if (p.className && !className) className = p.className;
      visit(p.children);
    });
  }
  visit(children);
  return <SearchableSelect value={props.value ?? ""} onValueChange={(value) => props.onValueChange?.(value)} disabled={props.disabled} options={options} className={className} id={id} aria-label={label} placeholder={placeholder} />;
}

export function SearchableNativeSelect({ children, onChange, ...props }: {
  children: ReactNode; value?: string; defaultValue?: string; onChange: (event: { target: { value: string } }) => void;
  disabled?: boolean; className?: string; id?: string; "aria-label"?: string;
}) {
  return <SearchableSelect {...props} value={props.value ?? props.defaultValue ?? ""} onValueChange={(value) => onChange({ target: { value } })}>{children}</SearchableSelect>;
}