import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { linkPersonAccountFn, personAccountsFn, unlinkPersonAccountFn } from "@/lib/person-accounts.functions";

const STATUS: Record<string, string> = { not_started: "No ID check", pending: "ID check in progress", review: "ID needs review", approved: "ID verified", declined: "ID declined", expired: "ID expired", sent_back: "Sent back" };

/** Staff-only: this person's other login accounts, kept separate. */
export function PersonAccountsCard({ userId }: { userId: string }) {
  const qc = useQueryClient();
  const load = useServerFn(personAccountsFn);
  const link = useServerFn(linkPersonAccountFn);
  const unlink = useServerFn(unlinkPersonAccountFn);
  const key = ["person-accounts", userId];
  const q = useQuery({ queryKey: key, queryFn: () => load({ data: { userId } }), retry: false });
  const [email, setEmail] = useState("");
  const done = () => { qc.invalidateQueries({ queryKey: ["person-accounts"] }); };
  const add = useMutation({ mutationFn: (e: string) => link({ data: { userId, email: e } }), onSuccess: () => { setEmail(""); toast.success("Account added to this person."); done(); }, onError: (e: Error) => toast.error(e.message) });
  const remove = useMutation({ mutationFn: (u: string) => unlink({ data: { userId: u } }), onSuccess: () => { toast.success("Account removed from this person."); done(); }, onError: (e: Error) => toast.error(e.message) });
  if (q.error) return null;
  const d = q.data;
  return (
    <section className="space-y-3 rounded-md border p-4">
      <div>
        <h2 className="text-lg">Same person's accounts</h2>
        <p className="text-sm text-muted-foreground">Staff only. Group the logins one person uses so you can see how many they have, for lockouts, expired IDs or watchlist alerts. Accounts stay separate: nothing is merged or shared. A matching name alone doesn't mean the same person.</p>
      </div>
      {!d ? <p className="text-sm text-muted-foreground">Loading…</p> : <>
        {d.accounts.length ? <ul className="space-y-2">{d.accounts.map((a) => (
          <li key={a.userId} className="flex flex-wrap items-center gap-2 text-sm">
            <Link to="/ops/people/$userId" params={{ userId: a.userId }} className="text-primary hover:underline break-all">{a.email}</Link>
            <Badge variant="outline">{STATUS[a.status] ?? a.status}</Badge>
            {a.idExpired && <Badge variant="destructive">ID expired</Badge>}
            {!a.idExpired && a.idExpires && <span className="text-xs text-muted-foreground">ID expires {a.idExpires}</span>}
            {a.watchlistHits > 0 && <Badge variant="destructive">{a.watchlistHits} watchlist alert{a.watchlistHits > 1 ? "s" : ""}</Badge>}
            {a.userId === userId ? <span className="text-xs text-muted-foreground">This account</span> : null}
            <Button size="sm" variant="ghost" disabled={remove.isPending} onClick={() => remove.mutate(a.userId)}>Remove</Button>
          </li>))}</ul>
          : <p className="text-sm text-muted-foreground">No other accounts recorded for this person.</p>}
        {!!d.suggestions.length && <div className="space-y-1 rounded-md bg-muted p-2 text-sm">
          <p>Possibly the same verified person (same date of birth and ID number):</p>
          {d.suggestions.map((s) => <div key={s.userId} className="flex flex-wrap items-center gap-2"><span className="break-all">{s.email}</span><Button size="sm" variant="outline" disabled={add.isPending} onClick={() => add.mutate(s.email)}>Add to this person</Button></div>)}
        </div>}
        <form className="flex flex-wrap gap-2" onSubmit={(e) => { e.preventDefault(); if (email.trim()) add.mutate(email.trim()); }}>
          <Input className="max-w-xs" type="email" placeholder="Other account's email" aria-label="Other account's email" value={email} onChange={(e) => setEmail(e.target.value)} />
          <Button type="submit" size="sm" disabled={add.isPending || !email.trim()}>Add account</Button>
        </form>
      </>}
    </section>
  );
}
