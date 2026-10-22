import { Children, isValidElement, useState, type ReactNode } from "react";
import { Check, ChevronsUpDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";

export type SearchableOption = { value: string; label: string; detail?: string | null; keywords?: string[]; disabled?: boolean; content?: ReactNode };

/** Suggestions only use the options supplied by the existing authorized reader. */
export function SearchableSelect({ options, children, value, onValueChange, placeholder = "Choose a contact…", disabled, className, id, "aria-label": label }: {
  options?: SearchableOption[]; children?: ReactNode; value: string; onValueChange: (value: string) => void;
  placeholder?: string; disabled?: boolean; className?: string; id?: string; "aria-label"?: string;
}) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const items: SearchableOption[] = options ?? Children.toArray(children).flatMap((child) => {
    if (!isValidElement<{ value: string; children: ReactNode; disabled?: boolean }>(child)) return [];
    const text = (node: ReactNode): string => Children.toArray(node).map((part) => isValidElement<{ children?: ReactNode }>(part) ? text(part.props.children) : String(part)).join("");
    return [{ value: child.props.value, label: text(child.props.children), disabled: child.props.disabled ?? false }];
  });
  const selected = items.find((option) => option.value === value);
  return (
    <Popover open={open} onOpenChange={(next) => { setOpen(next); setSearch(""); }}>
      <PopoverTrigger asChild>
        <Button id={id} type="button" variant="outline" role="combobox" aria-label={label ?? placeholder} aria-expanded={open} disabled={disabled}
          className={cn("h-9 w-full min-w-0 justify-between font-normal", !selected && "text-muted-foreground", className)}
          onKeyDown={(event) => { if (event.key.length === 1 && !event.ctrlKey && !event.metaKey && !event.altKey) { event.preventDefault(); setSearch(event.key); setOpen(true); } }}>
          <span className="min-w-0 truncate">{selected?.label ?? placeholder}</span><ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-[var(--radix-popover-trigger-width)] max-w-[calc(100vw-2rem)] p-0">
        <Command>
          <CommandInput aria-label={label ? `Search ${label}` : "Search contacts"} placeholder="Search name, email or firm…" value={search} onValueChange={setSearch} />
          <CommandList><CommandEmpty>No matches found.</CommandEmpty><CommandGroup>
            {items.map((option) => <CommandItem key={option.value} value={option.value || "__empty_selection__"} keywords={[option.label, option.detail ?? "", ...(option.keywords ?? [])]} disabled={option.disabled ?? false}
              onSelect={() => { onValueChange(option.value); setOpen(false); setSearch(""); }}>
              <Check className={cn("h-4 w-4 shrink-0", option.value === value ? "opacity-100" : "opacity-0")} />
              <span className="min-w-0 flex-1">{option.content ?? <><span className="block break-words">{option.label}</span>{option.detail && <span className="block break-words text-xs text-muted-foreground">{option.detail}</span>}</>}</span>
            </CommandItem>)}
          </CommandGroup></CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}