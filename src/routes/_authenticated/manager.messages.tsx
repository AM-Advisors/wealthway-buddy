import { useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { listMessageThreads } from "@/lib/portal-messages.functions";
import { PortalMessageThread } from "@/components/portal-message-thread";

export const Route = createFileRoute("/_authenticated/manager/messages")({
  component: Messages,
  head: () => ({
    meta: [
      { title: "Investor messages | Harmonious fund manager" },
      {
        name: "description",
        content: "Read and answer private investor questions for the funds you look after.",
      },
      { property: "og:title", content: "Investor messages | Harmonious" },
      {
        property: "og:description",
        content: "Private investor conversations for the funds you look after.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
});

function when(value: string | null) {
  if (!value) return "No messages yet";
  return new Date(value).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function Messages() {
  const load = useServerFn(listMessageThreads);
  const [search, setSearch] = useState("");
  const [openId, setOpenId] = useState<string | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ["message-threads"],
    queryFn: () => load({}),
    refetchInterval: 60000,
  });

  const threads = (data?.threads ?? []).filter((t) => {
    const q = search.trim().toLowerCase();
    if (!q) return true;
    return (
      t.investor_name.toLowerCase().includes(q) ||
      (t.investor_email ?? "").toLowerCase().includes(q) ||
      t.offering_name.toLowerCase().includes(q)
    );
  });

  const waiting = threads.reduce((sum, t) => sum + t.unread_from_investor, 0);

  return (
    <main className="mx-auto max-w-4xl px-4 py-10">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-3xl">Investor messages</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Private conversations with the investors in your funds.
            {waiting > 0 ? ` ${waiting} message${waiting === 1 ? "" : "s"} waiting for a reply.` : ""}
          </p>
        </div>
        <Button asChild variant="outline" size="sm">
          <Link to="/manager">Back to panel</Link>
        </Button>
      </div>

      <Input
        className="mt-6"
        placeholder="Search by investor, email or fund"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
      />

      <div className="mt-6 space-y-4">
        {isLoading ? (
          <p className="text-sm text-muted-foreground">Loading conversations…</p>
        ) : threads.length === 0 ? (
          <p className="text-sm text-muted-foreground">No investor conversations yet.</p>
        ) : (
          threads.map((t) => (
            <Card key={t.application_id}>
              <CardHeader className="pb-3">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <CardTitle className="text-lg">{t.investor_name}</CardTitle>
                    <CardDescription>
                      {t.offering_name}
                      {t.investor_email ? ` — ${t.investor_email}` : ""}
                    </CardDescription>
                  </div>
                  <div className="flex items-center gap-2">
                    {t.unread_from_investor > 0 ? (
                      <Badge>{t.unread_from_investor} new</Badge>
                    ) : null}
                    <Button
                      size="sm"
                      variant={openId === t.application_id ? "secondary" : "outline"}
                      onClick={() => setOpenId(openId === t.application_id ? null : t.application_id)}
                    >
                      {openId === t.application_id ? "Close" : "Open conversation"}
                    </Button>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                {openId === t.application_id ? (
                  <PortalMessageThread
                    applicationId={t.application_id}
                    placeholder={`Reply to ${t.investor_name}…`}
                  />
                ) : (
                  <p className="text-sm text-muted-foreground">
                    {t.last_message
                      ? `${t.last_sender_role === "investor" ? t.investor_name : "You"}: ${t.last_message.slice(0, 160)}`
                      : "No messages yet."}
                    <span className="ml-2 text-xs">{when(t.last_message_at)}</span>
                  </p>
                )}
              </CardContent>
            </Card>
          ))
        )}
      </div>
    </main>
  );
}
