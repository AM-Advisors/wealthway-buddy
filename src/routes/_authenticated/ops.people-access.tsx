import { createFileRoute } from "@tanstack/react-router";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useClientWorkspace } from "@/components/client-workspace";
import { EmployeesPage } from "@/components/employees-panel";
import { RolesPage } from "@/components/roles-panel";
import { PeopleDirectory } from "@/components/people-directory";
import { AccessControlCenter } from "@/components/access-control-center";
import { visiblePeopleTabs, type PeopleTab } from "@/lib/staff-nav";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Button } from "@/components/ui/button";
import { PersonRecords } from "@/components/person-records";
import { getPeopleDirectory } from "@/lib/user-access.functions";
import { ContactDirectoryTable } from "@/components/contact-directory-table";
import { WixMembersPanel } from "@/components/wix-members-panel";

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
  validateSearch: (s: Record<string, unknown>): { tab?: PeopleTab | "records"; sub?: string } => ({
    ...(typeof s["tab"] === "string" ? { tab: s["tab"] as PeopleTab | "records" } : {}),
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
  const current = tab === "records" ? "records" : tabs.find((t) => t.id === tab)?.id ?? tabs[0]!.id;
  return (
    <main className="mx-auto max-w-7xl space-y-4 px-4 py-8 sm:px-6">
      <header>
        <h1 className="font-heading text-2xl font-semibold">People & Access</h1>
        <p className="text-muted-foreground">Employees in one group, everyone else (clients, fund managers, founders, investors) in another.</p>
        <div className="mt-3"><Button onClick={() => navigate({ search: { tab: "access", sub: "invite" }, replace: true })}>Invite someone</Button></div>
      </header>
      <RecentSignIns />
      <Tabs value={current} onValueChange={(v) => navigate({ search: { tab: v as PeopleTab | "records" }, replace: true })}>
        <TabsList className="flex-wrap">{tabs.map((t) => <TabsTrigger key={t.id} value={t.id}>{t.title}</TabsTrigger>)}<TabsTrigger value="records">Details & ID checks</TabsTrigger></TabsList>
        <TabsContent value="records"><PersonRecords /></TabsContent>
        <TabsContent value="employees"><EmployeesPage /></TabsContent>
        <TabsContent value="others" className="space-y-4">
          <div className="flex flex-wrap gap-1">
            {([["accounts", "All accounts"], ["fund_managers", "Fund managers"], ["founders", "Founders"], ["wix", "Wix members"]] as const).map(([id, label]) => (
              <Button key={id} size="sm" variant={(sub ?? "accounts") === id ? "default" : "outline"} onClick={() => navigate({ search: { tab: "others", sub: id }, replace: true })}>{label}</Button>
            ))}
          </div>
          {sub === "wix" ? <WixMembersPanel /> : sub === "fund_managers" ? <ContactDirectoryTable kind="fund_managers" /> : sub === "founders" ? <ContactDirectoryTable kind="founders" /> : <PeopleDirectory />}
        </TabsContent>
        <TabsContent value="test"><PeopleDirectory initial="test" /></TabsContent>
        <TabsContent value="roles"><RolesPage /></TabsContent>
        <TabsContent value="access"><AccessControlCenter tab={sub ?? "people"} onTabChange={(t) => navigate({ search: { tab: "access", sub: t }, replace: true })} /></TabsContent>
      </Tabs>
    </main>
  );
}

/** Latest sign-ins across all users; hidden for viewers who can't see the directory. */
function RecentSignIns() {
  const q = useQuery({ queryKey: ["people-directory"], queryFn: useServerFn(getPeopleDirectory), retry: false });
  const recent = ((q.data?.people ?? []) as any[]).filter((p) => p.lastSignIn).sort((a, b) => String(b.lastSignIn).localeCompare(String(a.lastSignIn))).slice(0, 8);
  if (!recent.length) return null;
  return (
    <section className="rounded-xl border p-4">
      <p className="mb-2 text-sm font-medium">Recent sign-ins</p>
      <ul className="grid gap-1 text-sm sm:grid-cols-2">
        {recent.map((p) => <li key={p.id} className="flex justify-between gap-2"><span className="truncate">{p.name || p.email}</span><span className="shrink-0 text-muted-foreground">{new Date(p.lastSignIn).toLocaleString([], { dateStyle: "medium", timeStyle: "short" })}</span></li>)}
      </ul>
    </section>
  );
}
