import { useState } from "react";
import { UserPlus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { SalesContactInput } from "@/lib/sales-contact-model";

export function AddSalesContact({ onSave, organization = "" }: { onSave: (contact: SalesContactInput) => Promise<void>; organization?: string }) {
  const [fields, setFields] = useState({ fullName: "", email: "", organization, title: "", phone: "" });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  return <form className="space-y-3" onSubmit={async (e) => {
    e.preventDefault(); setError(""); setBusy(true);
    try { await onSave(fields); }
    catch (err) { setError(err instanceof Error ? err.message : "Couldn't add this contact. Try again."); }
    finally { setBusy(false); }
  }}>
    <div className="grid min-w-0 gap-2">
      <label className="space-y-1 text-sm">Full name<Input required minLength={2} maxLength={200} autoComplete="name" value={fields.fullName} disabled={busy} onChange={(e) => setFields({ ...fields, fullName: e.target.value })} /></label>
      <label className="space-y-1 text-sm">Email<Input required type="email" maxLength={255} autoComplete="email" value={fields.email} disabled={busy} onChange={(e) => setFields({ ...fields, email: e.target.value })} /></label>
      <label className="space-y-1 text-sm">Organization<Input maxLength={200} autoComplete="organization" value={fields.organization} disabled={busy} onChange={(e) => setFields({ ...fields, organization: e.target.value })} /></label>
      <label className="space-y-1 text-sm">Title (optional)<Input maxLength={200} value={fields.title} disabled={busy} onChange={(e) => setFields({ ...fields, title: e.target.value })} /></label>
      <label className="space-y-1 text-sm">Phone (optional)<Input type="tel" maxLength={40} autoComplete="tel" value={fields.phone} disabled={busy} onChange={(e) => setFields({ ...fields, phone: e.target.value })} /></label>
    </div>
    {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
    <Button type="submit" disabled={busy || fields.fullName.trim().length < 2 || !fields.email.trim()}><UserPlus className="mr-2 h-4 w-4" />{busy ? "Adding…" : "Add contact"}</Button>
  </form>;
}