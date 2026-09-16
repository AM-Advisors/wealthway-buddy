import { useEffect, useState } from "react";

import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";

export type CapRequestProvider = "carta" | "pulley" | "angellist" | "spreadsheet" | "none" | "other";

const PROVIDERS: { value: CapRequestProvider; label: string }[] = [
  { value: "carta", label: "Carta" },
  { value: "pulley", label: "Pulley" },
  { value: "angellist", label: "AngelList" },
  { value: "spreadsheet", label: "A spreadsheet" },
  { value: "none", label: "No cap table yet" },
  { value: "other", label: "Something else" },
];

interface Props {
  open: boolean;
  provider: CapRequestProvider;
  onOpenChange: (open: boolean) => void;
}

/** The request form behind every "move from Carta / Pulley" button. */
export function CapTableRequestDialog({ open, provider, onOpenChange }: Props) {
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [companyName, setCompanyName] = useState("");
  const [source, setSource] = useState<CapRequestProvider>(provider);
  const [holders, setHolders] = useState("");
  const [note, setNote] = useState("");
  const [authority, setAuthority] = useState(false);
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);

  useEffect(() => {
    if (open) {
      setSource(provider);
      setSent(false);
    }
  }, [open, provider]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!authority) {
      toast.error("Please confirm you can act for the company.");
      return;
    }
    setBusy(true);
    try {
      const parsedHolders = holders.trim() === "" ? null : Number.parseInt(holders, 10);
      const response = await fetch("/api/public/cap-table-request", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          fullName: fullName.trim(),
          email: email.trim(),
          companyName: companyName.trim(),
          sourceProvider: source,
          shareholderCount:
            parsedHolders !== null && Number.isFinite(parsedHolders) ? parsedHolders : null,
          note: note.trim() || undefined,
          authority: true,
        }),
      });
      const body = (await response.json()) as { ok?: boolean; error?: string };
      if (!response.ok || !body.ok) {
        toast.error(body.error ?? "Please check the details and try again.");
        return;
      }
      setSent(true);
      setFullName("");
      setEmail("");
      setCompanyName("");
      setHolders("");
      setNote("");
      setAuthority(false);
    } catch {
      toast.error("We could not send that just now. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        {sent ? (
          <>
            <DialogHeader>
              <DialogTitle>Thank you — we have your request</DialogTitle>
              <DialogDescription>
                A member of the Harmonious team will be in touch to confirm the details and open your
                workspace. Nothing is recorded against your company until you review it yourself.
              </DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <Button onClick={() => onOpenChange(false)}>Close</Button>
            </DialogFooter>
          </>
        ) : (
          <form onSubmit={submit} className="space-y-4">
            <DialogHeader>
              <DialogTitle>Bring your cap table across</DialogTitle>
              <DialogDescription>
                Tell us where your records live today. We will confirm the details with you and open your
                workspace — your existing history comes with you.
              </DialogDescription>
            </DialogHeader>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="cap-name">Your name</Label>
                <Input
                  id="cap-name"
                  required
                  maxLength={120}
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  autoComplete="name"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="cap-email">Work email</Label>
                <Input
                  id="cap-email"
                  type="email"
                  required
                  maxLength={255}
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  autoComplete="email"
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="cap-company">Company</Label>
              <Input
                id="cap-company"
                required
                maxLength={160}
                value={companyName}
                onChange={(e) => setCompanyName(e.target.value)}
                autoComplete="organization"
              />
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="cap-source">Where your cap table is today</Label>
                <Select value={source} onValueChange={(v) => setSource(v as CapRequestProvider)}>
                  <SelectTrigger id="cap-source">
                    <SelectValue placeholder="Choose one" />
                  </SelectTrigger>
                  <SelectContent>
                    {PROVIDERS.map((p) => (
                      <SelectItem key={p.value} value={p.value}>
                        {p.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="cap-holders">Roughly how many shareholders</Label>
                <Input
                  id="cap-holders"
                  inputMode="numeric"
                  maxLength={7}
                  placeholder="Optional"
                  value={holders}
                  onChange={(e) => setHolders(e.target.value.replace(/[^0-9]/g, ""))}
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="cap-note">Anything we should know</Label>
              <Textarea
                id="cap-note"
                rows={3}
                maxLength={1000}
                placeholder="Optional — rounds in flight, option pool, multiple entities."
                value={note}
                onChange={(e) => setNote(e.target.value)}
              />
            </div>

            <label className="flex items-start gap-3 rounded-md border border-border p-3 text-sm">
              <Checkbox
                checked={authority}
                onCheckedChange={(v) => setAuthority(v === true)}
                aria-label="Confirm authority"
              />
              <span className="text-muted-foreground">
                I am authorised to act for this company and to share its ownership information with
                Harmonious.
              </span>
            </label>

            <DialogFooter>
              <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={busy || !authority}>
                {busy ? "Sending…" : "Request your workspace"}
              </Button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
