import { Link, Outlet, useRouterState } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  Activity,
  ArrowLeft,
  Building2,
  FileText,
  Settings,
  ShieldCheck,
  Users,
  WalletCards,
} from "lucide-react";

import { getManagerFundHome } from "@/lib/manager-fund.functions";
import { regTypeLabel } from "@/lib/reg-types";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const sections = [
  { slug: "", label: "Overview", icon: Building2 },
  { slug: "investors", label: "Investors", icon: Users },
  { slug: "assets", label: "Assets & performance", icon: Activity },
  { slug: "transactions", label: "Transactions", icon: WalletCards },
  { slug: "documents", label: "Documents", icon: FileText },
  { slug: "compliance", label: "Compliance", icon: ShieldCheck },
  { slug: "settings", label: "Settings", icon: Settings },
] as const;

export function FundWorkspaceLayout({ fundId }: { fundId: string }) {
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  const load = useServerFn(getManagerFundHome);
  const query = useQuery({
    queryKey: ["manager-fund-home", fundId],
    queryFn: () => load({ data: { offeringId: fundId } }),
  });

  if (query.isLoading) {
    return <main className="mx-auto max-w-7xl px-4 py-10 text-sm text-muted-foreground">Loading fund…</main>;
  }

  if (query.isError || !query.data) {
    return (
      <main className="mx-auto max-w-3xl px-4 py-16 text-center">
        <h1 className="text-2xl">This fund isn't available</h1>
        <p className="mt-3 text-sm text-muted-foreground">You may not be assigned to this fund.</p>
        <Button asChild variant="outline" className="mt-6">
          <Link to="/manager">Back to My funds</Link>
        </Button>
      </main>
    );
  }

  const { fund, progress } = query.data;
  const percent = Math.round((progress.done / progress.total) * 100);

  return (
    <main className="min-w-0 bg-background">
      <header className="border-b bg-card">
        <div className="mx-auto max-w-7xl px-4 py-5 sm:px-6">
          <Link to="/manager" className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground">
            <ArrowLeft className="h-3.5 w-3.5" aria-hidden /> My funds
          </Link>
          <div className="mt-3 flex flex-wrap items-start justify-between gap-4">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="text-2xl sm:text-3xl">{fund.name}</h1>
                <Badge variant={fund.isOpen ? "default" : "outline"}>{fund.isOpen ? "Open" : "Closed"}</Badge>
                <Badge variant="secondary">{regTypeLabel(fund.regType)}</Badge>
              </div>
              <p className="mt-1 text-sm text-muted-foreground">
                {[fund.legalEntityName, fund.fundType, fund.stateFormed].filter(Boolean).join(" · ") || "Fund workspace"}
              </p>
            </div>
            <div className="min-w-40">
              <div className="flex items-center justify-between text-xs">
                <span className="text-muted-foreground">Setup readiness</span>
                <span className="font-medium">{percent}%</span>
              </div>
              <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-muted">
                <div className="h-full rounded-full bg-primary" style={{ width: `${percent}%` }} />
              </div>
            </div>
          </div>
        </div>
        <nav className="mx-auto flex max-w-7xl gap-1 overflow-x-auto px-4 sm:px-6" aria-label="Fund sections">
          {sections.map((section) => {
            const to = section.slug
              ? `/manager/fund/$fundId/${section.slug}`
              : "/manager/fund/$fundId";
            const href = section.slug
              ? `/manager/fund/${fundId}/${section.slug}`
              : `/manager/fund/${fundId}`;
            const active = section.slug ? pathname === href : pathname === href || pathname === `${href}/`;
            return (
              <Link
                key={section.label}
                to={to as never}
                params={{ fundId } as never}
                className={cn(
                  "flex h-11 shrink-0 items-center gap-2 border-b-2 px-3 text-sm transition-colors",
                  active
                    ? "border-primary font-medium text-foreground"
                    : "border-transparent text-muted-foreground hover:text-foreground",
                )}
              >
                <section.icon className="h-4 w-4" aria-hidden />
                {section.label}
              </Link>
            );
          })}
        </nav>
      </header>
      <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6">
        <Outlet />
      </div>
    </main>
  );
}