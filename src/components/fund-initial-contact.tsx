import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { clearFundInitialContact, getFundInitialContact, setFundInitialContact } from "@/lib/fund-initial-contact.functions";
import { initialContactProblem } from "@/lib/fund-initial-contact";

/** Team & Signatory: the client's first point of contact for this fund. Staff only; grants no access. */
export function FundInitialContact({ offeringId }: { offeringId: string }) {
  const qc = useQueryClient();
  const load = useServerFn(getFundInitialContact);
  const save = useServerFn(setFundInitialContact);
  const clear = useServerFn(clearFundInitialContact);
  const key = ["fund-initial-contact", offeringId];
  const q = useQuery({ queryKey: key, queryFn: () => load({ data: { offeringId } }) });
  const [editing, setEditing] = useState(false);
  const [mode, setMode] = useState<"pick" | "new">("pick");
  const [picked, setPicked] = useState("");
  const [person, setPerson] = useState({ fullName: "", email: "", phone: "", title: "" });
  const [review, setReview] = useState<string | null>(null);
  const reset = () => { setEditing(false); setPicked(""); setPerson({ fullName: "", email: "", phone: "", title: "" }); setReview(null); };

  const m = useMutation({
    mutationFn: (confirmSeparate: boolean) => save({ data: mode === "pick" ? { offeringId, contactId: picked } : { offeringId, newPerson: person, confirmSeparate } }),
    onSuccess: () => { toast.success("Initial contact saved"); reset(); void qc.invalidateQueries({ queryKey: key }); },
    onError: (e: Error) => { if (/Contact Review Required/.test(e.message)) setReview(e.message.replace(/^.*Contact Review Required:\s*/, "")); else toast.error(e.message); },
  });
  const rm = useMutation({
    mutationFn: () => clear({ data: { offeringId } }),
    onSuccess: () => { toast.success("Initial contact removed"); void qc.invalidateQueries({ queryKey: key }); },
    onError: (e: Error) => toast.error(e.message),
  });

  if (q.isPending) return <div className="rounded-xl border bg-background px-4 py-3 text-sm text-muted-foreground">Loading initial contact…</div>;
  if (q.isError) return <div role="alert" className="rounded-xl border bg-background px-4 py-3 text-sm text-destructive">Initial contact could not be loaded.</div>;
  const d = q.data;
  const problem = mode === "new" ? initialContactProblem(person) : picked ? null : "Choose a contact.";
  const current = d.current;

  return (
    <div className="rounded-xl border bg-background px-4 py-3 text-sm">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <span className="block text-xs text-muted-foreground">Initial contact</span>
          {current ? (
            <>
              <span className="block font-medium">{current.fullName}{current.title ? <span className="font-normal text-muted-foreground"> · {current.title}</span> : null}</span>
              <span className="block break-all text-xs text-muted-foreground">{[current.email, current.phone].filter(Boolean).join(" · ")}</span>
            </>
          ) : <span className="block">{d.clientLinked ? "Not added yet" : "Link this fund to a client first"}</span>}
        </div>
        {d.clientLinked && !editing && (
          <div className="flex gap-2">
            <Button size="sm" variant="outline" onClick={() => setEditing(true)}>{current ? "Change" : "Add initial contact"}</Button>
            {current && <Button size="sm" variant="ghost" disabled={rm.isPending} onClick={() => { if (window.confirm(`Remove ${current.fullName} as the initial contact? They stay on the client.`)) rm.mutate(); }}>Remove</Button>}
          </div>
        )}
      </div>

      {editing && (
        <div className="mt-3 space-y-3 border-t pt-3">
          <div className="flex gap-2" role="radiogroup" aria-label="Who is the initial contact">
            <Button size="sm" variant={mode === "pick" ? "default" : "outline"} role="radio" aria-checked={mode === "pick"} disabled={!d.options.length} onClick={() => setMode("pick")}>Someone on the client</Button>
            <Button size="sm" variant={mode === "new" ? "default" : "outline"} role="radio" aria-checked={mode === "new"} onClick={() => setMode("new")}>Add a new person</Button>
          </div>
          {mode === "pick" && d.options.length ? (
            <SearchableSelect aria-label="Initial contact" value={picked} onValueChange={setPicked}
              options={d.options.map((o) => ({ value: o.id, label: o.fullName, detail: [o.title, o.email].filter(Boolean).join(" · ") || null, keywords: [o.email ?? ""] }))} />
          ) : (
            <div className="grid gap-2 sm:grid-cols-2">
              <Input aria-label="Full name" placeholder="Full name" autoComplete="off" value={person.fullName} onChange={(e) => { setPerson({ ...person, fullName: e.target.value }); setReview(null); }} />
              <Input aria-label="Title" placeholder="Title (optional)" autoComplete="off" value={person.title} onChange={(e) => setPerson({ ...person, title: e.target.value })} />
              <Input aria-label="Email" type="email" placeholder="Email" autoComplete="off" value={person.email} onChange={(e) => { setPerson({ ...person, email: e.target.value }); setReview(null); }} />
              <Input aria-label="Phone" type="tel" placeholder="Phone" autoComplete="off" value={person.phone} onChange={(e) => setPerson({ ...person, phone: e.target.value })} />
            </div>
          )}
          {review && (
            <div role="alert" className="rounded-lg bg-muted p-3">
              <p>{review}</p>
              <Button size="sm" className="mt-2" variant="outline" disabled={m.isPending} onClick={() => m.mutate(true)}>This is a different person, add them</Button>
            </div>
          )}
          <p className="text-xs text-muted-foreground">Saved to the client's contacts. This doesn't give them a login, fund access or signing rights.</p>
          <div className="flex justify-end gap-2">
            <Button size="sm" variant="ghost" onClick={reset}>Cancel</Button>
            <Button size="sm" disabled={!!problem || m.isPending} title={problem ?? undefined} onClick={() => m.mutate(false)}>{m.isPending ? "Saving…" : "Save"}</Button>
          </div>
          {problem && mode === "new" && (person.fullName || person.email || person.phone) ? <p className="text-xs text-muted-foreground">{problem}</p> : null}
        </div>
      )}
    </div>
  );
}
