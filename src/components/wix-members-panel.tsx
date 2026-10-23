import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { reviewWixMemberFn, importWixMembersFn, listWixMembersFn, listWixSitesFn, testWixFn } from "@/lib/wix-members.functions";

/** Wix member area: pick site, test, import (read-only), review matches. */
export function WixMembersPanel() {
  const qc = useQueryClient();
  const sites = useQuery({ queryKey: ["wix-sites"], queryFn: useServerFn(listWixSitesFn), retry: false });
  const members = useQuery({ queryKey: ["wix-members"], queryFn: useServerFn(listWixMembersFn), retry: false });
  const test = useServerFn(testWixFn), run = useServerFn(importWixMembersFn), review = useServerFn(reviewWixMemberFn);
  const [rowBusy, setRowBusy] = useState<string | null>(null);
  const doReview = async (id: string, action: "link" | "create") => { setRowBusy(id); try { await review({ data: { wixMemberId: id, action } }); toast.success(action === "link" ? "Linked to the existing person." : "Person created."); await qc.invalidateQueries({ queryKey: ["wix-members"] }); } catch (e) { toast.error(e instanceof Error ? e.message : "Something went wrong."); } finally { setRowBusy(null); } };
  const [site, setSite] = useState("");
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [show, setShow] = useState<"all" | "matched" | "new">("all");
  const siteId = site || sites.data?.find((s) => s.published && s.name === "Harmonious")?.id || "";
  const rows = useMemo(() => (members.data ?? []).filter((m: any) => (show === "all" || (show === "matched") === !!m.matched_person_id) && `${m.first_name ?? ""} ${m.last_name ?? ""} ${m.email ?? ""}`.toLowerCase().includes(search.toLowerCase())), [members.data, search, show]);
  const act = async (fn: () => Promise<string>) => { setBusy(true); try { const m = await fn(); setStatus(m); toast.success(m); } catch (e) { const m = e instanceof Error ? e.message : "Something went wrong."; setStatus(m); toast.error(m); } finally { setBusy(false); } };

  return (
    <section className="space-y-4">
      <div className="rounded-lg border p-4">
        <h2 className="text-lg">Wix member area</h2>
        <p className="text-sm text-muted-foreground">Reads names, emails and phones from your Wix members. Nothing in Wix is changed, and no one is added to Harmonious until you approve.</p>
        {sites.error && <p className="mt-2 text-sm text-destructive">{(sites.error as Error).message}</p>}
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <select className="h-9 rounded-md border bg-background px-2 text-sm" value={siteId} onChange={(e) => setSite(e.target.value)}>
            <option value="">Choose site…</option>
            {(sites.data ?? []).map((s) => <option key={s.id} value={s.id}>{s.name}{s.url ? ` — ${s.url}` : ""}</option>)}
          </select>
          <Button variant="outline" disabled={busy || !siteId} onClick={() => act(async () => { const r = await test({ data: { siteId } }); return `Connected. ${r.members} members found.`; })}>Test connection</Button>
          <Button disabled={busy || !siteId} onClick={() => act(async () => { const r = await run({ data: { siteId } }); await qc.invalidateQueries({ queryKey: ["wix-members"] }); return `Imported ${r.total} members: ${r.matched} match existing people, ${r.withPhone} have a phone.`; })}>{busy ? "Working…" : "Import members"}</Button>
        </div>
        {status && <p className="mt-2 text-sm">{status}</p>}
      </div>
      <div className="rounded-lg border">
        <div className="flex flex-wrap items-center gap-2 border-b p-3">
          <h3 className="mr-auto font-medium">Imported members ({rows.length})</h3>
          {(["all", "matched", "new"] as const).map((k) => <Button key={k} size="sm" variant={show === k ? "default" : "outline"} onClick={() => setShow(k)}>{k === "all" ? "All" : k === "matched" ? "Matches a person" : "Not in Harmonious"}</Button>)}
          <Input className="max-w-xs" placeholder="Search" value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-left text-muted-foreground"><tr><th className="p-2">Name</th><th className="p-2">Email</th><th className="p-2">Phone</th><th className="p-2">Wix status</th><th className="p-2">Harmonious</th><th className="p-2"></th></tr></thead>
            <tbody>{rows.slice(0, 500).map((m: any) => (
              <tr key={m.wix_member_id} className="border-t">
                <td className="p-2">{[m.first_name, m.last_name].filter(Boolean).join(" ") || "—"}</td>
                <td className="p-2">{m.email || "—"}</td>
                <td className="p-2">{m.phone || "—"}</td>
                <td className="p-2 capitalize">{String(m.wix_status ?? "—").toLowerCase()}</td>
                <td className="p-2">{m.matched_person_id ? <Badge variant="secondary">Matches a person</Badge> : <Badge variant="outline">Not in Harmonious</Badge>}</td>
                <td className="p-2 text-right">{m.linked_person_id ? <Badge>{m.review_action === "created" ? "Created" : "Linked"}</Badge> : m.matched_person_id ? <Button size="sm" variant="outline" disabled={rowBusy === m.wix_member_id} onClick={() => doReview(m.wix_member_id, "link")}>Link</Button> : <Button size="sm" variant="outline" disabled={rowBusy === m.wix_member_id || (!m.email && !m.first_name)} onClick={() => { if (window.confirm(`Create a Harmonious person for ${[m.first_name, m.last_name].filter(Boolean).join(" ") || m.email}?`)) doReview(m.wix_member_id, "create"); }}>Create person</Button>}</td>
              </tr>))}
            </tbody>
          </table>
          {!rows.length && <p className="p-3 text-sm text-muted-foreground">No members imported yet.</p>}
        </div>
      </div>
    </section>
  );
}
