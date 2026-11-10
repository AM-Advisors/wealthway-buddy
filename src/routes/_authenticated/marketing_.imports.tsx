import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Switch } from "@/components/ui/switch";
import { MkPage, mkHead } from "@/components/marketing-ui";
import {
  addClickupImport, browseClickup, completeHubspotConnect, disconnectHubspot, getHubspotStatus,
  getImportSources, rerunClickupImport, runHubspotImport, startHubspotConnect, updateClickupImport,
} from "@/lib/marketing-imports.functions";

export const Route = createFileRoute("/_authenticated/marketing_/imports")({
  head: mkHead("Imports", "Bring ClickUp marketing tasks and HubSpot contacts, deals and emails into Harmonious."),
  component: ImportsPage,
});

function waitForPopup(popup: Window) {
  return new Promise<string | null>((resolve, reject) => {
    let poll: number | undefined;
    const cleanup = () => { window.removeEventListener("message", onMsg); if (poll !== undefined) window.clearInterval(poll); };
    const onMsg = (e: MessageEvent) => {
      const t = e.data?.type;
      if (e.origin !== window.location.origin || e.source !== popup || e.data?.connectorId !== "hubspot" || (t !== "appUserConnectorOAuthComplete" && t !== "appUserConnectorOAuthFailed")) return;
      cleanup();
      if (t === "appUserConnectorOAuthComplete") resolve(typeof e.data?.code === "string" ? e.data.code : null);
      else { popup.close(); reject(new Error("HubSpot sign-in failed.")); }
    };
    window.addEventListener("message", onMsg);
    poll = window.setInterval(() => { if (popup.closed) { cleanup(); reject(new Error("The HubSpot window was closed before finishing.")); } }, 500);
  });
}

const PARTS = [
  { id: "marketing_emails", label: "Past marketing emails", hint: "Shown on the calendar as sent, with their results." },
  { id: "contacts", label: "Contacts", hint: "Added to Sales contacts; HubSpot opt-outs stay unsubscribed." },
  { id: "deals", label: "Companies and deals", hint: "Deals go into the pipeline; company names fill in on contacts." },
  { id: "email_history", label: "Email history with contacts", hint: "One-to-one emails logged on each contact." },
] as const;

function HubspotCard() {
  const qc = useQueryClient();
  const status = useQuery({ queryKey: ["hs-status"], queryFn: useServerFn(getHubspotStatus) });
  const start = useServerFn(startHubspotConnect), complete = useServerFn(completeHubspotConnect);
  const disconnect = useServerFn(disconnectHubspot), run = useServerFn(runHubspotImport);
  const [parts, setParts] = useState<string[]>(PARTS.map((p) => p.id));
  const [busy, setBusy] = useState(false);
  const [needsReconnect, setNeedsReconnect] = useState(false);
  const [last, setLast] = useState<any>(null);

  const connect = async () => {
    const popup = window.open("", "lovable-oauth", "width=600,height=720");
    if (!popup) { toast.error("Popup blocked. Allow popups and try again."); return; }
    setBusy(true);
    try {
      const { authorizationUrl } = await start({});
      const done = waitForPopup(popup);
      popup.location.href = authorizationUrl;
      const code = await done;
      if (code) await complete({ data: { code } });
      setNeedsReconnect(false);
      await qc.invalidateQueries({ queryKey: ["hs-status"] });
      toast.success(status.data?.connected ? "Reconnected to HubSpot." : "HubSpot is connected.");
    } catch (e) { popup.close(); toast.error(e instanceof Error ? e.message : "Couldn't connect HubSpot."); }
    finally { setBusy(false); }
  };
  const doImport = async () => {
    setBusy(true);
    try {
      const r: any = await run({ data: { parts: parts as any } });
      if (!r.connected) { setNeedsReconnect(!!r.reconnectRequired); toast.error(r.reconnectRequired ? "Your HubSpot access needs to be renewed." : "Connect HubSpot first."); return; }
      setLast(r.result); toast.success("HubSpot import finished.");
      await qc.invalidateQueries();
    } catch (e) { toast.error(e instanceof Error ? e.message : "Import failed."); }
    finally { setBusy(false); }
  };

  const s = status.data;
  return (
    <Card>
      <CardHeader>
        <CardTitle>HubSpot</CardTitle>
        <CardDescription>Harmonious reads from HubSpot — it never changes anything there. Your Harmonious portal connection covers everyone; each person can also connect their own HubSpot login if they want their own view.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-wrap items-center gap-2">
          {needsReconnect && <p className="w-full text-sm text-destructive">Your HubSpot access needs to be renewed.</p>}
          {s?.connected && <>
            <span className="text-sm font-medium">Connected{s?.shared && !s?.personal ? " via the Harmonious portal connection" : ""}</span>
            {s?.personal && <Button variant="outline" size="sm" disabled={busy} onClick={async () => { await disconnect({}); await qc.invalidateQueries({ queryKey: ["hs-status"] }); toast.success("Your HubSpot connection was removed."); }}>Disconnect mine</Button>}
          </>}
          {!s?.connected && <Button onClick={connect} disabled={busy}>{needsReconnect ? "Reconnect HubSpot" : "Connect HubSpot"}</Button>}
        </div>
        <div className="grid gap-2 sm:grid-cols-2">
          {PARTS.map((p) => (
            <label key={p.id} className="flex items-start gap-2 rounded border p-3 text-sm">
              <Checkbox checked={parts.includes(p.id)} onCheckedChange={(v) => setParts((x) => v ? [...x, p.id] : x.filter((y) => y !== p.id))} />
              <span><span className="font-medium">{p.label}</span><span className="block text-muted-foreground">{p.hint}</span></span>
            </label>
          ))}
        </div>
        <Button onClick={doImport} disabled={busy || !s?.connected || !parts.length}>{busy ? "Importing…" : "Import from HubSpot"}</Button>
        {last && <ResultList r={last} />}
      </CardContent>
    </Card>
  );
}

function ResultList({ r }: { r: Record<string, any> }) {
  return (
    <ul className="space-y-1 text-sm">
      {Object.entries(r).map(([k, v]) => (
        <li key={k}><span className="font-medium capitalize">{k.replace("_", " ")}:</span>{" "}
          {v?.error ? <span className="text-destructive">{v.error}</span> : Object.entries(v ?? {}).map(([a, b]) => `${String(b)} ${a.replace(/_/g, " ")}`).join(", ")}</li>
      ))}
    </ul>
  );
}

function ClickupCard() {
  const qc = useQueryClient();
  const sources = useQuery({ queryKey: ["cu-sources"], queryFn: useServerFn(getImportSources) });
  const browseFn = useServerFn(browseClickup);
  const add = useServerFn(addClickupImport), rerun = useServerFn(rerunClickupImport), update = useServerFn(updateClickupImport);
  const [tree, setTree] = useState<any[] | null>(null);
  const [keep, setKeep] = useState(true);
  const [busy, setBusy] = useState(false);
  const ready = sources.data?.clickupReady;

  const act = async (fn: () => Promise<any>, ok: string) => {
    setBusy(true);
    try { const r = await fn(); toast.success(r?.created !== undefined ? `${ok}: ${r.created} new, ${r.updated} updated, ${r.skipped} skipped.` : ok); await qc.invalidateQueries(); }
    catch (e) { toast.error(e instanceof Error ? e.message : "Something went wrong."); }
    finally { setBusy(false); }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>ClickUp</CardTitle>
        <CardDescription>Tasks land on the calendar as drafts on their due date. Tasks tagged or named "email"/"newsletter" become emails; tags or names with LinkedIn, Facebook or Instagram pick the networks. Drafts still need approval before anything goes out, and items already submitted or approved are never overwritten.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {!ready && <p className="text-sm text-muted-foreground">ClickUp isn't connected yet — a ClickUp API key needs to be added first.</p>}
        {(sources.data?.sources ?? []).length > 0 && (
          <div className="divide-y rounded border">
            {(sources.data!.sources as any[]).map((s) => (
              <div key={s.id} className="flex flex-wrap items-center justify-between gap-2 p-3 text-sm">
                <div><div className="font-medium">{s.name} <span className="text-muted-foreground">({s.kind === "space" ? "whole space" : "list"})</span></div>
                  <div className="text-muted-foreground">{s.last_synced_at ? `Last imported ${new Date(s.last_synced_at).toLocaleString()}` : "Not imported yet"}</div></div>
                <div className="flex items-center gap-2">
                  <label className="flex items-center gap-1 text-xs"><Switch checked={s.keep_syncing} onCheckedChange={(v) => act(() => update({ data: { id: s.id, keepSyncing: v } }), v ? "Will keep syncing hourly" : "Sync turned off")} />Keep syncing</label>
                  <Button size="sm" variant="outline" disabled={busy || !ready} onClick={() => act(() => rerun({ data: { id: s.id } }), "Imported")}>Import now</Button>
                  <Button size="sm" variant="ghost" disabled={busy} onClick={() => act(() => update({ data: { id: s.id, remove: true } }), "Removed (imported drafts stay)")}>Remove</Button>
                </div>
              </div>
            ))}
          </div>
        )}
        <div className="flex flex-wrap items-center gap-3">
          <Button variant="outline" disabled={busy || !ready} onClick={() => act(async () => setTree(await browseFn()), "Loaded your ClickUp spaces")}>Choose from ClickUp</Button>
          <label className="flex items-center gap-2 text-sm"><Switch checked={keep} onCheckedChange={setKeep} />Keep syncing new tasks</label>
        </div>
        {tree && tree.map((t) => (
          <div key={t.team} className="space-y-2">
            <div className="text-sm font-semibold">{t.team}</div>
            {t.spaces.map((sp: any) => (
              <div key={sp.id} className="rounded border p-3">
                <div className="flex items-center justify-between gap-2">
                  <span className="font-medium">{sp.name}</span>
                  <Button size="sm" disabled={busy} onClick={() => act(() => add({ data: { kind: "space", refId: sp.id, name: sp.name, keepSyncing: keep } }), "Imported space")}>Import whole space</Button>
                </div>
                <div className="mt-2 flex flex-wrap gap-1">
                  {sp.lists.map((l: any) => <Button key={l.id} size="sm" variant="outline" disabled={busy} onClick={() => act(() => add({ data: { kind: "list", refId: l.id, name: `${sp.name} / ${l.name}`, keepSyncing: keep } }), "Imported list")}>{l.name}</Button>)}
                </div>
              </div>
            ))}
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

function ImportsPage() {
  return (
    <MkPage title="Imports" intro="Bring your existing ClickUp marketing plan and HubSpot history into Harmonious.">
      <ClickupCard />
      <HubspotCard />
    </MkPage>
  );
}
