import { Link, Outlet, createFileRoute, useRouterState } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";

import { getProfessionalStanding } from "@/lib/professional.functions";
import { cn } from "@/lib/utils";

const NAV = [
  { to: "/professional", label: "My clients", exact: true },
  { to: "/professional/profiles", label: "Client profiles" },
  { to: "/professional/funds", label: "Funds" },
  { to: "/professional/investments", label: "Investments" },
  { to: "/professional/documents", label: "Documents" },
  { to: "/professional/tax", label: "Tax" },
  { to: "/professional/tasks", label: "Tasks" },
  { to: "/professional/activity", label: "Activity" },
  { to: "/professional/organization", label: "Organization" },
] as const;

function ProfessionalLayout() {
  const pathname = useRouterState({ select: (r) => r.location.pathname });
  const standing = useServerFn(getProfessionalStanding);
  const { data, isPending } = useQuery({
    queryKey: ["professional-standing"],
    queryFn: () => standing(),
    staleTime: 0,
  });

  if (isPending) {
    return <main className="mx-auto max-w-6xl px-4 py-10 text-sm text-muted-foreground">Loading…</main>;
  }

  if (!data?.isProfessional) {
    return (
      <main className="mx-auto max-w-2xl px-4 py-10">
        <h1 className="text-2xl">Professional workspace</h1>
        <p className="mt-3 text-sm text-muted-foreground">
          This area is for professionals acting for a client. You will see a client here once they
          have given you access.
        </p>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-6xl space-y-6 px-4 py-8">
      <header>
        <h1 className="text-3xl">Professional workspace</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          You only see clients who have authorised you. Being seated at a firm on its own shows
          nothing.
        </p>
      </header>

      <nav className="flex flex-wrap gap-1 border-b border-border pb-2">
        {NAV.map((item) => {
          const active = item.exact ? pathname === item.to : pathname.startsWith(item.to);
          return (
            <Link
              key={item.to}
              to={item.to}
              className={cn(
                "rounded-md px-3 py-1.5 text-sm",
                active ? "bg-accent font-medium" : "text-muted-foreground hover:bg-accent/60",
              )}
            >
              {item.label}
            </Link>
          );
        })}
      </nav>

      <Outlet />
    </main>
  );
}

export const Route = createFileRoute("/_authenticated/professional")({
  head: () => ({
    meta: [
      { title: "Professional workspace — Harmonious" },
      {
        name: "description",
        content:
          "Clients who have authorised you, with the profiles, funds, investments, documents and status their delegation covers.",
      },
      { property: "og:title", content: "Professional workspace — Harmonious" },
      {
        property: "og:description",
        content: "Delegated, read-only access to the clients who authorised you.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: ProfessionalLayout,
});
