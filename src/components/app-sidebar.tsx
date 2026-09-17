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
import { getAdminAccess } from "@/lib/admin.functions";
import { getOperationsAccess } from "@/lib/operations.functions";
import { getNavState } from "@/lib/nav.functions";
import { getNavCounts } from "@/lib/nav-counts.functions";
import { getPolicyStatus } from "@/lib/policies.functions";
import { getProfessionalStanding } from "@/lib/professional.functions";
import { cn } from "@/lib/utils";

type BadgeKey = "signOff" | "applications" | "unpaidInvoices" | "serviceRequests" | "myClients";

type NavItem = {
  title: string;
  url: string;
  icon: typeof LayoutDashboard;
  badge?: BadgeKey;
};

type NavGroup = { id: string; label: string; items: NavItem[] };

const investorItems: NavItem[] = [
  { title: "Dashboard", url: "/dashboard", icon: LayoutDashboard },
  { title: "Documents", url: "/documents", icon: FileText },
  { title: "Fund documents", url: "/fund-documents", icon: FolderLock },
  { title: "Document vault", url: "/vault", icon: FileSignature },
  { title: "Wire instructions", url: "/wire", icon: Landmark },
  { title: "Confirm your wire", url: "/wire-confirmation", icon: Send },
  { title: "Due diligence", url: "/diligence", icon: FolderLock },
  { title: "Portal", url: "/portal", icon: Building2 },
  { title: "My equity", url: "/my-equity", icon: Briefcase },
  { title: "Items prepared for me", url: "/prepared", icon: ClipboardList },
  { title: "Who can see my information", url: "/access", icon: BookLock },

];

const professionalItems: NavItem[] = [
  { title: "My clients", url: "/professional", icon: Users },
  { title: "Prepare for a client", url: "/professional/prepare", icon: ClipboardList },
  { title: "Client profiles", url: "/professional/profiles", icon: Briefcase },

  { title: "Funds", url: "/professional/funds", icon: Building2 },
  { title: "Investments", url: "/professional/investments", icon: Layers },
  { title: "Documents", url: "/professional/documents", icon: FileText },
  { title: "Tax", url: "/professional/tax", icon: FileSpreadsheet },
  { title: "Tasks", url: "/professional/tasks", icon: ClipboardList },
  { title: "Activity", url: "/professional/activity", icon: History },
  { title: "Organization", url: "/professional/organization", icon: Handshake },
];

const managerItems: NavItem[] = [
  { title: "My funds", url: "/manager", icon: Briefcase },
  { title: "Document inbox", url: "/manager/inbox", icon: Mail },
  { title: "Investor approvals", url: "/manager/approvals", icon: BadgeCheck },
  { title: "Reviewer activity", url: "/manager/activity", icon: ClipboardList },
];

const selectedFundItems = (fundId: string): NavItem[] => [
  { title: "Overview", url: `/manager/fund/${fundId}`, icon: Building2 },
  { title: "Investors", url: `/manager/fund/${fundId}/investors`, icon: Users },
  { title: "Assets & performance", url: `/manager/fund/${fundId}/assets`, icon: Gauge },
  { title: "Transactions", url: `/manager/fund/${fundId}/transactions`, icon: Banknote },
  { title: "Documents", url: `/manager/fund/${fundId}/documents`, icon: FileText },
  { title: "Compliance", url: `/manager/fund/${fundId}/compliance`, icon: ShieldCheck },
  { title: "Settings", url: `/manager/fund/${fundId}/settings`, icon: ScrollText },
];

const operationsItems: NavItem[] = [
  { title: "Operations", url: "/ops", icon: ShieldCheck },
  { title: "Banking requests", url: "/ops/banking", icon: Landmark },
  { title: "EIN and SS-4", url: "/ops/ss4", icon: FileText },
  { title: "Tax documents", url: "/ops/tax-documents", icon: FileSpreadsheet },
  { title: "Operations team", url: "/ops/team", icon: Users },
];

const clientsAndMoneyItems: NavItem[] = [
  { title: "Client onboarding", url: "/admin/onboarding", icon: UserPlus },
  { title: "Onboarding progress", url: "/admin/onboarding-progress", icon: Gauge },
  { title: "Clients and scope", url: "/admin/contracts", icon: Handshake },
  { title: "Entities and engagements", url: "/admin/entities", icon: Building2 },
  { title: "Services administration", url: "/admin/services", icon: Layers },
  { title: "Agreements & SOW", url: "/admin/agreements", icon: ScrollText },
  { title: "Pricing and agreements", url: "/admin/pricing", icon: ScrollText },
  { title: "Rate proposals", url: "/admin/rate-proposals", icon: Handshake },
  {
    title: "Unpaid invoices",
    url: "/admin/invoices",
    icon: Receipt,
    badge: "unpaidInvoices",
  },
  { title: "Wires and distributions", url: "/admin/money", icon: Banknote },
  { title: "Wire instructions", url: "/admin/wire", icon: Landmark },
  { title: "Bank accounts", url: "/admin/bank-accounts", icon: Landmark },
  { title: "Client bank accounts", url: "/admin/client-bank-accounts", icon: Landmark },

];

/** Cap table for founders — their own company ownership records. */
const capTableFounderItems: NavItem[] = [
  { title: "Overview", url: "/client/cap-table", icon: Gauge },
  { title: "Cap table", url: "/client/cap-table/table", icon: FileSpreadsheet },
  { title: "Securities", url: "/client/cap-table/securities", icon: ScrollText },
  { title: "Employees", url: "/client/cap-table/employees", icon: Users },
  { title: "Investors", url: "/client/cap-table/investors", icon: Briefcase },
  { title: "Fundraising", url: "/client/cap-table/fundraising", icon: Handshake },
  { title: "Secondaries", url: "/client/cap-table/secondaries", icon: Banknote },
  { title: "Exposure and claims", url: "/client/cap-table/exposure", icon: ShieldCheck },
  { title: "Migration", url: "/client/cap-table/migration", icon: History },
  { title: "Reconciliation", url: "/client/cap-table/reconciliation", icon: ClipboardList },
  { title: "Documents", url: "/client/cap-table/documents", icon: FileText },
  { title: "Compliance", url: "/client/cap-table/compliance", icon: BookLock },
  { title: "Reports", url: "/client/cap-table/reports", icon: FileSpreadsheet },
  { title: "Settings", url: "/client/cap-table/settings", icon: ScrollText },
];

/** Cap table for Harmonious staff — the clients they administer. */
const capTableStaffItems: NavItem[] = [
  { title: "Client cap tables", url: "/admin/client-cap-tables", icon: Users },
  { title: "Cap table requests", url: "/admin/cap-table-requests", icon: UserPlus },
  { title: "Cap table plans", url: "/admin/cap-table-plans", icon: Gauge },
  { title: "Migration concierge", url: "/admin/cap-table-migrations", icon: ScrollText },
];

const onboardingItems: NavItem[] = [
  { title: "KYC / AML", url: "/onboarding/compliance", icon: BadgeCheck },
  { title: "Accreditation", url: "/onboarding/accreditation", icon: FileSignature },
];

const applicationsAndFundsItems: NavItem[] = [
  { title: "Applications", url: "/admin", icon: ClipboardList, badge: "applications" },
  { title: "New application", url: "/admin/new-application", icon: UserPlus },
  { title: "Fund setup", url: "/admin/setup", icon: Building2 },
  { title: "Fund pages", url: "/admin/funds", icon: Building2 },
  { title: "Fund access", url: "/admin/access", icon: BadgeCheck },
];

const recordsItems: NavItem[] = [
  { title: "Sign-off", url: "/admin/signoff", icon: FileSignature, badge: "serviceRequests" },
  { title: "Client portal activity", url: "/admin/client-activity", icon: History },
  { title: "Onboarding funnel", url: "/admin/funnel", icon: Gauge },
  { title: "Document activity", url: "/admin/document-log", icon: FileText },
  { title: "Activity log", url: "/admin/activity", icon: ClipboardList },
  { title: "Audit log", url: "/admin/audit", icon: BookLock },
  { title: "Security", url: "/admin/security", icon: ShieldCheck },
  { title: "Email preview", url: "/admin/email-preview", icon: Mail },
];

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

  const access = useServerFn(getAdminAccess);
  const navState = useServerFn(getNavState);
  const { data: adminAccess } = useQuery({ queryKey: ["admin-access"], queryFn: () => access() });
  const { data: nav } = useQuery({ queryKey: ["nav-state"], queryFn: () => navState() });
  const opsAccess = useServerFn(getOperationsAccess);
  const { data: operations } = useQuery({
    queryKey: ["operations-access"],
    queryFn: () => opsAccess(),
  });
  const standingFn = useServerFn(getProfessionalStanding);
  const { data: standing } = useQuery({
    queryKey: ["professional-standing"],
    queryFn: () => standingFn(),
  });
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

  const groups: NavGroup[] = useMemo(() => {
    const list: NavGroup[] = [{ id: "application", label: "Your application", items: investorItems }];
    list.push({
      id: "cap-table",
      label: "CapTable",
      items: adminAccess?.isAdmin
        ? [...capTableFounderItems, ...capTableStaffItems]
        : capTableFounderItems,
    });
    if (adminAccess?.isReviewer) {
      list.push({ id: "funds", label: "Fund management", items: managerItems });
      const selectedFundId = pathname.match(/^\/manager\/fund\/([^/]+)/)?.[1];
      if (selectedFundId) {
        list.push({ id: "selected-fund", label: "Selected fund", items: selectedFundItems(selectedFundId) });
      }
    }
    if (standing?.isProfessional)
      list.push({ id: "professional", label: "Acting for clients", items: professionalItems });
    if (operations?.allowed)
      list.push({ id: "operations", label: "Operations", items: operationsItems });
    if (adminAccess?.isAdmin) {
      list.push(
        { id: "clients-money", label: "Clients and money", items: clientsAndMoneyItems },
        { id: "applications-funds", label: "Applications and funds", items: applicationsAndFundsItems },
        { id: "records", label: "Records and oversight", items: recordsItems },
      );
    }
    return list;
  }, [
    adminAccess?.isAdmin,
    adminAccess?.isReviewer,
    operations?.allowed,
    standing?.isProfessional,
    pathname,
  ]);

  const search = query.trim().toLowerCase();
  const matches = (item: NavItem) => !search || item.title.toLowerCase().includes(search);

  const renderItem = (item: NavItem) => {
    const count = badgeCount(item.badge);
    return (
      <SidebarMenuItem key={item.url}>
        <SidebarMenuButton
          asChild
          isActive={isActive(item.url)}
          tooltip={count > 0 ? `${item.title} (${count})` : item.title}
          className="data-[active=true]:border-l-2 data-[active=true]:border-sidebar-primary data-[active=true]:bg-sidebar-accent data-[active=true]:font-medium"
        >
          <Link to={item.url as never} className="flex items-center gap-2">
            <item.icon className="h-4 w-4 shrink-0" />
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

  const renderGroup = (group: NavGroup) => {
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
    { title: "Home", url: "/home", icon: Home },
    ...(isStaff
      ? [{ title: "My clients", url: "/staff", icon: Users, badge: "myClients" as BadgeKey }]
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
                                <item.icon className="h-4 w-4 text-primary" />
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
