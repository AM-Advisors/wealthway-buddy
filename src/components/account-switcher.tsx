import { Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import { ACCOUNT_KIND_LABELS, listAccounts, setActiveAccount } from "@/lib/personas.functions";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

/**
 * Lets an investor with several investing accounts (individual, LLC, trust…)
 * choose which one the onboarding steps apply to.
 */
export function AccountSwitcher({ className }: { className?: string }) {
  const load = useServerFn(listAccounts);
  const choose = useServerFn(setActiveAccount);
  const queryClient = useQueryClient();

  const { data } = useQuery({ queryKey: ["investor-accounts"], queryFn: () => load() });

  const switchTo = useMutation({
    mutationFn: (accountId: string) => choose({ data: { accountId } }),
    onSuccess: async () => {
      await queryClient.invalidateQueries();
      toast.success("Switched account");
    },
    onError: (error: unknown) =>
      toast.error(error instanceof Error ? error.message : "Could not switch account"),
  });

  const accounts = data?.accounts ?? [];
  if (accounts.length === 0) return null;

  return (
    <div className={className}>
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-sm text-muted-foreground">Investing as</span>
        <Select
          value={data?.activeId ?? undefined}
          onValueChange={(value) => switchTo.mutate(value)}
          disabled={switchTo.isPending}
        >
          <SelectTrigger className="h-9 w-[16rem]">
            <SelectValue placeholder="Choose an account" />
          </SelectTrigger>
          <SelectContent>
            {accounts.map((account) => (
              <SelectItem key={account.id} value={account.id}>
                {account.label} · {ACCOUNT_KIND_LABELS[account.kind] ?? account.kind}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button asChild variant="ghost" size="sm">
          <Link to="/accounts">Manage accounts</Link>
        </Button>
      </div>
    </div>
  );
}
