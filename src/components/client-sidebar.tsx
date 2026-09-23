import { Link, useRouterState } from "@tanstack/react-router";
import {
  Bell,
  Briefcase,
  Building2,
  ChevronsUpDown,
  ClipboardList,
  FileSpreadsheet,
  FileText,
  History,
  Home,
  LogOut,
  Receipt,
  Table,
  UserRound,
  Users,
} from "lucide-react";

import { Logo, LogoIcon } from "@/components/Logo";
import { useClientWorkspace } from "@/components/client-workspace";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar,
} from "@/components/ui/sidebar";
import { getNavigation } from "@/lib/navigation";

const ICONS: Record<string, typeof Home> = {
  home: Home,
  briefcase: Briefcase,
  history: History,
  report: FileSpreadsheet,
  document: FileText,
  tax: Receipt,
  person: UserRound,
  building: Building2,
  people: Users,
  money: Receipt,
  table: Table,
  tasks: ClipboardList,
};

/**
 * The menu for the client application. Every item comes from the workspace the
 * person is actually in, so nobody sees a destination that belongs to someone
 * else's relationship — and Harmonious-only sections never appear here.
 */
export function ClientSidebar({ onSignOut }: { onSignOut: () => void }) {
  const { state } = useSidebar();
  const collapsed = state === "collapsed";
  const pathname = useRouterState({ select: (r) => r.location.pathname });
  const { session, options, activeId, activeKind, switchTo } = useClientWorkspace();

  const navigation = getNavigation(session as never, activeId, pathname);
  const items = navigation.primary;
  const active = options.find((o) => o.id === activeId);
  const isProfessional = options.some((o) => o.id === "professional");

  const isActive = (url: string) => {
    const base = url.split("?")[0] ?? url;
    if (base === "/home" || base === "/manager" || base === "/client" || base === "/professional") {
      return pathname === base;
    }
    return pathname === base || pathname.startsWith(`${base}/`);
  };

  return (
    <Sidebar collapsible="icon">
      <SidebarHeader>
        <Link to="/home" aria-label="Harmonious home" className="flex items-center px-2 py-1">
          {collapsed ? (
            <LogoIcon variant="white" className="h-6 w-6 object-contain object-left" />
          ) : (
            <Logo variant="white" className="h-7 w-auto" />
          )}
        </Link>

        {!collapsed && options.length > 0 && (
          <DropdownMenu>
            <DropdownMenuTrigger className="mx-1 mb-1 flex w-[calc(100%-0.5rem)] items-center justify-between rounded-md border border-sidebar-border bg-sidebar-accent/40 px-2 py-1.5 text-left text-xs text-sidebar-foreground">
              <span className="truncate">{active?.label ?? "Choose a workspace"}</span>
              <ChevronsUpDown className="h-3.5 w-3.5 shrink-0 opacity-70" aria-hidden />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="w-60">
              <DropdownMenuLabel>Switch workspace</DropdownMenuLabel>
              <DropdownMenuSeparator />
              {options.map((option) => (
                <DropdownMenuItem
                  key={option.id}
                  onSelect={(event) => {
                    event.preventDefault();
                    void switchTo(option.id);
                  }}
                >
                  {option.label}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </SidebarHeader>

      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupContent>
            <SidebarMenu>
              {items.map((item) => {
                const Icon = ICONS[item.icon ?? "home"] ?? Home;
                return (
                  <SidebarMenuItem key={item.url}>
                    <SidebarMenuButton
                      asChild
                      isActive={isActive(item.url)}
                      tooltip={item.title}
                      className="data-[active=true]:border-l-2 data-[active=true]:border-sidebar-primary data-[active=true]:bg-sidebar-accent data-[active=true]:font-medium"
                    >
                      <Link to={item.url as never} className="flex items-center gap-2">
                        <Icon className="h-4 w-4 shrink-0" />
                        {!collapsed && <span className="truncate">{item.title}</span>}
                      </Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                );
              })}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        <SidebarGroup>
          <SidebarGroupContent>
            <SidebarMenu>
              <SidebarMenuItem>
                <SidebarMenuButton asChild isActive={isActive("/prepared")} tooltip="Notifications and tasks">
                  <Link to="/prepared" className="flex items-center gap-2">
                    <Bell className="h-4 w-4 shrink-0" />
                    {!collapsed && <span className="truncate">Notifications & tasks</span>}
                  </Link>
                </SidebarMenuButton>
              </SidebarMenuItem>
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      <SidebarFooter>
        <SidebarMenu>
          {!collapsed && session?.person?.name && (
            <SidebarMenuItem>
              <DropdownMenu>
                <DropdownMenuTrigger className="w-full truncate rounded-md px-2 py-1.5 text-left text-xs text-sidebar-foreground/80">
                  {session.person.name}
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start" className="w-56">
                  {navigation.account.map((link) => (
                    <DropdownMenuItem key={link.url} asChild>
                      <Link to={link.url as never}>{link.title}</Link>
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>
            </SidebarMenuItem>
          )}
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
