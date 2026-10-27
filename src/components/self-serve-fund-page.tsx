import type { ReactNode } from "react";
import { Building2, FileText, Link2, Users, Activity, UserCog } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

export const SELF_SERVE_AREAS = ["setup", "investors", "documents", "link", "team", "overview"] as const;
export type SelfServeArea = typeof SELF_SERVE_AREAS[number];
const areas = [
  { value: "setup", label: "Set up fund", icon: Building2 },
  { value: "investors", label: "Investors & invitations", icon: Users },
  { value: "documents", label: "Documents", icon: FileText },
  { value: "link", label: "Onboarding link", icon: Link2 },
  { value: "team", label: "Fund team", icon: UserCog },
  { value: "overview", label: "Activity & reporting", icon: Activity },
] as const;

export function SelfServeFundPage({ area, onAreaChange, sections }: { area: SelfServeArea; onAreaChange: (area: SelfServeArea) => void; sections: Record<SelfServeArea, () => ReactNode> }) {
  return <section className="min-w-0 space-y-5" aria-label="Manage your fund">
    <Tabs value={area} onValueChange={value => { const next = SELF_SERVE_AREAS.find(a => a === value); if (next) onAreaChange(next); }}>
      <TabsList className="grid h-auto w-full grid-cols-2 gap-1 bg-muted p-1 sm:grid-cols-3">
        {areas.map(a => <TabsTrigger key={a.value} value={a.value} className="h-auto min-h-11 gap-2 whitespace-normal px-2 py-2 text-left"><a.icon className="size-4 shrink-0" aria-hidden /><span>{a.label}</span></TabsTrigger>)}
      </TabsList>
      {areas.map(a => <TabsContent key={a.value} value={a.value} className="mt-5 min-w-0">{area === a.value && sections[a.value]()}</TabsContent>)}
    </Tabs>
  </section>;
}