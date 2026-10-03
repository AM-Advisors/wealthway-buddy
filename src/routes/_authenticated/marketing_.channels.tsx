import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Panel } from "@/components/sales/sales-ui";
import { MkPage, mkHead } from "@/components/marketing-ui";
import { getMarketingChannels, setMarketingChannel } from "@/lib/marketing.functions";

export const Route = createFileRoute("/_authenticated/marketing_/channels")({
  head: mkHead("Social channels", "Connect the Harmonious LinkedIn page, Facebook page and Instagram business account."),
  component: Channels,
});

function Channels() {
  const load = useServerFn(getMarketingChannels);
  const q = useQuery({ queryKey: ["mk-channels"], queryFn: () => load(), retry: false });
  return (
    <MkPage title="Channels" intro="Company pages that approved posts publish to.">
      {q.isLoading && <p className="text-sm text-muted-foreground">Loading…</p>}
      {q.error && <p className="text-sm text-destructive">{(q.error as Error).message}</p>}
      <div className="grid gap-4 md:grid-cols-3">{(q.data?.channels ?? []).map((c: any) => <ChannelCard key={c.channel} c={c} canEdit={!!q.data?.canEdit} />)}</div>
    </MkPage>
  );
}

function ChannelCard({ c, canEdit }: { c: any; canEdit: boolean }) {
  const qc = useQueryClient();
  const save = useServerFn(setMarketingChannel);
  const [ref, setRef] = useState(c.accountRef ?? "");
  const [label, setLabel] = useState(c.displayName ?? "");
  const m = useMutation({
    mutationFn: () => save({ data: { channel: c.channel, accountRef: ref, displayName: label || null } }),
    onSuccess: () => { toast.success("Saved"); qc.invalidateQueries({ queryKey: ["mk-channels"] }); },
    onError: (e) => toast.error((e as Error).message),
  });
  return (
    <Panel title={c.label} action={<Badge variant={c.ready ? "default" : "secondary"}>{c.ready ? "Connected" : "Not connected"}</Badge>}>
      <p className="mb-3 text-xs text-muted-foreground">
        {c.credential ? "Account access is set up." : c.channel === "linkedin" ? "LinkedIn access hasn't been connected yet." : "Meta (Facebook/Instagram) access token hasn't been added yet."}
      </p>
      <label className="text-xs font-medium">{c.refHint}</label>
      <Input value={ref} onChange={(e) => setRef(e.target.value)} disabled={!canEdit} className="mb-2" />
      <label className="text-xs font-medium">Display name</label>
      <Input value={label} onChange={(e) => setLabel(e.target.value)} disabled={!canEdit} placeholder="Harmonious" className="mb-3" />
      {canEdit ? <Button size="sm" onClick={() => m.mutate()} disabled={m.isPending || !ref.trim()}>Save</Button> : <p className="text-xs text-muted-foreground">Only a Marketing Manager can change this.</p>}
    </Panel>
  );
}
