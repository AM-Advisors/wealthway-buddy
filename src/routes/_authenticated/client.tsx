import { useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { createFileRoute, Link, Outlet, useRouterState } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import {
  Banknote,
  Briefcase,
  FileText,
  HandCoins,
  LayoutDashboard,
  Mail,
  PenLine,
  ScrollText,
  Send,
} from "lucide-react";

import { listMyMessages } from "@/lib/client-inbox.functions";
import { recordPortalSignIn } from "@/lib/sign-in-log.functions";

import { ClientIntakeGate } from "@/components/client-intake-gate";
import { ClientPortalProvider, useClientPortal } from "@/components/client-portal-context";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/client")({
  head: () => ({
    meta: [
      { title: "Client Portal — Harmonious" },
      {
        name: "description",
        content:
          "Your Harmonious client portal: the funds we administer for you, your statement of work, what it covers, your invoices and approved payments.",
      },
      { property: "og:title", content: "Client Portal — Harmonious" },
      {
        property: "og:description",
        content: "Funds, statement of work, invoices and approved payments in one place.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: ClientPortalLayout,
});

function ClientPortalLayout() {
  const logSignIn = useServerFn(recordPortalSignIn);
  useEffect(() => {
    // Once per browser session — covers Google sign-ins, which the password
    // form's own attempt logging never sees.
    if (sessionStorage.getItem("harmonious-sign-in-logged")) return;
    sessionStorage.setItem("harmonious-sign-in-logged", "1");
    void logSignIn().catch(() => {
      /* logging must never block the portal */
    });
  }, [logSignIn]);
  return (
    <ClientPortalProvider>
      <ClientIntakeGate>
        <ClientShell />
      </ClientIntakeGate>
    </ClientPortalProvider>
  );
}

type NavItem = {
  to: string;
  label: string;
  icon: typeof Briefcase;
  exact?: boolean;
  badge?: number | undefined;
};

function ClientShell() {
  const { data, isLoading, clientId, setClientId } = useClientPortal();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const listMessages = useServerFn(listMyMessages);
  const inboxQuery = useQuery({ queryKey: ["client-inbox"], queryFn: () => listMessages() });
  const unreadMessages = ((inboxQuery.data?.messages ?? []) as any[]).filter(
    (m) => !m.read_at,
  ).length;

  if (isLoading) {
    return (
      <main className="mx-auto w-full max-w-6xl px-4 py-10">
        <p className="text-sm text-muted-foreground">Loading your engagement…</p>
      </main>
    );
  }

  if (!data?.client) {
    return (
      <main className="mx-auto w-full max-w-6xl px-4 py-10">
        <h1 className="text-3xl">Client portal</h1>
        <Card className="mt-6">
          <CardHeader>
            <CardTitle className="text-base">No client engagement linked yet</CardTitle>
            <CardDescription>
              This portal shows the funds, agreement, invoices and approved payments for a
              Harmonious client. Your sign-in isn't attached to one yet — ask your Harmonious
              contact to add you.
            </CardDescription>
          </CardHeader>
        </Card>
      </main>
    );
  }

  const client = data.client as any;
  const clients = (data.clients ?? []) as any[];
  const funds = (data.funds ?? []) as any[];
  const sows = (data.sows ?? []) as any[];
  const invoices = (data.invoices ?? []) as any[];
  const payments = (data.payments ?? []) as any[];
  const serviceRequests = ((data as any).serviceRequests ?? []) as any[];

  const openInvoices = invoices.filter((i: any) => i.status === "issued").length;
  const paymentsInProgress = payments.filter(
    (p: any) =>
      !["settled", "completed", "cancelled", "canceled", "rejected"].includes(String(p.status)),
  ).length;
  const awaitingSignature = serviceRequests.filter((r: any) => r.status === "quoted").length;

  const items: NavItem[] = [
    { to: "/client", label: "Overview", icon: LayoutDashboard, exact: true },
    {
      to: "/client/inbox",
      label: "Inbox",
      icon: Mail,
      badge: unreadMessages || undefined,
    },
    { to: "/client/funds", label: "Funds", icon: Briefcase, badge: funds.length || undefined },
    {
      to: "/client/invoices",
      label: "Invoices",
      icon: FileText,
      badge: openInvoices || undefined,
    },
    {
      to: "/client/payments",
      label: "Payments",
      icon: HandCoins,
      badge: paymentsInProgress || undefined,
    },
    { to: "/client/wires", label: "Wire requests", icon: Send },
    { to: "/client/cap-table", label: "Cap table", icon: PieChart },
    { to: "/client/banking", label: "Bank accounts", icon: Banknote },

    {
      to: "/client/agreements",
      label: "Agreements & scope",
      icon: ScrollText,
      badge: sows.length || undefined,
    },
    {
      to: "/client/sign-offs",
      label: "Sign-offs",
      icon: PenLine,
      badge: awaitingSignature || undefined,
    },
  ];

  return (
    <main className="mx-auto w-full max-w-6xl px-4 py-8">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Client portal
          </p>
          <h1 className="mt-1 text-2xl sm:text-3xl">{client.name}</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Your funds, agreements, invoices and payments with Harmonious in one place.
          </p>
        </div>
        {clients.length > 1 && (
          <div className="flex flex-wrap gap-2">
            {clients.map((c) => (
              <Button
                key={c.id}
                size="sm"
                variant={c.id === client.id ? "default" : "outline"}
                onClick={() => setClientId(c.id)}
              >
                {c.name}
              </Button>
            ))}
          </div>
        )}
      </div>

      <div className="mt-6 flex flex-col gap-6 md:flex-row">
        <aside className="md:w-56 md:shrink-0">
          <nav
            aria-label="Client portal"
            className="flex gap-1 overflow-x-auto pb-1 md:flex-col md:overflow-visible md:pb-0"
          >
            {items.map((item) => {
              const active = item.exact ? pathname === item.to : pathname.startsWith(item.to);
              return (
                <Link
                  key={item.to}
                  to={item.to}
                  className={cn(
                    "flex items-center gap-2 whitespace-nowrap rounded-md px-3 py-2 text-sm text-muted-foreground transition-colors hover:bg-muted/60 hover:text-foreground",
                    active && "bg-primary text-primary-foreground hover:bg-primary hover:text-primary-foreground",
                  )}
                >
                  <item.icon className="h-4 w-4 shrink-0" />
                  <span>{item.label}</span>
                  {item.badge ? (
                    <Badge
                      variant={active ? "outline" : "secondary"}
                      className="ml-auto hidden md:inline-flex"
                    >
                      {item.badge}
                    </Badge>
                  ) : null}
                </Link>
              );
            })}
          </nav>
        </aside>

        <section className="min-w-0 flex-1">
          <Outlet />
        </section>
      </div>

      <p className="mt-10 text-xs text-muted-foreground">
        Harmonious provides administrative, technology, onboarding, reporting, payment-facilitation,
        recordkeeping and compliance-support services under your master service agreement and
        statements of work. Harmonious is not your investment adviser, broker-dealer, custodian,
        transfer agent, escrow agent, auditor, accountant, tax preparer or legal counsel unless a
        statement of work expressly says so.
      </p>
    </main>
  );
}
