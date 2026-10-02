import { Link, useRouterState } from "@tanstack/react-router";
import {
  Bell,
  MessageSquare,
  Briefcase,
  Building2,
  ChevronsUpDown,
  ClipboardList,
  FileSpreadsheet,
  FileText,
  History,
  Home,
  LogOut,
  PieChart,
  Receipt,
  Settings,
  Table,
  UserRound,
  Users,
} from "lucide-react";

import { Logo, LogoIcon } from "@/components/Logo";
import { ClientBrandStyles, useClientBrand } from "@/components/client-brand";
import { useClientWorkspace } from "@/components/client-workspace";
import { getMyCapTables } from "@/lib/cap-table-billing.functions";
import { getStripeEnvironment } from "@/lib/stripe";
import { SidebarAccountFooter } from "@/components/sidebar-account-footer";
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
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { listMySharedFunds } from "@/lib/fund-team-access.functions";
import { useInboxUnread } from "@/components/unified-inbox";

const ICONS: Record<string, typeof Home> = {
  home: Home,
  briefcase: Briefcase,
  history: History,
  bell: Bell,
  message: MessageSquare,
  report: FileSpreadsheet,
  document: FileText,
  tax: Receipt,
  person: UserRound,
  building: Building2,
  people: Users,
  money: Receipt,
  table: Table,
  tasks: ClipboardList,
  pie: PieChart,
  settings: Settings,
};

/**
 * The menu for the client application. Every item comes from the workspace the
 * person is actually in, so nobody sees a destination that belongs to someone
 * else's relationship - and Harmonious-only sections never appear here.
 */
export function ClientSidebar({ onSignOut }: { onSignOut: () => void }) {
  const { state } = useSidebar();
  const collapsed = state === "collapsed";
  const pathname = useRouterState({ select: (r) => r.location.pathname });
  const { session, options, activeId } = useClientWorkspace();

  const navigation = getNavigation(session as never, activeId, pathname);
  const capFn = useServerFn(getMyCapTables);
  const caps = useQuery({ queryKey: ["my-cap-tables"], queryFn: () => capFn({ data: { environment: getStripeEnvironment() } }), staleTime: 60_000 });
  const capLinks = ["/client/cap-table"];
  // Cap Table links only show once the client has an active (or free) cap table.
  const items = caps.data?.hasActive
    ? navigation.primary
    : navigation.primary.filter((i: { url: string }) => !capLinks.some((c) => i.url === c || i.url.startsWith(`${c}/`)));
  const active = options.find((o) => o.id === activeId);
  const brand = useClientBrand(active?.kind === "company");
  const sharedFn = useServerFn(listMySharedFunds);
  const shared = useQuery({ queryKey: ["my-shared-funds"], queryFn: () => sharedFn(), staleTime: 60_000 });
  const hasShared = (shared.data?.funds.length ?? 0) > 0;
  const inbox = useInboxUnread();

  const isActive = (url: string) => {
    const base = url.split("?")[0] ?? url;
    if (base === "/client") {
      // Settings covers every client-portal page except Funds and Cap Table.
      return pathname.startsWith("/client") && !pathname.startsWith("/client/funds") && !pathname.startsWith("/client/cap-table") && !pathname.startsWith("/client/home");
    }
    if (base === "/home" || base === "/manager" || base === "/professional") {
      return pathname === base;
    }
    return pathname === base || pathname.startsWith(`${base}/`);
  };

  return (
    <Sidebar collapsible="icon">
      <SidebarHeader>
        <Link to="/home" aria-label="Harmonious home" data-testid="brand-logo" className="flex items-center px-2 py-1">
          <ClientBrandStyles brand={brand} />
          {brand?.logo_path ? (
            <img src={brand.logo_path} alt="Company logo" className={collapsed ? "h-6 w-6 object-contain object-left" : "h-7 w-auto max-w-[160px] object-contain object-left"} />
          ) : collapsed ? (
            <LogoIcon variant="white" className="h-6 w-6 object-contain object-left" />
          ) : (
            <Logo variant="white" className="h-7 w-auto" />
          )}
        </Link>

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
              {hasShared && (
                <SidebarMenuItem>
                  <SidebarMenuButton asChild isActive={isActive("/shared-funds")} tooltip="Shared funds">
                    <Link to="/shared-funds" className="flex items-center gap-2">
                      <Users className="h-4 w-4 shrink-0" />
                      {!collapsed && <span className="truncate">Shared funds</span>}
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              )}
              <SidebarMenuItem>
                <SidebarMenuButton asChild isActive={isActive("/inbox")} tooltip="Inbox">
                  <Link to="/inbox" className="flex items-center gap-2">
                    <MessageSquare className="h-4 w-4 shrink-0" />
                    {!collapsed && <span className="flex-1 truncate">Inbox</span>}
                    {!collapsed && !!inbox.data?.unread && <span className="rounded-full bg-sidebar-primary px-1.5 text-xs text-sidebar-primary-foreground">{inbox.data.unread}</span>}
                  </Link>
                </SidebarMenuButton>
              </SidebarMenuItem>
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

      <SidebarAccountFooter workspaceLabel={active?.label ?? "Your workspace"} onSignOut={onSignOut} />
    </Sidebar>
  );
}
