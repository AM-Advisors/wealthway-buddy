import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Plus } from "lucide-react";

import { getFundInvestorActions } from "@/lib/invitations.functions";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";

/** Fund header "+ Add". Showing an item is convenience only; every action is re-authorized on the server. */
export function FundAddMenu({ fundId }: { fundId: string }) {
  const load = useServerFn(getFundInvestorActions);
  const { data, isError } = useQuery({ queryKey: ["fund-investor-actions", fundId], queryFn: () => load({ data: { fundId } }) });
  if (isError || !data) return null; // not a manager/staff of this fund: no management actions
  const inv = (add: string, label: string) => (
    <DropdownMenuItem asChild><Link to="/manager/fund/$fundId/investors" params={{ fundId }} search={{ add } as never}>{label}</Link></DropdownMenuItem>
  );
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild><Button size="sm"><Plus className="mr-1 h-4 w-4" aria-hidden />Add</Button></DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        {data.isStaff ? inv("existing", "Add Existing Investor") : null}
        {inv("invite", "Invite New Investor")}
        {inv("prep", "Prepare Investor")}
        {inv("bulk", "Add Multiple Investors")}
        <DropdownMenuSeparator />
        <DropdownMenuItem asChild><Link to="/manager/fund/$fundId/assets" params={{ fundId }} search={{ add: "asset" } as never}>Add Asset / Investment</Link></DropdownMenuItem>
        <DropdownMenuItem asChild><Link to="/manager/fund/$fundId/settings" params={{ fundId }}>Add Fund Team Member</Link></DropdownMenuItem>
        <DropdownMenuItem asChild><Link to="/manager/fund/$fundId/documents" params={{ fundId }}>Upload Document</Link></DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
