import { useState } from "react";
import { Link, useRouterState } from "@tanstack/react-router";
import { ArrowDown, ArrowUp, Pencil, Star, StarOff } from "lucide-react";
import { toast } from "sonner";
import { SidebarGroup, SidebarGroupContent, SidebarMenu, SidebarMenuButton, SidebarMenuItem, SidebarSeparator } from "@/components/ui/sidebar";
import { useFavorites } from "@/lib/favorites";

/** Star toggle for any page; shown on sidebar items and as "Save this page". */
export function FavoriteStar({ url, label, className = "" }: { url: string; label: string; className?: string }) {
  const fav = useFavorites();
  const on = !!fav.find(url);
  return (
    <button type="button" aria-label={on ? `Remove ${label} from favorites` : `Save ${label} to favorites`} aria-pressed={on}
      onClick={(e) => { e.preventDefault(); e.stopPropagation(); fav.toggle({ url, label }).catch((err) => toast.error(err?.message ?? "Could not save")); }}
      className={`rounded p-0.5 text-sidebar-foreground/60 hover:text-sidebar-foreground ${className}`}>
      <Star className={`h-3.5 w-3.5 ${on ? "fill-current text-sidebar-primary" : ""}`} />
    </button>
  );
}

/**
 * Personal Favorites group. `allowed` (optional) hides saved pages the person can no
 * longer reach in this sidebar; it is display only — every page still checks access.
 */
export function SidebarFavorites({ collapsed, onNavigate, allowed }: { collapsed: boolean; onNavigate?: () => void; allowed?: (url: string) => boolean }) {
  const fav = useFavorites();
  const location = useRouterState({ select: (r) => r.location });
  const here = location.pathname + (location.searchStr ?? "");
  const [editing, setEditing] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const items = fav.list.filter((f) => !allowed || allowed(f.url.split("?")[0]!));
  const hereSaved = !!fav.find(here);
  const saveHere = () => {
    const label = (typeof document !== "undefined" ? document.title.replace(/\s*[-|–]\s*Harmonious.*$/, "") : "") || "Page";
    fav.toggle({ url: here, label }).then(() => toast.success(hereSaved ? "Removed from favorites" : "Saved to favorites"), (e) => toast.error(e?.message ?? "Could not save"));
  };

  return (
    <>
      <SidebarSeparator />
      <SidebarGroup>
        {!collapsed && (
          <div className="flex items-center justify-between px-2 py-1 text-xs font-medium uppercase tracking-wide text-sidebar-foreground/70">
            <span>Favorites</span>
            <button type="button" onClick={saveHere} className="flex items-center gap-1 normal-case tracking-normal hover:text-sidebar-foreground" aria-label={hereSaved ? "Remove this page from favorites" : "Save this page to favorites"}>
              {hereSaved ? <StarOff className="h-3.5 w-3.5" /> : <Star className="h-3.5 w-3.5" />}
              <span>{hereSaved ? "Unsave page" : "Save page"}</span>
            </button>
          </div>
        )}
        <SidebarGroupContent>
          <SidebarMenu>
            {!collapsed && items.length === 0 && <p className="px-2 py-1 text-xs text-sidebar-foreground/60">Star a menu item or save this page.</p>}
            {items.map((f, idx) => {
              const [path, qs] = f.url.split("?");
              const search = qs ? Object.fromEntries(new URLSearchParams(qs)) : undefined;
              return (
                <SidebarMenuItem key={f.id} className="group/fav">
                  {editing === f.id && !collapsed ? (
                    <form className="flex gap-1 px-2 py-1" onSubmit={(e) => { e.preventDefault(); if (draft.trim()) fav.rename.mutate({ id: f.id, label: draft.trim() }); setEditing(null); }}>
                      <input autoFocus value={draft} onChange={(e) => setDraft(e.target.value)} onBlur={() => setEditing(null)} maxLength={80} aria-label="Favorite name"
                        className="h-7 w-full rounded border border-sidebar-border bg-sidebar-accent/40 px-2 text-xs text-sidebar-foreground" />
                    </form>
                  ) : (
                    <>
                      <SidebarMenuButton asChild isActive={here === f.url} tooltip={f.label}>
                        <Link to={path as never} search={search as never} onClick={onNavigate} className="flex items-center gap-2">
                          <Star className="h-4 w-4 shrink-0 fill-current text-sidebar-primary" />
                          <span className="truncate">{f.label}</span>
                        </Link>
                      </SidebarMenuButton>
                      {!collapsed && (
                        <div className="absolute right-1 top-1/2 hidden -translate-y-1/2 items-center gap-0.5 rounded bg-sidebar px-0.5 group-hover/fav:flex group-focus-within/fav:flex">
                          <button type="button" aria-label="Move up" disabled={idx === 0} onClick={() => fav.move.mutate({ id: f.id, dir: -1 })} className="p-0.5 text-sidebar-foreground/60 hover:text-sidebar-foreground disabled:opacity-30"><ArrowUp className="h-3 w-3" /></button>
                          <button type="button" aria-label="Move down" disabled={idx === items.length - 1} onClick={() => fav.move.mutate({ id: f.id, dir: 1 })} className="p-0.5 text-sidebar-foreground/60 hover:text-sidebar-foreground disabled:opacity-30"><ArrowDown className="h-3 w-3" /></button>
                          <button type="button" aria-label="Rename" onClick={() => { setEditing(f.id); setDraft(f.label); }} className="p-0.5 text-sidebar-foreground/60 hover:text-sidebar-foreground"><Pencil className="h-3 w-3" /></button>
                          <button type="button" aria-label="Remove from favorites" onClick={() => fav.remove.mutate(f.id)} className="p-0.5 text-sidebar-foreground/60 hover:text-sidebar-foreground"><StarOff className="h-3 w-3" /></button>
                        </div>
                      )}
                    </>
                  )}
                </SidebarMenuItem>
              );
            })}
          </SidebarMenu>
        </SidebarGroupContent>
      </SidebarGroup>
    </>
  );
}
