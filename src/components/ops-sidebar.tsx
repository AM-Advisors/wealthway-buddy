import { useEffect, useMemo, useState } from "react";
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
  MessageSquare,
  ChevronDown,
} from "lucide-react";
import { useInboxUnread } from "@/components/unified-inbox";

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
import { opsWorkAreas, type OpsCapability } from "@/lib/ops-capabilities";

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


type NavItem = { id: string; title: string; url: string; icon: string; sub?: { title: string; url: string }[] };

/** Key screens shown as sub-items under each Operations area (filtered by capability). */
const OPS_SUB: Record<string, { title: string; url: string; always?: boolean }[]> = {
  clients: [{ title: "Fund Managers", url: "/ops/clients/fund-managers", always: true }, { title: "Founders", url: "/ops/clients/founders", always: true }],
  funds: [{ title: "Fund Setup", url: "/ops/fund-setup" }, { title: "EIN / SS-4 queue", url: "/ops/ss4" }, { title: "Documents & signatures", url: "/ops/documents" }],
  investors: [{ title: "Investor onboarding & KYC", url: "/admin/investor-onboarding" }, { title: "Readiness queue", url: "/ops/readiness" }],
  capital: [{ title: "Banking", url: "/ops/banking" }, { title: "Distributions", url: "/ops/distributions" }, { title: "Capital calls & funding", url: "/admin/funding" }],
  accounting: [{ title: "NAV", url: "/ops/nav" }, { title: "Financial reviews", url: "/ops/financial-reviews" }, { title: "Financials", url: "/ops/financials" }],
};

const SALES_ROLES = ["sales", "account_executive", "bdr", "sales_management", "cro", "executive", "super_admin"];
const AM_ROLES = ["account_manager", "client_success", "executive", "super_admin", "cro", "sales_management"];
const LEADER_ROLES = ["cro", "sales_management", "executive", "super_admin"];

function useSectionOpen(id: string, containsActive: boolean) {
  const [open, setOpen] = useState(true);
  useEffect(() => {
    const saved = window.localStorage.getItem(`ops-nav-${id}`);
    setOpen(containsActive || saved === null ? true : saved === "1");
  }, [id, containsActive]);
  const toggle = () => setOpen((o) => { window.localStorage.setItem(`ops-nav-${id}`, o ? "0" : "1"); return !o; });
  return [open, toggle] as const;
}

const ACTIVE_CLS = "data-[active=true]:bg-sidebar-accent data-[active=true]:font-medium data-[active=true]:text-sidebar-accent-foreground data-[active=true]:shadow-[inset_2px_0_0_var(--color-sidebar-primary)]";

function NavSection({ id, label, items, pathname, collapsed, onNavigate, isActive }: {
  id: string; label: string; items: NavItem[]; pathname: string; collapsed: boolean; onNavigate: () => void; isActive: (item: NavItem) => boolean;
}) {
  const containsActive = items.some((i) => isActive(i) || i.sub?.some((s) => pathname.startsWith(s.url)));
  const [open, toggle] = useSectionOpen(id, containsActive);
  if (!items.length) return null;
  const show = collapsed || open;
  return (
    <>
      <SidebarSeparator />
      <SidebarGroup>
        {!collapsed && (
          <button type="button" onClick={toggle} aria-expanded={open} className="flex w-full items-center justify-between rounded px-2 py-1 text-xs font-medium uppercase tracking-wide text-sidebar-foreground/70 hover:text-sidebar-foreground">
            <span>{label}</span>
            <ChevronDown className={`h-3.5 w-3.5 transition-transform ${open ? "" : "-rotate-90"}`} />
          </button>
        )}
        {show && (
          <SidebarGroupContent>
            <SidebarMenu>
              {items.map((item) => {
                const Icon = ICONS[item.icon] ?? Briefcase;
                const active = isActive(item);
                return (
                  <SidebarMenuItem key={item.id}>
                    <SidebarMenuButton asChild isActive={active} tooltip={item.title} className={ACTIVE_CLS}>
                      <Link to={item.url as never} aria-current={active ? "page" : undefined} onClick={onNavigate} className="flex items-center gap-2">
                        <Icon className="h-4 w-4 shrink-0" />
                        <span className="truncate">{item.title}</span>
                      </Link>
                    </SidebarMenuButton>
                    {!collapsed && item.sub && item.sub.length > 0 && (active || item.sub.some((s) => pathname.startsWith(s.url))) && (
                      <div className="ml-6 border-l border-sidebar-border pl-3">
                        {item.sub.map((s) => (
                          <Link key={s.url} to={s.url as never} onClick={onNavigate} aria-current={pathname.startsWith(s.url) ? "page" : undefined}
                            className="block py-1.5 text-xs text-sidebar-foreground/80 hover:text-sidebar-foreground aria-[current=page]:font-medium aria-[current=page]:text-sidebar-foreground">{s.title}</Link>
                        ))}
                      </div>
                    )}
                  </SidebarMenuItem>
                );
              })}
            </SidebarMenu>
          </SidebarGroupContent>
        )}
      </SidebarGroup>
    </>
  );
}

/**
 * The Harmonious staff menu: Operations, Sales and Account Management as
 * collapsible sections. Every entry is display only; the backend re-checks
 * each request.
 */
export function OpsSidebar({ onSignOut }: { onSignOut: () => void }) {
  const { state, isMobile, setOpenMobile } = useSidebar();
  const collapsed = state === "collapsed" && !isMobile;
  const pathname = useRouterState({ select: (r) => r.location.pathname });
  const inbox = useInboxUnread();
  const { session } = useClientWorkspace();
  const sections = getNavigation(session as never, "operations", pathname).operations;
  const salesOnly = !session?.operations;
  const staffRoles = session?.staffRoles ?? [];
  const isSalesLeader = staffRoles.some((r) => LEADER_ROLES.includes(r));
  const capabilities = ((session as { operationsCapabilities?: OpsCapability[] } | null)?.operationsCapabilities ?? []);
  const [query, setQuery] = useState("");
  const index = useMemo(() => opsSearchIndex(capabilities), [capabilities]);
  const results = query.trim() ? searchOpsIndex(index, query) : null;
  const allowedUrls = useMemo(() => new Set(opsWorkAreas(capabilities).flatMap((a) => a.screens.map((s) => s.url))), [capabilities]);

  const home = sections.find((s) => s.id === "home");
  const adminSection = sections.find((s) => s.id === "administration");
  const opsItems: NavItem[] = salesOnly ? [] : [
    ...(allowedUrls.has("/ops/queue") ? [{ id: "queue", title: "Work queue", url: "/ops/queue", icon: "tasks" }] : []),
    ...sections.filter((s) => s.id !== "home" && s.id !== "administration").map((s) => ({
      ...s, sub: (OPS_SUB[s.id] ?? []).filter((x) => x.always || allowedUrls.has(x.url)),
    })),
  ];
  const regulatorySub = [{ title: "Close requests", url: "/ops/close-requests" }, { title: "Compliance & Controls", url: "/ops/compliance" }].filter((x) => allowedUrls.has(x.url));
  if (regulatorySub.length) opsItems.push({ id: "regulatory", title: "Regulatory & filings", url: regulatorySub[0]!.url, icon: "shield", sub: regulatorySub });

  const showSales = salesOnly || staffRoles.some((r) => SALES_ROLES.includes(r));
  const salesItems: NavItem[] = showSales ? [
    ...(isSalesLeader ? [{ id: "sales-cro", title: "CRO dashboard", url: "/sales/cro", icon: "report" }] : []),
    { id: "sales-dashboard", title: "Sales dashboard", url: "/sales/dashboard", icon: "report" },
    { id: "sales", title: "Pipeline & pricing", url: "/sales", icon: "briefcase" },
    { id: "sales-outreach", title: "Outreach", url: "/sales/outreach", icon: "people" },
    { id: "sales-quotes", title: "Quotes", url: "/sales/quotes", icon: "document" },
    { id: "sales-crm", title: "Contacts & deals", url: "/sales/crm", icon: "people" },
    { id: "sales-team", title: "Sales team", url: "/sales/team", icon: "people" },
  ] : [];
  const showAm = staffRoles.some((r) => AM_ROLES.includes(r));
  const amItems: NavItem[] = showAm ? [
    { id: "am-dashboard", title: "AM dashboard", url: "/account-manager", icon: "report" },
    { id: "am-clients", title: "My clients", url: "/account-manager/clients", icon: "briefcase" },
    { id: "am-handoffs", title: "New client hand-offs", url: "/account-manager/handoffs", icon: "tasks" },
    { id: "am-renewals", title: "Renewals & expansion", url: "/account-manager/renewals", icon: "money" },
    ...(!salesOnly ? [
      { id: "am-requests", title: "Service requests", url: "/admin/signoff", icon: "check" },
      { id: "am-invoices", title: "Invoices & payments", url: "/admin/invoices", icon: "tax" },
      { id: "am-activity", title: "Client activity", url: "/admin/client-activity", icon: "table" },
    ] : []),
  ] : [];

  const exact = (i: NavItem) => pathname === i.url;
  const opsActive = (i: NavItem) => i.id === "queue" || i.id === "regulatory" ? pathname === i.url : i.id === "administration" ? pathname.startsWith(i.url) : operationsNavItemIsActive(i.url, pathname);

  const close = () => {
    setQuery("");
    if (isMobile) setOpenMobile(false);
  };

  return (
    <Sidebar collapsible="icon" data-testid="ops-sidebar">
      <SidebarHeader>
        <Link to={salesOnly ? (isSalesLeader ? "/sales/cro" : "/sales") : "/ops"} aria-label="Harmonious Operations" data-testid="brand-logo" className="flex items-center px-2 py-1">
          {collapsed ? (
            <LogoIcon variant="white" className="h-6 w-6 object-contain object-left" />
          ) : (
            <Logo variant="white" className="h-7 w-auto" />
          )}
        </Link>
        {!collapsed && !salesOnly && (
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
          <>
            {home && !salesOnly && (
              <SidebarGroup>
                <SidebarGroupContent>
                  <SidebarMenu>
                    <SidebarMenuItem>
                      <SidebarMenuButton asChild isActive={pathname === "/ops"} tooltip="Home" className={ACTIVE_CLS}>
                        <Link to="/ops" onClick={close} className="flex items-center gap-2"><Home className="h-4 w-4 shrink-0" /><span className="truncate">Home</span></Link>
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                  </SidebarMenu>
                </SidebarGroupContent>
              </SidebarGroup>
            )}
            <NavSection id="operations" label="Operations" items={opsItems} pathname={pathname} collapsed={collapsed} onNavigate={close} isActive={opsActive} />
            <NavSection id="sales" label="Sales" items={salesItems} pathname={pathname} collapsed={collapsed} onNavigate={close} isActive={exact} />
            <NavSection id="account-management" label="Account Management" items={amItems} pathname={pathname} collapsed={collapsed} onNavigate={close} isActive={exact} />
            {adminSection && (
              <NavSection id="administration" label="Administration" items={[adminSection]} pathname={pathname} collapsed={collapsed} onNavigate={close} isActive={opsActive} />
            )}
            <SidebarSeparator />
            <SidebarGroup>
              <SidebarGroupContent>
                <SidebarMenu>
                  <SidebarMenuItem>
                    <SidebarMenuButton asChild isActive={pathname === "/inbox"} tooltip="Inbox">
                      <Link to="/inbox" onClick={close} className="flex items-center gap-2">
                        <MessageSquare className="h-4 w-4 shrink-0" />
                        <span className="flex-1 truncate">Inbox</span>
                        {!collapsed && !!inbox.data?.unread && <span className="rounded-full bg-sidebar-primary px-1.5 text-xs text-sidebar-primary-foreground">{inbox.data.unread}</span>}
                      </Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                </SidebarMenu>
              </SidebarGroupContent>
            </SidebarGroup>
          </>
        )}
      </SidebarContent>

      <SidebarAccountFooter workspaceLabel="Harmonious" userType={staffUserType(session?.staffRoles ?? [], salesOnly)} onSignOut={onSignOut} />
    </Sidebar>
  );
}

/** Plain user type shown under the company name: Operations, Sales or Account Manager. */
function staffUserType(roles: string[], salesOnly: boolean): string {
  if (roles.includes("client_success")) return "Account Manager";
  if (salesOnly || (roles.some((r) => ["sales", "account_executive", "bdr", "sales_management"].includes(r)) && !roles.includes("operations"))) return "Sales";
  return "Operations";
}
