import { createFileRoute } from "@tanstack/react-router";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useClientWorkspace } from "@/hooks/use-client-workspace";
import { EmployeesPage } from "@/components/employees-panel";
import { RolesPage } from "@/components/roles-panel";
import { PeopleDirectory } from "@/components/people-directory";
import { AccessControlCenter } from "@/components/access-control-center";
import { visiblePeopleTabs, type PeopleTab } from "@/lib/staff-nav";

export const Route = createFileRoute("/_authenticated/ops/people-access")({
  head: () => ({
    meta: [
      { title: "People & Access - Harmonious" },
      { name: "description", content: "Employees and all other users in one place: invites, roles, access, test and demo users." },
      { property: "og:title", content: "People & Access - Harmonious" },
      { property: "og:description", content: "Manage employees, clients, fund managers and investors and their access." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex" },
    ],
  }),
  validateSearch: (s: Record<string, unknown>): { tab?: PeopleTab; sub?: string } => ({
    ...(typeof s["tab"] === "string" ? { tab: s["tab"] as PeopleTab } : {}),
    ...(typeof s["sub"] === "string" ? { sub: s["sub"] } : {}),
  }),
  component: PeopleAccessPage,
});

function PeopleAccessPage() {
  const { tab, sub } = Route.useSearch();
  const navigate = Route.useNavigate();
  const { session } = useClientWorkspace();
  const tabs = visiblePeopleTabs(session?.staffRoles ?? []);
  if (!tabs.length) return <main className="mx-auto max-w-3xl px-4 py-10 text-muted-foreground">You don't have access to People & Access.</main>;
  const current = tabs.find((t) => t.id === tab)?.id ?? tabs[0]!.id;
  return (
    <main className="mx-auto max-w-7xl space-y-4 px-4 py-8 sm:px-6">
      <header>
        <h1 className="font-heading text-2xl font-semibold">People & Access</h1>
        <p className="text-muted-foreground">Employees in one group, everyone else (clients, fund managers, founders, investors) in another.</p>
      </header>
      <Tabs value={current} onValueChange={(v) => navigate({ search: { tab: v as PeopleTab }, replace: true })}>
        <TabsList className="flex-wrap">{tabs.map((t) => <TabsTrigger key={t.id} value={t.id}>{t.title}</TabsTrigger>)}</TabsList>
        <TabsContent value="employees"><EmployeesPage /></TabsContent>
        <TabsContent value="others"><PeopleDirectory /></TabsContent>
        <TabsContent value="test"><PeopleDirectory initial="test" /></TabsContent>
        <TabsContent value="roles"><RolesPage /></TabsContent>
        <TabsContent value="access"><AccessControlCenter tab={sub ?? "people"} onTabChange={(t) => navigate({ search: { tab: "access", sub: t }, replace: true })} /></TabsContent>
      </Tabs>
    </main>
  );
}
