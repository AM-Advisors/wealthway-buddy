import { Link, useRouterState } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  BadgeCheck,
  Building2,
  Check,
  CircleDashed,
  ClipboardList,
  FileSignature,
  FileText,
  FolderLock,
  Gauge,
  Landmark,
  LayoutDashboard,
  LogOut,
  Mail,
  ShieldCheck,
  UserPlus,
  Users,
} from "lucide-react";

import { Logo } from "@/components/Logo";
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
import { getNavState } from "@/lib/nav.functions";
import { cn } from "@/lib/utils";

type NavItem = { title: string; url: string; icon: typeof LayoutDashboard };

const investorItems: NavItem[] = [
  { title: "Dashboard", url: "/dashboard", icon: LayoutDashboard },
  { title: "Documents", url: "/documents", icon: FileText },
  { title: "Wire instructions", url: "/wire", icon: Landmark },
  { title: "Confirm your wire", url: "/wire-confirmation", icon: Landmark },
  { title: "Due diligence", url: "/diligence", icon: FolderLock },
  { title: "Portal", url: "/portal", icon: Building2 },
];

const managerItems: NavItem[] = [
  { title: "My funds", url: "/manager", icon: Users },
  { title: "Investors", url: "/manager/investors", icon: Users },
  { title: "Document inbox", url: "/manager/inbox", icon: FileText },
  { title: "Application timeline", url: "/manager/timeline", icon: Users },
  { title: "Reviewer activity", url: "/manager/activity", icon: Users },
  { title: "Fund documents", url: "/manager/documents", icon: FileText },
  { title: "My onboarding documents", url: "/manager/onboarding", icon: FileText },

  { title: "Fund pages", url: "/admin/funds", icon: Building2 },
  { title: "Wire instructions", url: "/admin/wire", icon: Landmark },
];

const adminItems: NavItem[] = [
  { title: "Applications", url: "/admin", icon: ClipboardList },
  { title: "New application", url: "/admin/new-application", icon: UserPlus },
  { title: "Fund access", url: "/admin/access", icon: BadgeCheck },
  { title: "Fund setup", url: "/admin/setup", icon: Building2 },
  { title: "Wire instructions", url: "/admin/wire", icon: Landmark },
  { title: "Onboarding funnel", url: "/admin/funnel", icon: Gauge },
  { title: "Document activity", url: "/admin/document-log", icon: FileText },
  { title: "Email preview", url: "/admin/email-preview", icon: Mail },
  { title: "Security", url: "/admin/security", icon: ShieldCheck },
];

const stepRoutes: Record<string, string> = {
  kyc: "/onboarding/kyc",
  aml: "/onboarding/aml",
  accreditation: "/onboarding/accreditation",
  documents: "/onboarding/documents",
  funding: "/onboarding/funding",
};

export function AppSidebar({ onSignOut }: { onSignOut: () => void }) {
  const { state } = useSidebar();
  const collapsed = state === "collapsed";
  const pathname = useRouterState({ select: (r) => r.location.pathname });

  const access = useServerFn(getAdminAccess);
  const navState = useServerFn(getNavState);
  const { data: adminAccess } = useQuery({ queryKey: ["admin-access"], queryFn: () => access() });
  const { data: nav } = useQuery({ queryKey: ["nav-state"], queryFn: () => navState() });

  const isActive = (url: string) =>
    url === "/admin" || url === "/manager" || url === "/diligence"
      ? pathname === url
      : pathname === url || pathname.startsWith(`${url}/`);

  const renderGroup = (label: string, items: NavItem[]) => (
    <SidebarGroup>
      <SidebarGroupLabel>{label}</SidebarGroupLabel>
      <SidebarGroupContent>
        <SidebarMenu>
          {items.map((item) => (
            <SidebarMenuItem key={item.url}>
              <SidebarMenuButton asChild isActive={isActive(item.url)} tooltip={item.title}>
                <Link to={item.url as never} className="flex items-center gap-2">
                  <item.icon className="h-4 w-4" />
                  {!collapsed && <span>{item.title}</span>}
                </Link>
              </SidebarMenuButton>
            </SidebarMenuItem>
          ))}
        </SidebarMenu>
      </SidebarGroupContent>
    </SidebarGroup>
  );

  const showOnboarding = Boolean(nav?.hasApplication) && !nav?.complete;

  return (
    <Sidebar collapsible="icon">
      <SidebarHeader>
        <Link to="/" aria-label="Harmonious home" className="flex items-center px-2 py-1">
          {collapsed ? (
            <Logo variant="navy" className="h-6 w-6 object-contain object-left" />
          ) : (
            <Logo variant="navy" className="h-7 w-auto" />
          )}
        </Link>
      </SidebarHeader>

      <SidebarContent>
        {renderGroup("Your application", investorItems)}

        {showOnboarding && (
          <SidebarGroup>
            <SidebarGroupLabel>Onboarding</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                {(nav?.steps ?? []).map((step, index) => {
                  const url = stepRoutes[step.key];
                  return (
                    <SidebarMenuItem key={step.key}>
                      <SidebarMenuButton
                        asChild
                        isActive={pathname === url}
                        tooltip={`${index + 1}. ${step.label}`}
                      >
                        <Link to={url as never} className="flex items-center gap-2">
                          {step.state === "done" ? (
                            <Check className="h-4 w-4 text-primary" />
                          ) : step.state === "current" ? (
                            <FileSignature className="h-4 w-4 text-primary" />
                          ) : (
                            <CircleDashed className="h-4 w-4 text-muted-foreground" />
                          )}
                          {!collapsed && (
                            <span
                              className={cn(
                                step.state === "todo" && "text-muted-foreground",
                                step.state === "current" && "font-medium",
                              )}
                            >
                              {index + 1}. {step.label}
                            </span>
                          )}
                        </Link>
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                  );
                })}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        )}

        {adminAccess?.isReviewer && renderGroup("Fund management", managerItems)}
        {adminAccess?.isAdmin && renderGroup("Administration", adminItems)}
      </SidebarContent>

      <SidebarFooter>
        {!collapsed && nav?.profile?.email && (
          <p className="truncate px-2 text-xs text-muted-foreground">{nav.profile.email}</p>
        )}
        <SidebarMenu>
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
