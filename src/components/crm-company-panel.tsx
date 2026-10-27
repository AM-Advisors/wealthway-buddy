import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

export function CrmCompanyPanel({ data, onContact, onAdd, onConnect, onDeal }: { data: any; onContact: (id: string) => void; onAdd: () => void; onConnect: () => void; onDeal: (deal: any) => void }) {
  const names = new Map<string, string>((data.contacts as any[]).flatMap((c) => (c.matchedContactIds ?? [c.id]).map((id: string): [string, string] => [id, String(c.full_name)])));
  const time = (date: string | null) => date ? new Date(date).toLocaleString() : "Date not recorded";
  return <div className="min-w-0 space-y-4">
    <div className="flex flex-wrap gap-2"><Button size="sm" onClick={onAdd}>Add contact</Button><Button size="sm" variant="outline" onClick={onConnect}>Connect existing contact</Button></div>
    <Tabs defaultValue="contacts">
      <TabsList className="flex h-auto flex-wrap justify-start"><TabsTrigger value="contacts">Contacts ({data.contacts.length})</TabsTrigger><TabsTrigger value="activity">Activity</TabsTrigger><TabsTrigger value="emails">Emails</TabsTrigger><TabsTrigger value="deals">Deals</TabsTrigger></TabsList>
      <TabsContent value="contacts" className="divide-y">
        {!data.contacts.length && <p className="py-4 text-sm text-muted-foreground">No contacts connected.</p>}
        {data.contacts.map((c: any) => <div key={c.id} className="flex items-start justify-between gap-2 py-3"><div className="min-w-0 break-words text-sm"><p className="font-medium">{c.full_name}</p><p className="text-muted-foreground">{c.title || "Title not recorded"}</p><p>{c.email || "Email not recorded"}</p><p>{c.phone || "Phone not recorded"}</p>{c.archived_at && <Badge variant="outline">Archived</Badge>}</div><Button size="sm" variant="outline" onClick={() => onContact(c.id)}>Open</Button></div>)}
      </TabsContent>
      <TabsContent value="activity" className="divide-y">
        {!data.activity.length && <p className="py-4 text-sm text-muted-foreground">No activity recorded.</p>}
        {data.activity.map((r: any) => <div key={r.id} className="break-words py-3 text-sm"><p>{r.summary}</p><p className="text-xs text-muted-foreground">{names.get(r.contact_id)} · {r.actor_name} · {time(r.created_at)}</p></div>)}
      </TabsContent>
      <TabsContent value="emails" className="divide-y">
        {!data.emails.length && <p className="py-4 text-sm text-muted-foreground">No emails recorded.</p>}
        {data.emails.map((r: any) => <div key={r.id} className="break-words py-3 text-sm"><p className="font-medium">{r.subject || "(no subject)"}</p><p className="text-xs text-muted-foreground">{names.get(r.contact_id)} · {r.direction === "incoming" || r.direction === "INCOMING_EMAIL" ? "Received" : "Sent"} · {time(r.sent_at)}</p>{r.snippet && <p className="mt-1 whitespace-pre-wrap">{r.snippet}</p>}</div>)}
      </TabsContent>
      <TabsContent value="deals" className="divide-y">
        {!data.deals.length && <p className="py-4 text-sm text-muted-foreground">No deals recorded.</p>}
        {data.deals.map((deal: any) => <div key={deal.id} className="flex items-center justify-between gap-2 py-3 text-sm"><div className="min-w-0 break-words"><p className="font-medium">{deal.title}</p><p className="text-muted-foreground">{names.get(deal.contact_id)} · {deal.stage}</p></div><Button size="sm" variant="outline" onClick={() => onDeal(deal)}>Open</Button></div>)}
      </TabsContent>
    </Tabs>
  </div>;
}