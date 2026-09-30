import { useEffect, useMemo, useState } from "react";
import { useNavigate, useRouterState } from "@tanstack/react-router";
import { Search } from "lucide-react";

import { useClientWorkspace } from "@/components/client-workspace";
import { Button } from "@/components/ui/button";
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { getNavigation } from "@/lib/navigation";
import type { OpsCapability } from "@/lib/ops-capabilities";
import { opsSearchIndex } from "@/lib/ops-search";

/**
 * "Jump to" palette (Ctrl/Cmd+K) on every signed-in page. Lists only the
 * destinations the person's own menus already offer; the backend still
 * authorizes each page when opened.
 */
export function QuickJump() {
  const [open, setOpen] = useState(false);
  const navigate = useNavigate();
  const pathname = useRouterState({ select: (r) => r.location.pathname });
  const { session, activeId } = useClientWorkspace();

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen((v) => !v);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const groups = useMemo(() => {
    const nav = getNavigation(session as never, activeId, pathname);
    const out: { heading: string; items: { title: string; url: string; hint?: string }[] }[] = [];
    if (nav.primary.length) out.push({ heading: "Your portal", items: nav.primary.map((i) => ({ title: i.title, url: i.url })) });
    const caps = (session as { operationsCapabilities?: OpsCapability[] } | null)?.operationsCapabilities ?? [];
    if ((session as { operations?: boolean } | null)?.operations) {
      out.push({ heading: "Harmonious Operations", items: opsSearchIndex(caps).map((e) => ({ title: e.title, url: e.url, hint: e.area })) });
    } else if (nav.operations.length) {
      out.push({ heading: "Harmonious", items: nav.operations.map((o) => ({ title: o.title, url: o.url })) });
    }
    return out;
  }, [session, activeId, pathname]);

  const go = (url: string) => {
    setOpen(false);
    navigate({ to: url as never });
  };

  return (
    <>
      <Button variant="outline" size="sm" onClick={() => setOpen(true)} className="ml-auto h-8 gap-2 text-muted-foreground" aria-label="Jump to a page">
        <Search className="h-3.5 w-3.5" />
        <span className="hidden sm:inline">Jump to…</span>
        <kbd className="hidden rounded border px-1 text-[10px] md:inline">⌘K</kbd>
      </Button>
      <CommandDialog open={open} onOpenChange={setOpen}>
        <CommandInput placeholder="Type a page, e.g. Fund Setup, reports, tax…" />
        <CommandList>
          <CommandEmpty>No matching page.</CommandEmpty>
          {groups.map((g) => (
            <CommandGroup key={g.heading} heading={g.heading}>
              {g.items.map((i) => (
                <CommandItem key={`${g.heading}-${i.url}`} value={`${i.title} ${i.hint ?? ""} ${i.url}`} onSelect={() => go(i.url)}>
                  <span>{i.title}</span>
                  {i.hint && <span className="ml-auto text-xs text-muted-foreground">{i.hint}</span>}
                </CommandItem>
              ))}
            </CommandGroup>
          ))}
        </CommandList>
      </CommandDialog>
    </>
  );
}
