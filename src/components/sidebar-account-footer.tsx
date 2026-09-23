import { Link } from "@tanstack/react-router";
import { ChevronsUpDown, FileSignature, LogOut, Repeat, UserRound } from "lucide-react";

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
  onSignOut,
}: {
  workspaceLabel: string;
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

  return (
    <SidebarFooter className="border-t border-sidebar-border" data-testid="sidebar-account-footer">
      <SidebarMenu>
        <SidebarMenuItem>
          <DropdownMenu>
            <DropdownMenuTrigger
              aria-label="Account menu"
              title={collapsed ? `${label} — ${workspaceLabel}` : undefined}
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
                  </span>
                  <ChevronsUpDown className="h-3.5 w-3.5 shrink-0 opacity-70" aria-hidden />
                </>
              )}
            </DropdownMenuTrigger>
            <DropdownMenuContent side="top" align="start" className="w-60">
              <DropdownMenuLabel className="truncate">{label}</DropdownMenuLabel>
              {email && name ? <p className="truncate px-2 pb-1 text-xs text-muted-foreground">{email}</p> : null}
              <p className="truncate px-2 pb-1 text-xs text-muted-foreground">Workspace: {workspaceLabel}</p>
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
