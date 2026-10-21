import { Link, useRouterState } from "@tanstack/react-router";

/** One connected Sales workspace: quotes, proposals/RFPs, MSAs & SOWs and SOW templates share this tab strip. */
export const DEAL_DOC_TABS = [
  { url: "/sales/documents", label: "Proposals & RFPs" },
  { url: "/sales/quotes", label: "Quotes" },
  { url: "/admin/agreements", label: "MSAs & SOWs" },
  { url: "/ops/contracts/sow-templates", label: "SOW templates" },
] as const;

export function SalesDealDocsTabs() {
  const pathname = useRouterState({ select: (r) => r.location.pathname });
  return (
    <nav aria-label="Quotes, proposals and agreements" className="mb-4">
      <p className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">Quotes, proposals &amp; agreements</p>
      <div className="flex flex-wrap gap-1 rounded-lg border bg-muted/40 p-1">
        {DEAL_DOC_TABS.map((t) => {
          const active = pathname === t.url || pathname.startsWith(`${t.url}/`);
          return (
            <Link key={t.url} to={t.url as never} aria-current={active ? "page" : undefined}
              className={`rounded-md px-3 py-1.5 text-sm transition-colors ${active ? "bg-background font-medium text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"}`}>
              {t.label}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
