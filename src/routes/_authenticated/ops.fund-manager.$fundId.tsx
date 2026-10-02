import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { z } from "zod";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { fundManagerProfileFn, messageFundManagerFn } from "@/lib/fund-manager-profile.functions";

export const Route = createFileRoute("/_authenticated/ops/fund-manager/$fundId")({
  validateSearch: (s: Record<string, unknown>) => z.object({ who: z.string().max(80).optional() }).parse({ who: typeof s["who"] === "string" ? s["who"] : undefined }),
  head: () => ({
    meta: [
      { title: "Fund manager - Harmonious operations" },
      { name: "description", content: "A fund manager's details, assigned funds and inbox, even before they sign in." },
      { property: "og:title", content: "Fund manager - Harmonious operations" },
      { property: "og:description", content: "Details, funds and messages for one fund manager." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: FundManagerPage,
});

const SOURCE: Record<string, string> = { signed_in: "Assigned manager", fund_team: "Fund team (Manager / GP)", client_contact: "Client contact" };
const fmt = (s: string) => new Date(s).toLocaleString("en-US", { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" });

function FundManagerPage() {
  const { fundId } = Route.useParams();
  const { who } = Route.useSearch();
  const navigate = useNavigate();
  const load = useServerFn(fundManagerProfileFn);
  const q = useQuery({ queryKey: ["fund-manager-profile", fundId, who ?? null], queryFn: () => load({ data: { fundId, key: who ?? null } }) });

  if (q.isLoading) return <div className="p-6 text-sm text-muted-foreground">Loading…</div>;
  if (q.error) return <div className="p-6 text-sm text-destructive">{(q.error as Error).message}</div>;
  const d = q.data!;
  const m = d.manager;

  return (
    <div className="mx-auto max-w-5xl space-y-6 p-4 md:p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-sm text-muted-foreground"><Link to="/ops/fund/$fundId" params={{ fundId }} search={{ tab: undefined }} className="hover:underline">{d.fund.name}</Link>{d.fund.clientName ? ` · ${d.fund.clientName}` : ""}</p>
          <h1 className="text-2xl font-semibold">{m ? m.name : "No fund manager assigned"}</h1>
        </div>
        {d.candidates.length > 1 && (
          <Select value={m?.key ?? ""} onValueChange={(v) => navigate({ to: "/ops/fund-manager/$fundId", params: { fundId }, search: { who: v } })}>
            <SelectTrigger className="w-64"><SelectValue placeholder="Choose a person" /></SelectTrigger>
            <SelectContent>{d.candidates.map((c) => <SelectItem key={c.key} value={c.key}>{c.name}</SelectItem>)}</SelectContent>
          </Select>
        )}
      </div>

      {!m ? (
        <Card><CardContent className="py-6 text-sm text-muted-foreground">
          This fund has no assigned manager, no Manager / GP on its Team tab and no client contacts yet. Add a Manager / GP on the fund's Team tab or a contact on the client record, and they'll appear here.
        </CardContent></Card>
      ) : (
        <>
          <Card>
            <CardHeader>
              <CardTitle className="flex flex-wrap items-center gap-2 text-base">Details
                <Badge variant={m.signedIn ? "default" : "secondary"}>{m.signedIn ? "Has signed in" : "Has not signed in yet"}</Badge>
              </CardTitle>
              <CardDescription>From: {SOURCE[m.source]}</CardDescription>
            </CardHeader>
            <CardContent className="grid gap-3 text-sm sm:grid-cols-2">
              <Field label="Name" value={m.name} />
              <Field label="Role" value={m.title} />
              <Field label="Email" value={m.email} />
              <Field label="Phone" value={m.phone} />
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle className="text-base">Assigned funds</CardTitle></CardHeader>
            <CardContent className="divide-y text-sm">
              {d.funds.map((f) => (
                <div key={f.id} className="flex items-center justify-between py-2">
                  <Link to="/ops/fund/$fundId" params={{ fundId: f.id }} search={{ tab: undefined }} className="font-medium hover:underline">{f.name}</Link>
                  <span className="text-muted-foreground">{f.status ?? "-"}</span>
                </div>
              ))}
            </CardContent>
          </Card>

          <InboxCard fundId={fundId} who={m.key} email={m.email} signedIn={m.signedIn} threads={d.threads} />
        </>
      )}
    </div>
  );
}

function Field({ label, value }: { label: string; value: string | null }) {
  return <div><p className="text-xs text-muted-foreground">{label}</p><p>{value || "Not on file"}</p></div>;
}

function InboxCard({ fundId, who, email, signedIn, threads }: { fundId: string; who: string; email: string | null; signedIn: boolean; threads: any[] }) {
  const qc = useQueryClient();
  const send = useServerFn(messageFundManagerFn);
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [open, setOpen] = useState<string | null>(null);
  const m = useMutation({
    mutationFn: () => send({ data: { fundId, key: who, subject, body } }),
    onSuccess: () => { toast.success("Message saved to their Inbox"); setSubject(""); setBody(""); qc.invalidateQueries({ queryKey: ["fund-manager-profile", fundId] }); },
    onError: (e: Error) => toast.error(e.message),
  });
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Inbox</CardTitle>
        <CardDescription>
          Conversations this person started and messages Harmonious sent them. {signedIn ? "" : "They'll see Harmonious messages in their Inbox when they sign in with this email."} No email alert is sent.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {!threads.length ? <p className="text-sm text-muted-foreground">No conversations yet.</p> : (
          <div className="divide-y rounded-lg border">
            {threads.map((t) => (
              <div key={t.id} className="p-3 text-sm">
                <button type="button" className="flex w-full items-center justify-between text-left" onClick={() => setOpen(open === t.id ? null : t.id)}>
                  <span className="font-medium">{t.subject}</span>
                  <span className="text-xs text-muted-foreground">{t.startedBy} · {fmt(t.lastMessageAt)}</span>
                </button>
                {open === t.id && (
                  <div className="mt-3 space-y-2">
                    {t.messages.map((x: any, i: number) => (
                      <div key={i} className={x.side === "harmonious" ? "rounded-md bg-muted p-2" : "rounded-md border p-2"}>
                        <p className="text-xs text-muted-foreground">{x.side === "harmonious" ? `Harmonious${x.sender ? ` (${x.sender})` : ""}` : x.sender || "Fund manager"} · {fmt(x.at)}</p>
                        <p className="whitespace-pre-wrap">{x.body}</p>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
        <div className="space-y-2 rounded-lg border p-3">
          <p className="text-sm font-medium">New message from Harmonious Operations</p>
          {!email ? <p className="text-sm text-muted-foreground">Add an email for this person to message them.</p> : (
            <>
              <Input placeholder="Subject" value={subject} onChange={(e) => setSubject(e.target.value)} maxLength={200} />
              <Textarea placeholder="Message" value={body} onChange={(e) => setBody(e.target.value)} maxLength={5000} rows={4} />
              <Button size="sm" disabled={m.isPending || subject.trim().length < 2 || !body.trim()} onClick={() => m.mutate()}>{m.isPending ? "Sending…" : "Send"}</Button>
            </>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
