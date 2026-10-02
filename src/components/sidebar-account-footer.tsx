import { Link } from "@tanstack/react-router";
import { ChevronsUpDown, FileSignature, LogOut, Monitor, Moon, Repeat, Sun, UserRound, ShieldCheck } from "lucide-react";
import { useThemeMode, type ThemeMode } from "@/lib/theme-mode";

import { useClientWorkspace } from "@/components/client-workspace";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { SidebarFooter, SidebarMenu, SidebarMenuItem, useSidebar } from "@/components/ui/sidebar";

/**
 * Fixed sidebar footer: current workspace plus the account menu. Account
 * actions (profile, switch workspace, sign out) live here and never among
 * workflow navigation. Workspaces come from the resolved session only.
 */
export function SidebarAccountFooter({
  workspaceLabel,
  userType,
  onSignOut,
}: {
  workspaceLabel: string;
  userType?: string;
  onSignOut: () => void;
}) {
  const { state } = useSidebar();
  const collapsed = state === "collapsed";
  const { session, options, activeId, switchTo } = useClientWorkspace();
  const name = session?.person?.name;
  const email = session?.person?.email;
  const label = name || email || "Your account";
  const initial = (name || email || "H").trim().charAt(0).toUpperCase();
  const others = options.filter((o) => o.id !== activeId);
  const { mode, setMode } = useThemeMode();
  const modes: { value: ThemeMode; label: string; Icon: typeof Sun }[] = [
    { value: "light", label: "Light", Icon: Sun },
    { value: "dark", label: "Dark", Icon: Moon },
    { value: "auto", label: "Auto", Icon: Monitor },
  ];

  return (
    <SidebarFooter className="border-t border-sidebar-border" data-testid="sidebar-account-footer">
      <SidebarMenu>
        <SidebarMenuItem>
          <DropdownMenu>
            <DropdownMenuTrigger
              aria-label="Account menu"
              title={collapsed ? `${label} - ${workspaceLabel}` : undefined}
              className="flex w-full min-w-0 items-center gap-2 rounded-md p-1.5 text-left text-sidebar-foreground hover:bg-sidebar-accent"
            >
              <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-sidebar-primary text-xs font-medium text-sidebar-primary-foreground">
                {initial}
              </span>
              {!collapsed && (
                <>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-xs font-medium">{label}</span>
                    <span className="block truncate text-[11px] text-sidebar-foreground/70">{workspaceLabel}</span>
                    {userType ? <span className="block truncate text-[11px] text-sidebar-foreground/60">{userType}</span> : null}
                  </span>
                  <ChevronsUpDown className="h-3.5 w-3.5 shrink-0 opacity-70" aria-hidden />
                </>
              )}
            </DropdownMenuTrigger>
            <DropdownMenuContent side="top" align="start" className="w-60">
              <DropdownMenuLabel className="truncate">{label}</DropdownMenuLabel>
              {email && name ? <p className="truncate px-2 pb-1 text-xs text-muted-foreground">{email}</p> : null}
              <p className="truncate px-2 pb-1 text-xs text-muted-foreground">Workspace: {workspaceLabel}</p>
              {userType ? <p className="truncate px-2 pb-1 text-xs text-muted-foreground">User type: {userType}</p> : null}
              <DropdownMenuSeparator />
              <DropdownMenuItem asChild>
                <Link to="/profile" className="flex items-center gap-2">
                  <UserRound className="size-4" /> Profile & account
                </Link>
              </DropdownMenuItem>
              <DropdownMenuItem asChild>
                <Link to="/sign-off" className="flex items-center gap-2">
                  <FileSignature className="size-4" /> Policies & sign-off
                </Link>
              </DropdownMenuItem>
              {others.length > 0 && (
                <DropdownMenuSub>
                  <DropdownMenuSubTrigger className="flex items-center gap-2">
                    <Repeat className="size-4" /> Switch workspace
                  </DropdownMenuSubTrigger>
                  <DropdownMenuSubContent className="w-56">
                    {others.map((o) => (
                      <DropdownMenuItem
                        key={o.id}
                        onSelect={(e) => {
                          e.preventDefault();
                          void switchTo(o.id);
                        }}
                      >
                        <span className="truncate">{o.label}</span>
                      </DropdownMenuItem>
                    ))}
                  </DropdownMenuSubContent>
                </DropdownMenuSub>
              )}
              <DropdownMenuSeparator />
              <p className="px-2 pb-1 text-xs text-muted-foreground">Appearance</p>
              <div className="flex gap-1 px-2 pb-2" role="radiogroup" aria-label="Appearance">
                {modes.map(({ value, label, Icon }) => (
                  <button
                    key={value}
                    type="button"
                    role="radio"
                    aria-checked={mode === value}
                    onClick={() => setMode(value)}
                    className={`flex flex-1 items-center justify-center gap-1 rounded-md border px-2 py-1 text-xs ${mode === value ? "border-primary bg-accent text-accent-foreground" : "border-border hover:bg-muted"}`}
                  >
                    <Icon className="size-3.5" /> {label}
                  </button>
                ))}
              </div>
              <DropdownMenuSeparator />
              <DropdownMenuItem onSelect={() => onSignOut()} className="flex items-center gap-2">
                <LogOut className="size-4" /> Sign out
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </SidebarMenuItem>
      </SidebarMenu>
    </SidebarFooter>
  );
}
