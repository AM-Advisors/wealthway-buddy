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
  LogOut,
  Receipt,
  Settings,
  ShieldCheck,
  Table,
  Users,
} from "lucide-react";

import { Logo, LogoIcon } from "@/components/Logo";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar,
} from "@/components/ui/sidebar";
import { useClientWorkspace } from "@/components/client-workspace";
import { getNavigation, operationsNavItemIsActive } from "@/lib/navigation";

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

/**
 * The Harmonious Operations menu. Every entry comes from the permissions the
 * backend resolved for this staff member; the menu shows what they may open,
 * and the backend checks the same permission again on every request.
 */
export function OpsSidebar({ onSignOut }: { onSignOut: () => void }) {
  const { state } = useSidebar();
  const collapsed = state === "collapsed";
  const pathname = useRouterState({ select: (r) => r.location.pathname });
  // Sections are a projection of the granular capabilities the canonical
  // session resolved; this menu runs no staff-role query of its own.
  const { session } = useClientWorkspace();
  const sections = getNavigation(session as never, "operations", pathname).operations;

  return (
    <Sidebar collapsible="icon">
      <SidebarHeader>
        <Link to="/ops" aria-label="Harmonious Operations" className="flex items-center px-2 py-1">
          {collapsed ? (
            <LogoIcon variant="white" className="h-6 w-6 object-contain object-left" />
          ) : (
            <Logo variant="white" className="h-7 w-auto" />
          )}
        </Link>
      </SidebarHeader>

      <SidebarContent>
        <SidebarGroup>
          {!collapsed && <SidebarGroupLabel>Operations</SidebarGroupLabel>}
          <SidebarGroupContent>
            <SidebarMenu>
              {sections.map((section) => {
                const Icon = ICONS[section.icon] ?? Home;
                return (
                  <SidebarMenuItem key={section.url}>
                    <SidebarMenuButton
                      asChild
                      isActive={operationsNavItemIsActive(section.url, pathname)}
                      tooltip={section.title}
                      className="data-[active=true]:border-l-2 data-[active=true]:border-sidebar-primary data-[active=true]:bg-sidebar-accent data-[active=true]:font-medium"
                    >
                      <Link to={section.url as never} className="flex items-center gap-2">
                        <Icon className="h-4 w-4 shrink-0" />
                        {!collapsed && <span className="truncate">{section.title}</span>}
                      </Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                );
              })}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      <SidebarFooter>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton onClick={onSignOut} tooltip="Sign out">
              <LogOut className="h-4 w-4 shrink-0" />
              {!collapsed && <span>Sign out</span>}
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>
    </Sidebar>
  );
}
