import type { ReactNode } from "react";
import { MoreHorizontal } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";

/** Shared presentation only: callers retain their record-specific links and authorized actions. */
export function InvestorActionsMenu({ name, open, details, detailsLabel = "Edit investor details", investment, readiness, perspective, invitation, removal }: {
  name: string;
  open: ReactNode;
  details?: ReactNode;
  detailsLabel?: string;
  investment?: ReactNode;
  readiness?: ReactNode;
  perspective?: ReactNode;
  invitation?: ReactNode;
  removal?: ReactNode;
}) {
  const unavailable = "Available for current investor records only";
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild><Button size="icon" variant="ghost" aria-label={`Actions for ${name}`}><MoreHorizontal className="h-4 w-4" /></Button></DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem asChild>{open}</DropdownMenuItem>
        {details ? <DropdownMenuItem asChild>{details}</DropdownMenuItem> : <DropdownMenuItem disabled title={unavailable}>{detailsLabel}</DropdownMenuItem>}
        {investment ? <DropdownMenuItem asChild>{investment}</DropdownMenuItem> : <DropdownMenuItem disabled title={unavailable}>Edit investment</DropdownMenuItem>}
        {readiness ? <DropdownMenuItem asChild>{readiness}</DropdownMenuItem> : <DropdownMenuItem disabled title={unavailable}>View readiness</DropdownMenuItem>}
        {perspective ? <DropdownMenuItem asChild>{perspective}</DropdownMenuItem> : null}
        {invitation ? <><DropdownMenuSeparator />{invitation}</> : null}
        {removal ? <><DropdownMenuSeparator />{removal}</> : null}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}