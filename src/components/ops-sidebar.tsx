import { useMemo, useState } from "react";
import { Link, useRouterState } from "@tanstack/react-router";
import {
  BadgeCheck,
  Banknote,
  Briefcase,
  Building2,
  ClipboardList,
  FileSpreadsheet,
  FileText,
  Home,
  Landmark,
  Receipt,
  Search,
  Settings,
  ShieldCheck,
  Table,
  Users,
} from "lucide-react";

import { Logo, LogoIcon } from "@/components/Logo";
import { Input } from "@/components/ui/input";
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarSeparator,
  useSidebar,
} from "@/components/ui/sidebar";
import { useClientWorkspace } from "@/components/client-workspace";
import { SidebarAccountFooter } from "@/components/sidebar-account-footer";
import { getNavigation, operationsNavItemIsActive } from "@/lib/navigation";
import { opsSearchIndex, searchOpsIndex } from "@/lib/ops-search";
import { OPS_WORK_AREAS, type OpsCapability } from "@/lib/ops-capabilities";

const ICONS: Record<string, typeof Home> = {
  home: Home,
  briefcase: Briefcase,
  building: Building2,
  table: Table,
  people: Users,
  check: BadgeCheck,
  money: Banknote,
  ledger: Landmark,
  tax: Receipt,
  shield: ShieldCheck,
  document: FileText,
  tasks: ClipboardList,
  report: FileSpreadsheet,
  settings: Settings,
};

const GROUP_OF = new Map(OPS_WORK_AREAS.map((a) => [a.id as string, a.group]));

/**
 * The Harmonious Operations menu: major work areas only. Specialist screens
 * live on each area's landing page and in search. Every entry is a projection
 * of the capabilities the backend resolved; the backend re-checks each request.
 */
export function OpsSidebar({ onSignOut }: { onSignOut: () => void }) {
  const { state, isMobile, setOpenMobile } = useSidebar();
  const collapsed = state === "collapsed" && !isMobile;
  const pathname = useRouterState({ select: (r) => r.location.pathname });
  const { session } = useClientWorkspace();
  const sections = getNavigation(session as never, "operations", pathname).operations;
  const capabilities = ((session as { operationsCapabilities?: OpsCapability[] } | null)?.operationsCapabilities ?? []);
  const [query, setQuery] = useState("");
  const index = useMemo(() => opsSearchIndex(capabilities), [capabilities]);
  const results = query.trim() ? searchOpsIndex(index, query) : null;

  const groups = [
    sections.filter((s) => s.id === "home" || GROUP_OF.get(s.id) === "records"),
    sections.filter((s) => GROUP_OF.get(s.id) === "work"),
    sections.filter((s) => GROUP_OF.get(s.id) === "admin"),
  ].filter((g) => g.length > 0);

  const close = () => {
    setQuery("");
    if (isMobile) setOpenMobile(false);
  };

  return (
    <Sidebar collapsible="icon" data-testid="ops-sidebar">
      <SidebarHeader>
        <Link to="/ops" aria-label="Harmonious Operations" data-testid="brand-logo" className="flex items-center px-2 py-1">
          {collapsed ? (
            <LogoIcon variant="white" className="h-6 w-6 object-contain object-left" />
          ) : (
            <Logo variant="white" className="h-7 w-auto" />
          )}
        </Link>
        {!collapsed && (
          <div className="relative px-1 pb-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-sidebar-foreground/60" aria-hidden />
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Find a screen"
              aria-label="Find a screen"
              className="h-8 border-sidebar-border bg-sidebar-accent/40 pl-8 text-xs text-sidebar-foreground placeholder:text-sidebar-foreground/60"
            />
          </div>
        )}
      </SidebarHeader>

      <SidebarContent className="overflow-x-hidden">
        {results ? (
          <SidebarGroup>
            <SidebarGroupContent>
              <SidebarMenu>
                {results.length === 0 && (
                  <p className="px-2 py-2 text-xs text-sidebar-foreground/70">Nothing matches “{query}”.</p>
                )}
                {results.map((r) => (
                  <SidebarMenuItem key={r.url}>
                    <SidebarMenuButton asChild className="h-auto py-1.5">
                      <Link to={r.url as never} onClick={close} className="flex flex-col items-start">
                        <span className="truncate text-sm">{r.title}</span>
                        <span className="truncate text-[11px] text-sidebar-foreground/60">{r.area}</span>
                      </Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                ))}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        ) : (
          groups.map((group, i) => (
            <div key={i}>
              {i > 0 && <SidebarSeparator />}
              <SidebarGroup>
                <SidebarGroupContent>
                  <SidebarMenu>
                    {group.map((section) => {
                      const Icon = ICONS[section.icon] ?? Home;
                      const active = operationsNavItemIsActive(section.url, pathname);
                      return (
                        <SidebarMenuItem key={section.id}>
                          <SidebarMenuButton
                            asChild
                            isActive={active}
                            tooltip={section.title}
                            className="data-[active=true]:bg-sidebar-accent data-[active=true]:font-medium data-[active=true]:text-sidebar-accent-foreground data-[active=true]:shadow-[inset_2px_0_0_var(--color-sidebar-primary)]"
                          >
                            <Link to={section.url as never} aria-current={active ? "page" : undefined} onClick={close} className="flex items-center gap-2">
                              <Icon className="h-4 w-4 shrink-0" />
                              <span className="truncate">{section.title}</span>
                            </Link>
                          </SidebarMenuButton>
                        </SidebarMenuItem>
                      );
                    })}
                  </SidebarMenu>
                </SidebarGroupContent>
              </SidebarGroup>
            </div>
          ))
        )}
      </SidebarContent>

      <SidebarAccountFooter workspaceLabel="Harmonious Operations" onSignOut={onSignOut} />
    </Sidebar>
  );
}
