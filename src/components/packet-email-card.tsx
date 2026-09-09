import { useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Mail } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { emailPacketToInvestor, listPacketRecipients } from "@/lib/offering-packet.functions";

/** Emails the private offering packet link to one investor connected to this fund. */
export function PacketEmailCard({ fundId }: { fundId: string }) {
  const loadRecipients = useServerFn(listPacketRecipients);
  const send = useServerFn(emailPacketToInvestor);

  const [selected, setSelected] = useState("");
  const [manualEmail, setManualEmail] = useState("");
  const [includeWire, setIncludeWire] = useState(true);
  const [note, setNote] = useState("");

  const { data } = useQuery({
    queryKey: ["packet-recipients", fundId],
    queryFn: () => loadRecipients({ data: { fundId } }),
  });
  const recipients = data?.recipients ?? [];
  const chosen = recipients.find((r) => r.email === selected);
  const email = selected === "__other" || recipients.length === 0 ? manualEmail.trim() : selected;

  const mutation = useMutation({
    mutationFn: () =>
      send({
        data: {
          fundId,
          email,
          include_wire: includeWire,
          expires_in_days: 30,
          ...(chosen?.name ? { name: chosen.name } : {}),
          ...(note.trim() ? { note: note.trim() } : {}),
        },
      }),
    onSuccess: (result) => {
      if (result.ok) {
        toast.success(result.message);
        setNote("");
      } else {
        toast.error(result.message);
      }
    },
    onError: (error: unknown) =>
      toast.error(error instanceof Error ? error.message : "Could not send the packet."),
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Mail className="h-4 w-4" aria-hidden />
          Email the packet to an investor
        </CardTitle>
        <CardDescription>
          Sends a private download link for this fund's documents. The link is unique to that person
          and stops working after 30 days.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="packet-recipient">Who should receive it</Label>
          {recipients.length > 0 ? (
            <select
              id="packet-recipient"
              value={selected}
              onChange={(event) => setSelected(event.target.value)}
              className="border-input bg-background h-10 w-full rounded-md border px-3 text-sm"
            >
              <option value="">Choose someone…</option>
              {recipients.map((r) => (
                <option key={r.userId} value={r.email}>
                  {r.name} — {r.email}
                </option>
              ))}
              <option value="__other">Someone else…</option>
            </select>
          ) : (
            <p className="text-muted-foreground text-sm">
              No investors are linked to this fund yet — type an address below.
            </p>
          )}
        </div>

        {(selected === "__other" || recipients.length === 0) && (
          <div className="space-y-2">
            <Label htmlFor="packet-email">Email address</Label>
            <Input
              id="packet-email"
              type="email"
              placeholder="investor@example.com"
              value={manualEmail}
              maxLength={255}
              onChange={(event) => setManualEmail(event.target.value)}
            />
          </div>
        )}

        <div className="flex items-center justify-between rounded-md border p-3">
          <div>
            <p className="text-sm font-medium">Include the bank details</p>
            <p className="text-muted-foreground text-xs">
              Adds this fund's wire instructions to the packet.
            </p>
          </div>
          <Switch checked={includeWire} onCheckedChange={setIncludeWire} />
        </div>

        <div className="space-y-2">
          <Label htmlFor="packet-note">Personal note (optional)</Label>
          <Textarea
            id="packet-note"
            rows={3}
            maxLength={2000}
            placeholder="Add a line of context for this investor."
            value={note}
            onChange={(event) => setNote(event.target.value)}
          />
        </div>

        <Button
          onClick={() => mutation.mutate()}
          disabled={mutation.isPending || !email.includes("@")}
        >
          {mutation.isPending ? "Sending…" : "Send the packet"}
        </Button>
      </CardContent>
    </Card>
  );
}
