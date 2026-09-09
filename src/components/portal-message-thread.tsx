import { useEffect, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { listPortalMessages, sendPortalMessage } from "@/lib/portal-messages.functions";

function when(value: string) {
  return new Date(value).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

/**
 * Private conversation between one investor and the fund team. The same view
 * serves both sides; the server decides which messages count as "yours".
 */
export function PortalMessageThread({
  applicationId,
  placeholder = "Write a message…",
}: {
  applicationId: string;
  placeholder?: string;
}) {
  const load = useServerFn(listPortalMessages);
  const send = useServerFn(sendPortalMessage);
  const queryClient = useQueryClient();
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const bottom = useRef<HTMLDivElement>(null);

  const { data, isLoading } = useQuery({
    queryKey: ["portal-messages", applicationId],
    queryFn: () => load({ data: { application_id: applicationId } }),
    refetchInterval: 20000,
    refetchOnWindowFocus: true,
  });

  const messages = data?.messages ?? [];
  const mine = data?.role === "investor" ? "investor" : "team";

  useEffect(() => {
    bottom.current?.scrollIntoView({ block: "nearest" });
  }, [messages.length]);

  async function submit() {
    const body = draft.trim();
    if (!body) return;
    setSending(true);
    try {
      await send({ data: { application_id: applicationId, body } });
      setDraft("");
      await queryClient.invalidateQueries({ queryKey: ["portal-messages", applicationId] });
      await queryClient.invalidateQueries({ queryKey: ["message-threads"] });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not send that message.");
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="space-y-3">
      <div className="max-h-96 space-y-3 overflow-y-auto rounded-md border bg-muted/20 p-3">
        {isLoading ? (
          <p className="text-sm text-muted-foreground">Loading the conversation…</p>
        ) : messages.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No messages yet. Anything written here stays private between the investor and the fund team.
          </p>
        ) : (
          messages.map((m) => {
            const fromMe = (m.sender_role === "investor") === (mine === "investor");
            return (
              <div key={m.id} className={fromMe ? "flex justify-end" : "flex justify-start"}>
                <div
                  className={`max-w-[85%] rounded-lg px-3 py-2 text-sm ${
                    fromMe ? "bg-primary text-primary-foreground" : "bg-background border"
                  }`}
                >
                  <div className="mb-1 flex items-center gap-2 text-xs opacity-80">
                    <span>{m.sender_name ?? (m.sender_role === "investor" ? "Investor" : "Fund team")}</span>
                    {m.sender_role !== "investor" ? (
                      <Badge variant="secondary" className="h-4 px-1 text-[10px]">
                        {m.sender_role === "admin" ? "Admin" : "Fund manager"}
                      </Badge>
                    ) : null}
                    <span>{when(m.created_at)}</span>
                  </div>
                  <p className="whitespace-pre-wrap">{m.body}</p>
                </div>
              </div>
            );
          })
        )}
        <div ref={bottom} />
      </div>

      <Textarea
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        placeholder={placeholder}
        rows={3}
        maxLength={5000}
      />
      <div className="flex justify-end">
        <Button onClick={submit} disabled={sending || draft.trim().length === 0}>
          {sending ? "Sending…" : "Send message"}
        </Button>
      </div>
    </div>
  );
}
