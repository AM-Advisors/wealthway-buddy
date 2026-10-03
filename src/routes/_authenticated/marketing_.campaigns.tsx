import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { MkPage, mkHead } from "@/components/marketing-ui";
import { CampaignCalendar, COLOR_CLS, colorOf } from "@/components/marketing-campaigns-ui";
import { getCampaigns, saveCampaign } from "@/lib/marketing-campaigns.functions";

export const Route = createFileRoute("/_authenticated/marketing_/campaigns")({
  head: mkHead("Marketing campaigns", "Plan campaign themes and dates, write and send campaign emails, on a live calendar."),
  component: CampaignsPage,
});

const today = () => new Date().toISOString().slice(0, 10);

function CampaignsPage() {
  const qc = useQueryClient();
  const nav = useNavigate();
  const list = useQuery({ queryKey: ["mk-campaigns", "all"], queryFn: useServerFn(getCampaigns), refetchInterval: 15000, retry: false });
  const save = useServerFn(saveCampaign);
  const [f, setF] = useState({ name: "", theme: "", goal: "", color: "teal", startsOn: today(), endsOn: today() });
  const [busy, setBusy] = useState(false);

  const create = async () => {
    setBusy(true);
    try {
      const r = await save({ data: { ...f, theme: f.theme || null, goal: f.goal || null, notes: null } });
      toast.success("Campaign created.");
      await qc.invalidateQueries({ queryKey: ["mk-campaigns"] });
      nav({ to: "/marketing/campaigns/$id", params: { id: r.id } });
    } catch (e) { toast.error(e instanceof Error ? e.message : "Couldn't save."); } finally { setBusy(false); }
  };

  return (
    <MkPage title="Campaigns" intro="Plan themes and dates, then write and send the emails and posts for each campaign. The calendar updates live.">
      <div className="grid gap-6 lg:grid-cols-[320px_1fr]">
        <div className="space-y-4">
          <Card>
            <CardHeader><CardTitle className="text-base">New campaign</CardTitle></CardHeader>
            <CardContent className="space-y-2">
              <Input placeholder="Name, e.g. Q4 Fund launch" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} />
              <Textarea placeholder="Theme or message" rows={2} value={f.theme} onChange={(e) => setF({ ...f, theme: e.target.value })} />
              <Input placeholder="Goal (optional)" value={f.goal} onChange={(e) => setF({ ...f, goal: e.target.value })} />
              <div className="grid grid-cols-2 gap-2">
                <label className="text-xs text-muted-foreground">Starts<Input type="date" value={f.startsOn} onChange={(e) => setF({ ...f, startsOn: e.target.value })} /></label>
                <label className="text-xs text-muted-foreground">Ends<Input type="date" value={f.endsOn} onChange={(e) => setF({ ...f, endsOn: e.target.value })} /></label>
              </div>
              <div className="flex gap-1.5" role="radiogroup" aria-label="Color">
                {Object.keys(COLOR_CLS).map((c) => (
                  <button key={c} type="button" aria-label={c} aria-checked={f.color === c} role="radio" onClick={() => setF({ ...f, color: c })}
                    className={`h-6 w-6 rounded-full ${COLOR_CLS[c]!.dot} ${f.color === c ? "ring-2 ring-ring ring-offset-2 ring-offset-background" : ""}`} />
                ))}
              </div>
              <Button className="w-full" disabled={busy || !f.name.trim()} onClick={create}>Create campaign</Button>
            </CardContent>
          </Card>
          <div className="space-y-2">
            <h2 className="text-sm font-semibold text-muted-foreground">All campaigns</h2>
            {list.error && <p className="text-sm text-destructive">{(list.error as Error).message}</p>}
            {(list.data ?? []).length === 0 && !list.isLoading && <p className="text-sm text-muted-foreground">No campaigns yet.</p>}
            {(list.data ?? []).map((c: any) => (
              <Link key={c.id} to="/marketing/campaigns/$id" params={{ id: c.id }} className={`block rounded-md border-l-4 border p-3 hover:bg-muted/40 ${colorOf(c.color).band}`}>
                <div className="font-medium">{c.name}</div>
                <div className="text-xs text-muted-foreground">{c.starts_on} → {c.ends_on} · {c.emails} emails · {c.posts} posts</div>
                {c.theme && <div className="mt-1 line-clamp-2 text-xs">{c.theme}</div>}
              </Link>
            ))}
          </div>
        </div>
        <CampaignCalendar onPickDay={(d) => setF((x) => ({ ...x, startsOn: d, endsOn: d > x.endsOn ? d : x.endsOn }))} />
      </div>
    </MkPage>
  );
}
