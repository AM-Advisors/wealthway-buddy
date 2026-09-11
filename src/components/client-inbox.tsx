import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Mail, MailOpen } from "lucide-react";
import { useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { listMyMessages, markAllMessagesRead, readMyMessage } from "@/lib/client-inbox.functions";

function when(value: string) {
  return new Date(value).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export function ClientInbox() {
  const queryClient = useQueryClient();
  const list = useServerFn(listMyMessages);
  const read = useServerFn(readMyMessage);
  const markAll = useServerFn(markAllMessagesRead);
  const [openId, setOpenId] = useState<string | null>(null);

  const messagesQuery = useQuery({
    queryKey: ["client-inbox"],
    queryFn: () => list(),
  });

  const openQuery = useQuery({
    queryKey: ["client-inbox", openId],
    queryFn: () => read({ data: { id: openId as string } }),
    enabled: Boolean(openId),
  });

  const markAllMutation = useMutation({
    mutationFn: () => markAll(),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["client-inbox"] }),
  });

  const messages = (messagesQuery.data?.messages ?? []) as any[];
  const unread = messages.filter((m) => !m.read_at).length;

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader className="flex flex-row flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <CardTitle className="text-base">Inbox</CardTitle>
            <CardDescription>
              Every notice Harmonious emails you — invoices, reminders, decisions and welcome
              notes — kept here so nothing is lost in your mailbox.
            </CardDescription>
          </div>
          {unread > 0 && (
            <Button
              size="sm"
              variant="outline"
              onClick={() => markAllMutation.mutate()}
              disabled={markAllMutation.isPending}
            >
              Mark all read
            </Button>
          )}
        </CardHeader>

        <div className="px-6 pb-6">
          {messagesQuery.isLoading ? (
            <p className="text-sm text-muted-foreground">Loading your messages…</p>
          ) : messages.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No messages yet. Invoices and notices from Harmonious will appear here.
            </p>
          ) : (
            <ul className="divide-y rounded-md border">
              {messages.map((m) => (
                <li key={m.id}>
                  <button
                    type="button"
                    onClick={() => {
                      setOpenId(m.id);
                      if (!m.read_at) {
                        setTimeout(
                          () => queryClient.invalidateQueries({ queryKey: ["client-inbox"] }),
                          600,
                        );
                      }
                    }}
                    className="flex w-full items-start gap-3 px-4 py-3 text-left transition-colors hover:bg-muted/60"
                  >
                    {m.read_at ? (
                      <MailOpen className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
                    ) : (
                      <Mail className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                    )}
                    <span className="min-w-0 flex-1">
                      <span className="flex flex-wrap items-center gap-2">
                        <span
                          className={
                            m.read_at ? "text-sm" : "text-sm font-semibold text-foreground"
                          }
                        >
                          {m.subject}
                        </span>
                        {!m.read_at && <Badge variant="secondary">New</Badge>}
                      </span>
                      {m.preview && (
                        <span className="mt-1 block truncate text-xs text-muted-foreground">
                          {m.preview}
                        </span>
                      )}
                    </span>
                    <span className="shrink-0 text-xs text-muted-foreground">
                      {when(m.created_at)}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </Card>

      <Dialog open={Boolean(openId)} onOpenChange={(open) => !open && setOpenId(null)}>
        <DialogContent className="max-h-[85vh] max-w-3xl overflow-hidden p-0">
          <DialogHeader className="border-b px-6 py-4">
            <DialogTitle className="text-base">
              {(openQuery.data?.message as any)?.subject ?? "Message"}
            </DialogTitle>
            <DialogDescription>
              {(openQuery.data?.message as any)?.created_at
                ? when((openQuery.data!.message as any).created_at)
                : "Loading…"}
            </DialogDescription>
          </DialogHeader>
          <div className="max-h-[70vh] overflow-auto">
            {openQuery.isLoading ? (
              <p className="p-6 text-sm text-muted-foreground">Opening…</p>
            ) : (
              <iframe
                title="Message"
                sandbox=""
                className="h-[70vh] w-full border-0 bg-white"
                srcDoc={(openQuery.data?.message as any)?.body_html ?? ""}
              />
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
