import { useEffect, useMemo, useState } from "react";
import { Link, useRouterState } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  BadgeCheck,
  Banknote,
  BookLock,
  Briefcase,
  Building2,
  Check,
  ChevronRight,
  CircleDashed,
  ClipboardList,
  FileSignature,
  FileSpreadsheet,
  FileText,
  FolderLock,
  Gauge,
  Handshake,
  History,
  Home,
  Landmark,
  LayoutDashboard,
  Layers,
  LogOut,
  Mail,
  Receipt,
  ScrollText,
  Search,
  Send,
  ShieldCheck,
  UserPlus,
  Users,
} from "lucide-react";

import { Logo, LogoIcon } from "@/components/Logo";
import { Input } from "@/components/ui/input";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
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
import { getNavState } from "@/lib/nav.functions";
import { getNavCounts } from "@/lib/nav-counts.functions";
import { getPolicyStatus } from "@/lib/policies.functions";
import { cn } from "@/lib/utils";
import { useClientWorkspace } from "@/components/client-workspace";
import {
  internalNavigationGroups,
  onboardingItems,
  type LegacyNavGroup,
  type LegacyNavItem,
  type NavBadgeKey,
} from "@/lib/navigation";

type NavItem = LegacyNavItem;
type BadgeKey = NavBadgeKey;

const ICONS: Record<string, typeof LayoutDashboard> = { BadgeCheck, Banknote, BookLock, Briefcase, Building2, Check, ChevronRight, CircleDashed, ClipboardList, FileSignature, FileSpreadsheet, FileText, FolderLock, Gauge, Handshake, History, Home, Landmark, LayoutDashboard, Layers, LogOut, Mail, Receipt, ScrollText, Search, Send, ShieldCheck, UserPlus, Users };
const iconOf = (name: string) => ICONS[name] ?? LayoutDashboard;

const OPEN_GROUPS_KEY = "harmonious.sidebar.openGroups";

function readStoredGroups(): Record<string, boolean> {
  if (typeof window === "undefined") return {};
  try {
    const raw = window.localStorage.getItem(OPEN_GROUPS_KEY);
    return raw ? (JSON.parse(raw) as Record<string, boolean>) : {};
  } catch {
    return {};
  }
}

export function AppSidebar({ onSignOut }: { onSignOut: () => void }) {
  const { state } = useSidebar();
  const collapsed = state === "collapsed";
  const pathname = useRouterState({ select: (r) => r.location.pathname });

  // Access flags are projections of the canonical session; this menu runs no
  // relationship queries of its own.
  const { session } = useClientWorkspace();
  const navFlags = (session as any)?.navigation as
    | { isAdmin: boolean; isReviewer: boolean; legacyOperationsAllowed: boolean; isProfessional: boolean }
    | undefined;
  const adminAccess = navFlags;
  const operations = navFlags ? { allowed: navFlags.legacyOperationsAllowed } : undefined;
  const navState = useServerFn(getNavState);
  const { data: nav } = useQuery({ queryKey: ["nav-state"], queryFn: () => navState() });
  const policyStatus = useServerFn(getPolicyStatus);
  const { data: signOff } = useQuery({ queryKey: ["policy-status"], queryFn: () => policyStatus() });
  const navCountsFn = useServerFn(getNavCounts);
  const { data: navCounts } = useQuery({
    queryKey: ["nav-counts"],
    queryFn: () => navCountsFn(),
    refetchInterval: 120_000,
  });
  const signOffComplete = Boolean(signOff && signOff.outstanding.length === 0);

  const [query, setQuery] = useState("");
  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>({});
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    setOpenGroups(readStoredGroups());
    setHydrated(true);
  }, []);

  const setGroupOpen = (id: string, open: boolean) => {
    setOpenGroups((prev) => {
      const next = { ...prev, [id]: open };
      try {
        window.localStorage.setItem(OPEN_GROUPS_KEY, JSON.stringify(next));
      } catch {
        /* storage unavailable — the menu still works */
      }
      return next;
    });
  };

  const isActive = (url: string) =>
    url === "/admin" || url === "/manager" || url === "/diligence" || url === "/ops"
      ? pathname === url
      : pathname === url || pathname.startsWith(`${url}/`);

  const badgeCount = (key: BadgeKey | undefined) => {
    if (!key) return 0;
    if (key === "signOff") return signOff?.outstanding.length ?? 0;
    return navCounts?.[key] ?? 0;
  };

  const groups: LegacyNavGroup[] = useMemo(
    () => internalNavigationGroups(navFlags, pathname),
    [navFlags, pathname],
  );

  const search = query.trim().toLowerCase();
  const matches = (item: NavItem) => !search || item.title.toLowerCase().includes(search);

  const renderItem = (item: NavItem) => {
    const count = badgeCount(item.badge);
    const ItemIcon = iconOf(item.icon);
    return (
      <SidebarMenuItem key={item.url}>
        <SidebarMenuButton
          asChild
          isActive={isActive(item.url)}
          tooltip={count > 0 ? `${item.title} (${count})` : item.title}
          className="data-[active=true]:border-l-2 data-[active=true]:border-sidebar-primary data-[active=true]:bg-sidebar-accent data-[active=true]:font-medium"
        >
          <Link to={item.url as never} className="flex items-center gap-2">
            <ItemIcon className="h-4 w-4 shrink-0" />
            {!collapsed && <span className="truncate">{item.title}</span>}
            {count > 0 && !collapsed && (
              <span className="ml-auto rounded-full bg-sidebar-primary/20 px-1.5 text-[11px] font-medium text-sidebar-foreground">
                {count > 99 ? "99+" : count}
              </span>
            )}
            {count > 0 && collapsed && (
              <span
                className="absolute right-1 top-1 h-1.5 w-1.5 rounded-full bg-sidebar-primary"
                aria-hidden
              />
            )}
          </Link>
        </SidebarMenuButton>
      </SidebarMenuItem>
    );
  };

  const renderGroup = (group: LegacyNavGroup) => {
    const items = group.items.filter(matches);
    if (items.length === 0) return null;

    const hasActive = group.items.some((item) => isActive(item.url));
    const stored = openGroups[group.id];
    const open = Boolean(search) || hasActive || (hydrated ? (stored ?? group.id === "application") : true);

    if (collapsed) {
      return (
        <SidebarGroup key={group.id}>
          <SidebarGroupContent>
            <SidebarMenu>{items.map(renderItem)}</SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      );
    }

    const groupCount = group.items.reduce((sum, item) => sum + badgeCount(item.badge), 0);

    return (
      <Collapsible
        key={group.id}
        open={open}
        onOpenChange={(next) => setGroupOpen(group.id, next)}
        className="group/collapsible"
      >
        <SidebarGroup>
          <CollapsibleTrigger asChild>
            <SidebarGroupLabel className="flex w-full cursor-pointer items-center justify-between hover:text-sidebar-foreground">
              <span className="flex items-center gap-2">
                {group.label}
                {groupCount > 0 && !open ? (
                  <span className="rounded-full bg-sidebar-primary/20 px-1.5 text-[10px] font-medium">
                    {groupCount}
                  </span>
                ) : null}
              </span>
              <ChevronRight
                className={cn("h-4 w-4 transition-transform", open && "rotate-90")}
                aria-hidden
              />
            </SidebarGroupLabel>
          </CollapsibleTrigger>
          <CollapsibleContent>
            <SidebarGroupContent>
              <SidebarMenu>{items.map(renderItem)}</SidebarMenu>
            </SidebarGroupContent>
          </CollapsibleContent>
        </SidebarGroup>
      </Collapsible>
    );
  };

  const showOnboarding = Boolean(nav?.hasApplication) && !nav?.complete;
  const isStaff = Boolean(adminAccess?.isReviewer || operations?.allowed);

  const pinned: NavItem[] = [
    { title: "Home", url: "/home", icon: "Home" },
    ...(isStaff
      ? [{ title: "My clients", url: "/staff", icon: "Users", badge: "myClients" as BadgeKey }]
      : []),
  ].filter(matches);

  return (
    <Sidebar collapsible="icon">
      <SidebarHeader>
        <Link to="/" aria-label="Harmonious home" className="flex items-center px-2 py-1">
          {collapsed ? (
            <LogoIcon variant="white" className="h-6 w-6 object-contain object-left" />
          ) : (
            <Logo variant="white" className="h-7 w-auto" />
          )}
        </Link>
        {!collapsed && (
          <div className="relative px-1 pb-1">
            <Search
              className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-sidebar-foreground/60"
              aria-hidden
            />
            <Input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Find a screen"
              aria-label="Find a screen"
              className="h-8 border-sidebar-border bg-sidebar-accent/40 pl-8 text-xs text-sidebar-foreground placeholder:text-sidebar-foreground/60"
            />
          </div>
        )}
      </SidebarHeader>

      <SidebarContent>
        {pinned.length > 0 && (
          <SidebarGroup>
            <SidebarGroupContent>
              <SidebarMenu>{pinned.map(renderItem)}</SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        )}

        {showOnboarding && !search && (
          <Collapsible
            open={
              collapsed ||
              pathname.startsWith("/onboarding/") ||
              (hydrated ? (openGroups["onboarding"] ?? true) : true)
            }
            onOpenChange={(next) => setGroupOpen("onboarding", next)}
            className="group/collapsible"
          >
            <SidebarGroup>
              {!collapsed && (
                <CollapsibleTrigger asChild>
                  <SidebarGroupLabel className="flex w-full cursor-pointer items-center justify-between hover:text-sidebar-foreground">
                    <span>Onboarding</span>
                    <ChevronRight
                      className={cn(
                        "h-4 w-4 transition-transform",
                        (pathname.startsWith("/onboarding/") ||
                          (hydrated ? (openGroups["onboarding"] ?? true) : true)) &&
                          "rotate-90",
                      )}
                      aria-hidden
                    />
                  </SidebarGroupLabel>
                </CollapsibleTrigger>
              )}
              <CollapsibleContent>
                <SidebarGroupContent>
                  <SidebarMenu>
                    {onboardingItems.map((item, index) => {
                      const step = nav?.steps[index];
                      const count = index + 1;
                      const ItemIcon = iconOf(item.icon);
                      return (
                        <SidebarMenuItem key={item.url}>
                          <SidebarMenuButton
                            asChild
                            isActive={isActive(item.url)}
                            tooltip={`${count}. ${item.title}`}
                          >
                            <Link to={item.url as never} className="flex items-center gap-2">
                              {step?.state === "done" ? (
                                <Check className="h-4 w-4 text-primary" />
                              ) : step?.state === "current" ? (
                                <ItemIcon className="h-4 w-4 text-primary" />
                              ) : (
                                <CircleDashed className="h-4 w-4 text-muted-foreground" />
                              )}
                              {!collapsed && (
                                <span
                                  className={cn(
                                    step?.state === "todo" && "text-muted-foreground",
                                    step?.state === "current" && "font-medium",
                                  )}
                                >
                                  {count}. {item.title}
                                </span>
                              )}
                            </Link>
                          </SidebarMenuButton>
                        </SidebarMenuItem>
                      );
                    })}
                  </SidebarMenu>
                </SidebarGroupContent>
              </CollapsibleContent>
            </SidebarGroup>
          </Collapsible>
        )}

        {groups.map(renderGroup)}

        {search && pinned.length === 0 && groups.every((g) => g.items.every((i) => !matches(i))) && (
          <p className="px-4 py-2 text-xs text-sidebar-foreground/70">
            Nothing matches “{query}”.
          </p>
        )}
      </SidebarContent>

      <SidebarFooter>
        {!collapsed && signOff && (
          <p className="px-2 text-xs">
            {signOffComplete ? (
              <span className="inline-flex items-center gap-1 rounded-full bg-sidebar-primary/20 px-2 py-0.5 text-sidebar-foreground">
                <BadgeCheck className="h-3 w-3" aria-hidden /> Sign-off complete
              </span>
            ) : (
              <span className="inline-flex items-center gap-1 rounded-full bg-sidebar-accent px-2 py-0.5 text-sidebar-accent-foreground">
                <FileSignature className="h-3 w-3" aria-hidden />
                {signOff.outstanding.length} to sign
              </span>
            )}
          </p>
        )}
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton asChild tooltip="Your sign-off">
              <Link to="/sign-off">
                <FileSignature className="h-4 w-4" />
                {!collapsed && <span>Your sign-off</span>}
              </Link>
            </SidebarMenuButton>
          </SidebarMenuItem>
          <SidebarMenuItem>
            <SidebarMenuButton onClick={onSignOut} tooltip="Sign out">
              <LogOut className="h-4 w-4" />
              {!collapsed && <span>Sign out</span>}
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>
    </Sidebar>
  );
}
