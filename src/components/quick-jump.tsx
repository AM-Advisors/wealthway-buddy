import { useEffect, useMemo, useState } from "react";
import { useNavigate, useRouterState } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
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
import { opsQuickSearchFn } from "@/lib/ops-quick-search.functions";
import { recordVisit } from "@/lib/recent-screens";

/**
 * "Jump to" palette (Ctrl/Cmd+K) on every signed-in page. Lists only the
 * destinations the person's own menus already offer; the backend still
 * authorizes each page when opened.
 */
export function QuickJump() {
  const [open, setOpen] = useState(false);
  const navigate = useNavigate();
  const pathname = useRouterState({ select: (r) => r.location.pathname });
  const { session, activeId, applicationSurface } = useClientWorkspace();

  const [query, setQuery] = useState("");
  const [debounced, setDebounced] = useState("");
  useEffect(() => {
    const t = setTimeout(() => setDebounced(query.trim()), 250);
    return () => clearTimeout(t);
  }, [query]);
  const isStaff = !!(session as { operations?: boolean } | null)?.operations;
  const records = useQuery({
    queryKey: ["ops-quick-search", debounced],
    queryFn: () => opsQuickSearchFn({ data: { q: debounced } }),
    enabled: open && isStaff && debounced.length >= 2,
    staleTime: 30_000,
  });
  const fundHits = records.data?.funds ?? [];
  const clientHits = records.data?.clients ?? [];
  const peopleHits = records.data?.people ?? [];

  useEffect(() => recordVisit(pathname), [pathname]);

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
    const nav = getNavigation(session as never, activeId, pathname, applicationSurface);
    const out: { heading: string; items: { title: string; url: string; hint?: string }[] }[] = [];
    if (nav.primary.length) out.push({ heading: "Your portal", items: nav.primary.map((i) => ({ title: i.title, url: i.url })) });
    const caps = (session as { operationsCapabilities?: OpsCapability[] } | null)?.operationsCapabilities ?? [];
    if (nav.shell === "ops" && (session as { operations?: boolean } | null)?.operations) {
      out.push({ heading: "Harmonious Operations", items: opsSearchIndex(caps).map((e) => ({ title: e.title, url: e.url, hint: e.area })) });
    } else if (nav.shell === "ops" && nav.operations.length) {
      out.push({ heading: "Harmonious", items: nav.operations.map((o) => ({ title: o.title, url: o.url })) });
    }
    return out;
  }, [session, activeId, pathname, applicationSurface]);

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
        <CommandInput value={query} onValueChange={setQuery} placeholder={isStaff ? "Find a screen, fund or person…" : "Type a page, e.g. Fund Setup, reports, tax…"} />
        <CommandList>
          <CommandEmpty>{records.isFetching ? "Searching…" : "Nothing matches."}</CommandEmpty>
          {!!fundHits.length && (
            <CommandGroup heading="Funds">
              {fundHits.map((f) => (
                <CommandItem key={`f-${f.id}`} value={`fund ${f.name} ${query}`} onSelect={() => go(`/ops/fund/${f.id}`)}>
                  <span>{f.name}</span>
                  <span className="ml-auto text-xs text-muted-foreground">{f.open ? "Open fund" : "In setup"}</span>
                </CommandItem>
              ))}
            </CommandGroup>
          )}
          {!!clientHits.length && (
            <CommandGroup heading="Clients">
              {clientHits.map((c) => (
                <CommandItem key={`c-${c.id}`} value={`client ${c.name} ${query}`} onSelect={() => go(`/ops/clients/${c.id}`)}>
                  <span>{c.name}</span>
                  <span className="ml-auto text-xs text-muted-foreground">Client</span>
                </CommandItem>
              ))}
            </CommandGroup>
          )}
          {!!peopleHits.length && (
            <CommandGroup heading="People">
              {peopleHits.map((p) => (
                <CommandItem key={`p-${p.id}`} value={`person ${p.name} ${p.email} ${query}`} onSelect={() => go(`/ops/people/${p.id}`)}>
                  <span>{p.name || p.email}</span>
                  <span className="ml-auto text-xs text-muted-foreground">{p.email}</span>
                </CommandItem>
              ))}
            </CommandGroup>
          )}
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
