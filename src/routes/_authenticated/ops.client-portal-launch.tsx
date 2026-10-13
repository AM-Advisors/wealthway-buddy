import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { REASON_LABELS } from "@/lib/portal-documents";
import {
  changeDocumentEntitlement, discoverSourceFolders, freezeDocumentAccess, getPortalLaunchOverview, liftDocumentFreeze,
  publishMatchedDocuments, resolveDocumentReview, runDocumentSourceSync, setDocumentSourceApproval,
} from "@/lib/portal-documents.functions";

export const Route = createFileRoute("/_authenticated/ops/client-portal-launch")({
  head: () => ({
    meta: [
      { title: "Client Portal Launch - Harmonious Operations" },
      { name: "description", content: "Document sources, K-1 matching, access approvals, sync health, emergency freeze and audit history for the investor portal." },
      { property: "og:title", content: "Client Portal Launch - Harmonious Operations" },
      { property: "og:description", content: "Launch readiness for investor and fund manager K-1 access." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: Page,
});

const when = (v?: string | null) => (v ? new Date(v).toLocaleString("en-US", { dateStyle: "medium", timeStyle: "short" }) : "—");
const err = (e: any) => toast.error(String(e?.message ?? "Failed").replace(/^Forbidden:\s*/, ""));

function Page() {
  const qc = useQueryClient();
  const load = useServerFn(getPortalLaunchOverview);
  const q = useQuery({ queryKey: ["portal-launch"], queryFn: () => load() as Promise<any> });
  const refresh = () => qc.invalidateQueries({ queryKey: ["portal-launch"] });
  const d = q.data as any;
  if (q.isLoading) return <div className="p-6 text-sm text-muted-foreground">Loading…</div>;
  if (q.isError || !d) return <div className="p-6 text-sm text-destructive">{String((q.error as any)?.message ?? "Not available").replace(/^Forbidden:\s*/, "")}</div>;

  const catalog = d.catalog as any[];
  const openReviews = (d.reviews as any[]).filter((r) => r.review_status === "open");
  const activeFreezes = (d.freezes as any[]).filter((f) => !f.lifted_at);
  const stat = (label: string, value: number) => (
    <Card><CardContent className="p-4"><p className="text-xs text-muted-foreground">{label}</p><p className="text-2xl font-semibold">{value}</p></CardContent></Card>
  );

  return (
    <div className="mx-auto w-full max-w-6xl space-y-6 p-6">
      <div>
        <h1 className="font-heading text-2xl font-semibold">Client Portal Launch</h1>
        <p className="text-sm text-muted-foreground">Test environment: only synthetic sources and fictional K-1s. Live Box and Google Drive folders need separate approval.</p>
      </div>
      {activeFreezes.length > 0 && (
        <div className="rounded-md border border-destructive p-3 text-sm text-destructive">Emergency access freeze active ({activeFreezes.length}). Affected documents cannot be opened.</div>
      )}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {stat("Published K-1s", catalog.filter((c) => c.status === "published").length)}
        {stat("Matched, awaiting publish", catalog.filter((c) => c.status === "matched").length)}
        {stat("Matching exceptions", openReviews.length)}
        {stat("Investors ready to invite", (d.readiness as any[]).filter((r) => r.published > 0).length)}
      </div>
      <Tabs defaultValue="sources">
        <TabsList className="flex h-auto flex-wrap">
          {["sources", "documents", "exceptions", "access", "readiness", "sync", "freeze", "audit"].map((t) => (
            <TabsTrigger key={t} value={t} className="capitalize">{{ sources: "Sources & discovery", documents: "Documents", exceptions: "Matching exceptions", access: "Access approvals", readiness: "Invitation readiness", sync: "Sync health", freeze: "Emergency revoke", audit: "Audit log" }[t]}</TabsTrigger>
          ))}
        </TabsList>
        <TabsContent value="sources"><Sources d={d} refresh={refresh} /></TabsContent>
        <TabsContent value="documents"><Documents catalog={catalog} refresh={refresh} /></TabsContent>
        <TabsContent value="exceptions"><Exceptions d={d} refresh={refresh} /></TabsContent>
        <TabsContent value="access"><Access d={d} refresh={refresh} /></TabsContent>
        <TabsContent value="readiness"><Readiness d={d} /></TabsContent>
        <TabsContent value="sync"><Sync d={d} /></TabsContent>
        <TabsContent value="freeze"><Freeze d={d} refresh={refresh} /></TabsContent>
        <TabsContent value="audit"><Audit d={d} /></TabsContent>
      </Tabs>
    </div>
  );
}

function Sources({ d, refresh }: { d: any; refresh: () => void }) {
  const approve = useServerFn(setDocumentSourceApproval);
  const sync = useServerFn(runDocumentSourceSync);
  const discover = useServerFn(discoverSourceFolders);
  const [browse, setBrowse] = useState<Record<string, any>>({});
  return (
    <div className="space-y-3">
      {(d.sources as any[]).map((s) => (
        <Card key={s.id}>
          <CardHeader>
            <CardTitle className="flex flex-wrap items-center gap-2 text-base">{s.label}<Badge variant="outline">{s.provider === "box" ? "Box" : "Google Drive"}</Badge><Badge variant={s.status === "approved" ? "default" : "secondary"}>{s.status.replace("_", " ")}</Badge>{s.is_test_demo && <Badge variant="destructive">TEST</Badge>}</CardTitle>
            <CardDescription>Read-only · historical documents only · {s.allowed_root_ids.length} approved root folder(s) · {s.folder_mappings.length} folder mapping(s) · last scan {when(s.last_sync_at)}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex flex-wrap gap-2">
              {s.status !== "approved" ? (
                <Button size="sm" onClick={() => approve({ data: { sourceId: s.id, approve: true } }).then(refresh).catch(err)}>Approve source</Button>
              ) : (
                <Button size="sm" variant="outline" onClick={() => approve({ data: { sourceId: s.id, approve: false } }).then(refresh).catch(err)}>Suspend</Button>
              )}
              <Button size="sm" variant="outline" disabled={s.status !== "approved"} onClick={() => sync({ data: { sourceId: s.id } }).then((r: any) => { toast.success(`Scan: ${r.discovered} new, ${r.updated} seen, ${r.missing} missing, ${r.errors} errors`); refresh(); }).catch(err)}>Run metadata scan</Button>
              <Button size="sm" variant="ghost" onClick={() => discover({ data: { sourceId: s.id, folderId: null } }).then((r: any) => setBrowse((b) => ({ ...b, [s.id]: r }))).catch(err)}>Browse folders</Button>
            </div>
            {browse[s.id] && (
              <div className="rounded-md border p-3 text-sm">
                {!browse[s.id].ok ? <p className="text-muted-foreground">{browse[s.id].message}</p> : (
                  <>
                    <p className="mb-2 text-xs text-muted-foreground">Folder {browse[s.id].folderId}</p>
                    <ul className="space-y-1">
                      {browse[s.id].items.map((i: any) => (
                        <li key={i.id} className="flex items-center gap-2">
                          {i.kind === "folder" ? (
                            <button className="underline" onClick={() => discover({ data: { sourceId: s.id, folderId: i.id } }).then((r: any) => setBrowse((b) => ({ ...b, [s.id]: r }))).catch(err)}>📁 {i.name}</button>
                          ) : <span>📄 {i.name}</span>}
                          {s.folder_mappings.some((m: any) => m.folder_id === i.id) && <Badge variant="outline">mapped</Badge>}
                        </li>
                      ))}
                    </ul>
                  </>
                )}
              </div>
            )}
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

function Documents({ catalog, refresh }: { catalog: any[]; refresh: () => void }) {
  const publish = useServerFn(publishMatchedDocuments);
  const matched = catalog.filter((c) => c.status === "matched");
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-2">
        <CardTitle className="text-base">Catalog ({catalog.length})</CardTitle>
        <Button size="sm" disabled={!matched.length} onClick={() => publish({ data: { documentIds: matched.map((m) => m.id), reason: "Matched by approved folder mapping; published for test" } }).then((r: any) => { toast.success(`${r.published} published`); refresh(); }).catch(err)}>Publish {matched.length} matched</Button>
      </CardHeader>
      <CardContent className="overflow-x-auto">
        <Table>
          <TableHeader><TableRow><TableHead>File</TableHead><TableHead>Year</TableHead><TableHead>Fund</TableHead><TableHead>Recipient</TableHead><TableHead>Status</TableHead></TableRow></TableHeader>
          <TableBody>
            {catalog.map((c) => (
              <TableRow key={c.id}>
                <TableCell className="text-xs">{c.file_name}</TableCell>
                <TableCell>{c.tax_year ?? "—"}</TableCell>
                <TableCell className="text-xs">{c.offerings?.name ?? "—"}</TableCell>
                <TableCell className="text-xs">{c.investment_profiles?.legal_name ?? "—"}</TableCell>
                <TableCell><Badge variant={c.status === "published" ? "default" : "secondary"}>{c.status}</Badge><p className="text-xs text-muted-foreground">{REASON_LABELS[c.status_reason] ?? c.status_reason}</p></TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}

function Exceptions({ d, refresh }: { d: any; refresh: () => void }) {
  const resolve = useServerFn(resolveDocumentReview);
  const [pick, setPick] = useState<Record<string, string>>({});
  const docs = Object.fromEntries((d.catalog as any[]).map((c) => [c.id, c]));
  const investorsFor = (offeringId: string) => (d.readiness as any[]).filter((r) => r.offeringId === offeringId);
  const open = (d.reviews as any[]).filter((r) => r.review_status === "open");
  return (
    <div className="space-y-3">
      {open.length === 0 && <p className="text-sm text-muted-foreground">No open exceptions.</p>}
      {open.map((r) => {
        const doc = docs[r.document_id];
        const options = doc?.offering_id ? investorsFor(doc.offering_id) : [];
        const chosen = pick[r.id] ?? r.candidate_profile_id ?? "";
        return (
          <Card key={r.id}>
            <CardContent className="space-y-2 p-4 text-sm">
              <p className="font-medium">{doc?.file_name}</p>
              <p className="text-muted-foreground">{REASON_LABELS[r.reason] ?? r.reason} · fund {doc?.offerings?.name ?? "unknown"}{r.investment_profiles?.legal_name ? ` · suggestion only: ${r.investment_profiles.legal_name}` : ""}</p>
              <div className="flex flex-wrap items-center gap-2">
                {options.length > 0 && r.reason !== "duplicate_checksum" && (
                  <Select value={chosen} onValueChange={(v) => setPick((p) => ({ ...p, [r.id]: v }))}>
                    <SelectTrigger className="w-64"><SelectValue placeholder="Verified recipient" /></SelectTrigger>
                    <SelectContent>{options.map((o: any) => <SelectItem key={o.profileId} value={o.profileId}>{o.name}</SelectItem>)}</SelectContent>
                  </Select>
                )}
                <Button size="sm" disabled={!chosen || r.reason === "duplicate_checksum"} onClick={() => resolve({ data: { reviewId: r.id, approve: true, profileId: chosen, note: "Recipient verified against fund records" } }).then(refresh).catch(err)}>Approve & publish</Button>
                <Button size="sm" variant="outline" onClick={() => resolve({ data: { reviewId: r.id, approve: false, note: "Rejected in review" } }).then(refresh).catch(err)}>Reject</Button>
              </div>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}

function Access({ d, refresh }: { d: any; refresh: () => void }) {
  const change = useServerFn(changeDocumentEntitlement);
  const [docId, setDocId] = useState("");
  const [userId, setUserId] = useState("");
  const published = (d.catalog as any[]).filter((c) => c.status === "published");
  return (
    <div className="space-y-4">
      <Card>
        <CardHeader><CardTitle className="text-base">Share one document with a specific person</CardTitle><CardDescription>For example, a fund manager who needs one investor's K-1. Fund manager status alone never grants this.</CardDescription></CardHeader>
        <CardContent className="flex flex-wrap gap-2">
          <Select value={docId} onValueChange={setDocId}><SelectTrigger className="w-72"><SelectValue placeholder="Published document" /></SelectTrigger><SelectContent>{published.map((p) => <SelectItem key={p.id} value={p.id}>{p.file_name}</SelectItem>)}</SelectContent></Select>
          <Input className="w-80" placeholder="Person's account ID" value={userId} onChange={(e) => setUserId(e.target.value.trim())} />
          <Button size="sm" disabled={!docId || !userId} onClick={() => change({ data: { documentId: docId, principalType: "user", principalId: userId, action: "grant", reason: "Approved individual access" } }).then(refresh).catch(err)}>Grant</Button>
        </CardContent>
      </Card>
      <Card>
        <CardHeader><CardTitle className="text-base">Entitlement history</CardTitle></CardHeader>
        <CardContent className="overflow-x-auto">
          <Table>
            <TableHeader><TableRow><TableHead>When</TableHead><TableHead>Document</TableHead><TableHead>To</TableHead><TableHead>Action</TableHead><TableHead /></TableRow></TableHeader>
            <TableBody>
              {(d.entitlements as any[]).map((e) => (
                <TableRow key={e.id}>
                  <TableCell className="text-xs">{when(e.created_at)}</TableCell>
                  <TableCell className="text-xs">{(d.catalog as any[]).find((c) => c.id === e.document_id)?.file_name}</TableCell>
                  <TableCell className="text-xs">{e.principal_type === "user" ? "Person" : "Investment profile"} {e.principal_id.slice(0, 8)}</TableCell>
                  <TableCell><Badge variant={e.action === "grant" ? "default" : "destructive"}>{e.action}</Badge></TableCell>
                  <TableCell>{e.action === "grant" && <Button size="sm" variant="ghost" onClick={() => change({ data: { documentId: e.document_id, principalType: e.principal_type, principalId: e.principal_id, action: "revoke", reason: "Revoked by administrator" } }).then(refresh).catch(err)}>Revoke</Button>}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}

function Readiness({ d }: { d: any }) {
  return (
    <Card>
      <CardHeader><CardTitle className="text-base">Invitation readiness</CardTitle><CardDescription>No invitations are sent from here in the test phase.</CardDescription></CardHeader>
      <CardContent className="overflow-x-auto">
        <Table>
          <TableHeader><TableRow><TableHead>Investor</TableHead><TableHead>Has login</TableHead><TableHead>Published K-1s</TableHead><TableHead>Pending</TableHead><TableHead>Ready</TableHead></TableRow></TableHeader>
          <TableBody>
            {(d.readiness as any[]).map((r) => (
              <TableRow key={`${r.offeringId}:${r.profileId}`}>
                <TableCell>{r.name}</TableCell><TableCell>{r.hasLogin ? "Yes" : "No"}</TableCell><TableCell>{r.published}</TableCell><TableCell>{r.pending}</TableCell>
                <TableCell><Badge variant={r.published > 0 && r.pending === 0 ? "default" : "outline"}>{r.published > 0 && r.pending === 0 ? "Ready" : "Not yet"}</Badge></TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}

function Sync({ d }: { d: any }) {
  return (
    <Card><CardContent className="overflow-x-auto p-4">
      <Table>
        <TableHeader><TableRow><TableHead>Started</TableHead><TableHead>Source</TableHead><TableHead>Status</TableHead><TableHead>New</TableHead><TableHead>Seen</TableHead><TableHead>Missing</TableHead><TableHead>Errors</TableHead></TableRow></TableHeader>
        <TableBody>
          {(d.runs as any[]).map((r) => (
            <TableRow key={r.id}>
              <TableCell className="text-xs">{when(r.started_at)}</TableCell>
              <TableCell className="text-xs">{(d.sources as any[]).find((s) => s.id === r.source_id)?.label}</TableCell>
              <TableCell><Badge variant={r.status === "succeeded" ? "default" : "destructive"}>{r.status}</Badge>{r.error_detail && <p className="text-xs">{r.error_detail}</p>}</TableCell>
              <TableCell>{r.discovered_count}</TableCell><TableCell>{r.updated_count}</TableCell><TableCell>{r.missing_count}</TableCell><TableCell>{r.error_count}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </CardContent></Card>
  );
}

function Freeze({ d, refresh }: { d: any; refresh: () => void }) {
  const freeze = useServerFn(freezeDocumentAccess);
  const lift = useServerFn(liftDocumentFreeze);
  const [scope, setScope] = useState<string>("all");
  const [scopeId, setScopeId] = useState("");
  const [reason, setReason] = useState("");
  return (
    <div className="space-y-4">
      <Card>
        <CardHeader><CardTitle className="text-base">Emergency revoke</CardTitle><CardDescription>Takes effect on the next request. Applies to everyone, including Harmonious staff.</CardDescription></CardHeader>
        <CardContent className="flex flex-wrap gap-2">
          <Select value={scope} onValueChange={setScope}><SelectTrigger className="w-48"><SelectValue /></SelectTrigger><SelectContent>{["all", "offering", "investment_profile", "user", "document"].map((s) => <SelectItem key={s} value={s}>{{ all: "All documents", offering: "One fund", investment_profile: "One investor profile", user: "One person", document: "One document" }[s]}</SelectItem>)}</SelectContent></Select>
          {scope !== "all" && <Input className="w-80" placeholder="ID" value={scopeId} onChange={(e) => setScopeId(e.target.value.trim())} />}
          <Input className="w-80" placeholder="Reason (required)" value={reason} onChange={(e) => setReason(e.target.value)} />
          <Button variant="destructive" size="sm" disabled={reason.trim().length < 3 || (scope !== "all" && !scopeId)} onClick={() => freeze({ data: { scope: scope as any, scopeId: scope === "all" ? null : scopeId, reason } }).then(() => { setReason(""); refresh(); }).catch(err)}>Freeze access</Button>
        </CardContent>
      </Card>
      {(d.freezes as any[]).map((f) => (
        <div key={f.id} className="flex flex-wrap items-center justify-between gap-2 rounded-md border p-3 text-sm">
          <span>{f.scope}{f.scope_id ? ` ${f.scope_id.slice(0, 8)}` : ""} · {f.reason} · {when(f.created_at)}{f.lifted_at ? ` · lifted ${when(f.lifted_at)}` : ""}</span>
          {!f.lifted_at && <Button size="sm" variant="outline" onClick={() => lift({ data: { freezeId: f.id, reason: "Lifted by administrator" } }).then(refresh).catch(err)}>Lift</Button>}
        </div>
      ))}
    </div>
  );
}

function Audit({ d }: { d: any }) {
  return (
    <Card><CardContent className="overflow-x-auto p-4">
      <Table>
        <TableHeader><TableRow><TableHead>When</TableHead><TableHead>Person</TableHead><TableHead>Action</TableHead><TableHead>Decision</TableHead><TableHead>Reason</TableHead></TableRow></TableHeader>
        <TableBody>
          {(d.events as any[]).map((e) => (
            <TableRow key={e.id}>
              <TableCell className="text-xs">{when(e.created_at)}</TableCell>
              <TableCell className="text-xs">{e.actor_user_id?.slice(0, 8) ?? "—"}</TableCell>
              <TableCell className="text-xs">{e.action}</TableCell>
              <TableCell><Badge variant={e.decision === "allow" ? "default" : "destructive"}>{e.decision}</Badge></TableCell>
              <TableCell className="text-xs">{e.reason_code}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </CardContent></Card>
  );
}
