import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { UserPlus } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { InviteStaffForm } from "@/components/invite-staff-form";
import { NeedsReview } from "@/components/access-admin-panels";
import { PossibleDuplicates } from "@/components/possible-duplicates";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useClientWorkspace } from "@/components/client-workspace";
import { EmployeesPage } from "@/components/employees-panel";
import { RolesPage } from "@/components/roles-panel";
import { PeopleDirectory } from "@/components/people-directory";
import { AccessPeopleTab, RolesTab, MatrixTab, AuditTab, ActivityTimelineTab } from "@/components/access-control-center";
import { visiblePeopleTabs, canSee, normalizePeopleSearch, EMPLOYEE_FILTERS, type PeopleFilter } from "@/lib/staff-nav";
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
      { title: "People & Access | Harmonious" },
      { name: "description", content: "Employees and all other users in one place: invites, roles, access, test and demo users." },
      { property: "og:title", content: "People & Access | Harmonious" },
      { property: "og:description", content: "Manage employees, clients, fund managers and investors and their access." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex" },
    ],
  }),
  validateSearch: (s: Record<string, unknown>): { tab?: string; sub?: string } => ({
    ...(typeof s["tab"] === "string" ? { tab: s["tab"] } : {}),
    ...(typeof s["sub"] === "string" ? { sub: s["sub"] } : {}),
  }),
  component: PeopleAccessPage,
});

const FILTERS: { id: PeopleFilter; label: string }[] = [
  { id: "employees", label: "Employees" },
  { id: "accounts", label: "All accounts" },
  { id: "fund_managers", label: "Fund managers" },
  { id: "founders", label: "Founders" },
  { id: "test", label: "Test & demo" },
  { id: "access", label: "Access by person" },
  { id: "records", label: "Details & ID checks" },
  { id: "wix", label: "Wix members" },
];

function PeopleAccessPage() {
  const search = Route.useSearch();
  const navigate = Route.useNavigate();
  const { session } = useClientWorkspace();
  const roles = session?.staffRoles ?? [];
  const tabs = visiblePeopleTabs(roles);
  const isEmployeeAdmin = canSee("peopleEmployees", roles);
  const norm = normalizePeopleSearch(search.tab, search.sub);
  const [inviteOpen, setInviteOpen] = useState(norm.section === "invite");
  if (!tabs.length) return <main className="mx-auto max-w-3xl px-4 py-10 text-muted-foreground">You don't have access to People & Access.</main>;
  const current = tabs.find((t) => t.id === norm.tab)?.id ?? tabs[0]!.id;
  const filters = FILTERS.filter((f) => isEmployeeAdmin || !EMPLOYEE_FILTERS.includes(f.id));
  const filter = filters.find((f) => f.id === norm.filter)?.id ?? filters[0]!.id;
  const go = (tab: string, sub?: string) => navigate({ search: sub ? { tab, sub } : { tab }, replace: true });
  return (
    <main className="mx-auto max-w-7xl space-y-5 px-4 py-8 sm:px-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-heading text-2xl font-semibold">People & Access</h1>
          <p className="text-muted-foreground">Find anyone, see what they can reach, and change it in one place.</p>
        </div>
        {isEmployeeAdmin && <Button size="lg" onClick={() => setInviteOpen(true)}><UserPlus className="mr-2 size-4" />Invite someone</Button>}
      </header>
      <Dialog open={inviteOpen} onOpenChange={setInviteOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
          <DialogHeader><DialogTitle>Invite someone</DialogTitle></DialogHeader>
          <InviteStaffForm />
        </DialogContent>
      </Dialog>
      <Tabs value={current} onValueChange={(v) => go(v)}>
        <TabsList className="h-auto flex-wrap">{tabs.map((t) => <TabsTrigger key={t.id} value={t.id} className="text-base">{t.title}</TabsTrigger>)}</TabsList>
        <TabsContent value="people" className="space-y-4">
          <div className="flex flex-wrap gap-2" role="group" aria-label="Show">
            {filters.map((f) => <Button key={f.id} size="sm" variant={filter === f.id ? "default" : "outline"} className="rounded-full" onClick={() => go("people", f.id)}>{f.label}</Button>)}
          </div>
          {filter === "employees" ? <EmployeesPage />
            : filter === "test" ? <PeopleDirectory initial="test" />
            : filter === "access" ? <AccessPeopleTab />
            : filter === "records" ? <div className="space-y-6"><PossibleDuplicates /><PersonRecords /></div>
            : filter === "wix" ? <WixMembersPanel />
            : filter === "fund_managers" ? <ContactDirectoryTable kind="fund_managers" />
            : filter === "founders" ? <ContactDirectoryTable kind="founders" />
            : <PeopleDirectory />}
        </TabsContent>
        <TabsContent value="roles" className="space-y-8">
          <RolesPage />
          <Section title="Role definitions"><RolesTab /></Section>
          <Section title="Who can do what"><MatrixTab /></Section>
        </TabsContent>
        <TabsContent value="security" className="space-y-8">
          {roles.some((r) => r === "super_admin" || r === "admin") && <p><Link to="/admin/security-activity" className="text-primary hover:underline">Open security activity & password or authenticator resets →</Link></p>}
          <RecentSignIns />
          <Section title="Needs review"><NeedsReview /></Section>
          <Section title="All activity"><ActivityTimelineTab /></Section>
          <Section title="Access change history"><AuditTab /></Section>
        </TabsContent>
      </Tabs>
    </main>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return <section className="space-y-3 border-t pt-6"><h2 className="font-heading text-xl font-semibold">{title}</h2>{children}</section>;
}

/** Latest sign-ins across all users; hidden for viewers who can't see the directory. */
function RecentSignIns() {
  const q = useQuery({ queryKey: ["people-directory"], queryFn: useServerFn(getPeopleDirectory), retry: false });
  const recent = ((q.data?.people ?? []) as any[]).filter((p) => p.lastSignIn).sort((a, b) => String(b.lastSignIn).localeCompare(String(a.lastSignIn))).slice(0, 8);
  if (!recent.length) return null;
  const half = Math.ceil(recent.length / 2);
  const cols = [recent.slice(0, half), recent.slice(half)].filter((c) => c.length);
  return (
    <section className="rounded-xl border p-4">
      <p className="mb-2 text-sm font-medium">Recent sign-ins</p>
      <div className="grid text-sm sm:grid-cols-2 sm:divide-x">
        {cols.map((col, i) => (
          <ul key={i} className={`divide-y ${i === 0 ? "sm:pr-4" : "sm:pl-4"}`}>
            {col.map((p) => <li key={p.id} className="flex justify-between gap-2 py-1.5"><span className="truncate">{p.name || p.email}</span><span className="shrink-0 text-muted-foreground">{new Date(p.lastSignIn).toLocaleString([], { dateStyle: "medium", timeStyle: "short" })}</span></li>)}
          </ul>
        ))}
      </div>
    </section>
  );
}
