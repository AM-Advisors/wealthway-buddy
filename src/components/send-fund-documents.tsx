import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Send } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { listSendableDocumentsFn, sendDocumentsFn } from "@/lib/offering-document-send.functions";
import { FOLLOW_UP_LABELS, needsFollowUp, type FollowUpStatus } from "@/lib/document-follow-up-model";

type FollowUpDoc = { id: string; title: string; version: number };
type FollowUpInv = { onboardingId: string; name: string; tracking: { documentId: string; sentAt: string | null; openedAt: string | null; opens: number; status: FollowUpStatus }[] };

function DocumentFollowUp({ documents, investors }: { documents: FollowUpDoc[]; investors: FollowUpInv[] }) {
  const [onlyOpen, setOnlyOpen] = useState(true);
  const tone = (s: FollowUpStatus) => (s === "signed" ? "default" : needsFollowUp(s) ? "destructive" : "outline") as "default" | "destructive" | "outline";
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm font-medium">Who has signed</p>
        <Button variant="ghost" size="sm" onClick={() => setOnlyOpen(!onlyOpen)}>{onlyOpen ? "Show everyone" : "Only unsigned"}</Button>
      </div>
      <p className="text-xs text-muted-foreground">"Opened" means the investor opened the document while signed in. Email opens are not counted, and opening is never treated as signing.</p>
      {documents.map((d) => {
        const rows = investors.map((i) => ({ i, t: i.tracking.find((t) => t.documentId === d.id) })).filter((x) => x.t);
        const signed = rows.filter((x) => x.t!.status === "signed" || x.t!.status === "awaiting_fund").length;
        const opened = rows.filter((x) => x.t!.openedAt).length;
        const shown = onlyOpen ? rows.filter((x) => needsFollowUp(x.t!.status)) : rows;
        return (
          <div key={d.id} className="rounded-md border p-3 text-sm">
            <p className="font-medium">{d.title} <span className="text-muted-foreground">v{d.version}</span></p>
            <p className="text-muted-foreground">{signed} of {rows.length} signed · {opened} opened</p>
            {shown.length ? (
              <ul className="mt-2 space-y-1">
                {shown.map(({ i, t }) => (
                  <li key={i.onboardingId} className="flex flex-wrap items-center justify-between gap-2">
                    <span>{i.name}</span>
                    <span className="flex items-center gap-2 text-xs text-muted-foreground">
                      {t!.openedAt ? `Opened ${new Date(t!.openedAt).toLocaleDateString()}${t!.opens > 1 ? ` (${t!.opens}×)` : ""}` : t!.sentAt ? `Sent ${new Date(t!.sentAt).toLocaleDateString()}` : null}
                      <Badge variant={tone(t!.status)}>{FOLLOW_UP_LABELS[t!.status]}</Badge>
                    </span>
                  </li>
                ))}
              </ul>
            ) : onlyOpen ? <p className="mt-1 text-xs text-muted-foreground">Nobody waiting to sign.</p> : null}
          </div>
        );
      })}
    </div>
  );
}

export function SendFundDocuments({ offeringId }: { offeringId: string }) {
  const list = useServerFn(listSendableDocumentsFn);
  const send = useServerFn(sendDocumentsFn);
  const qc = useQueryClient();
  const key = ["sendable-docs", offeringId];
  const q = useQuery({ queryKey: key, queryFn: () => list({ data: { offeringId } }) });
  const [docs, setDocs] = useState<string[]>([]);
  const [invs, setInvs] = useState<string[]>([]);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);

  const toggle = (arr: string[], set: (v: string[]) => void, id: string) => set(arr.includes(id) ? arr.filter((x) => x !== id) : [...arr, id]);

  async function submit() {
    setBusy(true);
    try {
      const r = await send({ data: { offeringId, documentIds: docs, onboardingIds: invs, note: note || null } });
      const emailed = r.results.filter((x) => x.emailed).length;
      const skipped = r.results.filter((x) => x.skipped);
      toast.success(`Sent to ${r.results.filter((x) => x.documents > 0).length} investor(s); ${emailed} email(s) delivered.`);
      skipped.forEach((s) => toast.message(`${s.name}: ${s.skipped}`));
      setInvs([]); setNote("");
      qc.invalidateQueries({ queryKey: key });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not send those documents.");
    } finally { setBusy(false); }
  }

  const data = q.data;
  const docTitle = new Map((data?.documents ?? []).map((d) => [d.id, d.title]));

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2"><Send className="h-5 w-5" /> Send documents to investors</CardTitle>
        <CardDescription>Send the fund's in-use subscription agreement, operating agreement and offering documents. Each investor gets an email with a sign-in link and sees the documents in their portal.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {q.isLoading ? <p className="text-sm text-muted-foreground">Loading…</p> : q.isError ? (
          <p className="text-sm text-destructive">{(q.error as Error).message}</p>
        ) : !data?.documents.length ? (
          <p className="text-sm text-muted-foreground">No documents are in use for this fund yet. Harmonious approves and puts documents in use during Fund Setup; they'll appear here once ready.</p>
        ) : (
          <>
            <div>
              <p className="mb-2 text-sm font-medium">1. Documents</p>
              <div className="space-y-2">
                {data.documents.map((d) => (
                  <label key={d.id} className="flex items-start gap-3 rounded-md border p-3 text-sm">
                    <Checkbox checked={docs.includes(d.id)} onCheckedChange={() => toggle(docs, setDocs, d.id)} />
                    <span className="flex-1">
                      <span className="font-medium">{d.title}</span>
                      <span className="block text-muted-foreground">{d.category} · v{d.version} · applies to {d.appliesTo.length} investor(s)</span>
                    </span>
                  </label>
                ))}
              </div>
            </div>
            <div>
              <div className="mb-2 flex items-center justify-between">
                <p className="text-sm font-medium">2. Investors</p>
                {data.investors.length ? (
                  <Button variant="ghost" size="sm" onClick={() => setInvs(invs.length === data.investors.length ? [] : data.investors.map((i) => i.onboardingId))}>
                    {invs.length === data.investors.length ? "Clear" : "Select all"}
                  </Button>
                ) : null}
              </div>
              {!data.investors.length ? <p className="text-sm text-muted-foreground">No investors in this fund yet. Add them from the Investors tab.</p> : (
                <div className="max-h-80 space-y-2 overflow-y-auto">
                  {data.investors.map((i) => {
                    const last = i.sent[0];
                    return (
                      <label key={i.onboardingId} className="flex items-start gap-3 rounded-md border p-3 text-sm">
                        <Checkbox checked={invs.includes(i.onboardingId)} onCheckedChange={() => toggle(invs, setInvs, i.onboardingId)} />
                        <span className="flex-1">
                          <span className="font-medium">{i.name}</span>{" "}
                          <Badge variant="outline">{i.signedIn ? "Signed in" : "Not signed in yet"}</Badge>
                          {!i.hasEmail ? <Badge variant="outline" className="ml-1">No email</Badge> : null}
                          <span className="block text-muted-foreground">
                            {last ? `Last sent ${new Date(last.sentAt).toLocaleDateString()} · ${docTitle.get(last.documentId) ?? "document"} v${last.version}` : "Nothing sent yet"}
                          </span>
                        </span>
                      </label>
                    );
                  })}
                </div>
              )}
            </div>
            <DocumentFollowUp documents={data.documents} investors={data.investors} />
            <div>
              <p className="mb-2 text-sm font-medium">3. Note (optional)</p>
              <Textarea value={note} maxLength={1000} onChange={(e) => setNote(e.target.value)} placeholder="Add a short message for investors" />
            </div>
            <Button disabled={busy || !docs.length || !invs.length} onClick={submit}>
              {busy ? "Sending…" : `Send to ${invs.length} investor(s)`}
            </Button>
            <p className="text-xs text-muted-foreground">Investors only receive documents that apply to them. Sending never changes a signed copy.</p>
          </>
        )}
      </CardContent>
    </Card>
  );
}
