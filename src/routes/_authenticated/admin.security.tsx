import { useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { listLoginAttempts } from "@/lib/access.functions";

export const Route = createFileRoute("/_authenticated/admin/security")({
  head: () => ({
    meta: [
      { title: "Login Activity | Harmonious Admin" },
      {
        name: "description",
        content:
          "Review successful and failed sign-in attempts to the Harmonious investor portal, with IP address and device detail.",
      },
      { property: "og:title", content: "Login Activity | Harmonious Admin" },
      {
        property: "og:description",
        content: "Successful and failed sign-in attempts to the Harmonious investor portal.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: SecurityPage,
});

type Result = "all" | "success" | "failure";

function browserOf(agent: string | null) {
  if (!agent) return "Unknown device";
  if (agent.includes("Edg/")) return "Edge";
  if (agent.includes("Chrome/")) return "Chrome";
  if (agent.includes("Safari/") && !agent.includes("Chrome/")) return "Safari";
  if (agent.includes("Firefox/")) return "Firefox";
  return "Other";
}

function SecurityPage() {
  const load = useServerFn(listLoginAttempts);
  const [result, setResult] = useState<Result>("all");
  const [search, setSearch] = useState("");

  const { data, isLoading, error } = useQuery({
    queryKey: ["login-attempts", result, search],
    queryFn: () => load({ data: { result, search } }),
    retry: false,
  });

  if (error) {
    return (
      <main className="mx-auto max-w-2xl px-4 py-16">
        <h1 className="text-3xl">Restricted</h1>
        <p className="mt-3 text-sm text-muted-foreground">
          Only Harmonious administrators can view login activity.
        </p>
        <Button asChild variant="outline" className="mt-6">
          <Link to="/dashboard">Back to your application</Link>
        </Button>
      </main>
    );
  }

  const attempts = data?.attempts ?? [];

  return (
    <main className="mx-auto max-w-5xl px-4 py-10">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-3xl">Login activity</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Every sign-in attempt to the investor portal, newest first.
          </p>
        </div>
        <div className="flex gap-2">
          <Button asChild size="sm" variant="outline">
            <Link to="/admin/access">Fund access</Link>
          </Button>
          <Button asChild size="sm" variant="outline">
            <Link to="/admin">Review queue</Link>
          </Button>
        </div>
      </div>

      <div className="mt-6 grid gap-3 sm:grid-cols-2">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Failed attempts (last 24 hours)</CardTitle>
          </CardHeader>
          <CardContent className="text-3xl">{data?.failures24h ?? 0}</CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Accounts with 3+ recent failures</CardTitle>
          </CardHeader>
          <CardContent className="space-y-1 text-sm">
            {(data?.watchlist ?? []).length === 0 && (
              <span className="text-muted-foreground">Nothing to flag right now.</span>
            )}
            {(data?.watchlist ?? []).map((w) => (
              <div key={w.email} className="flex items-center justify-between gap-2">
                <span>{w.email}</span>
                <Badge variant="destructive">{w.count} failures</Badge>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>

      <div className="mt-6 flex flex-wrap items-center gap-2">
        {(["all", "success", "failure"] as Result[]).map((key) => (
          <Button
            key={key}
            size="sm"
            variant={result === key ? "default" : "outline"}
            onClick={() => setResult(key)}
          >
            {key === "all" ? "All" : key === "success" ? "Successes" : "Failures"}
          </Button>
        ))}
        <Input
          className="w-64"
          placeholder="Search by email"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      <div className="mt-6 space-y-2">
        {isLoading && <p className="text-sm text-muted-foreground">Loading login activity…</p>}
        {!isLoading && attempts.length === 0 && (
          <Card>
            <CardContent className="py-10 text-center text-sm text-muted-foreground">
              No sign-in attempts recorded yet.
            </CardContent>
          </Card>
        )}
        {attempts.map((a: any) => (
          <div key={a.id} className="flex flex-wrap items-center justify-between gap-3 rounded-md border p-3">
            <div>
              <p className="text-sm font-medium">{a.email}</p>
              <p className="text-xs text-muted-foreground">
                {new Date(a.created_at).toLocaleString()} · {a.ip_address ?? "IP unavailable"} ·{" "}
                {browserOf(a.user_agent)}
                {a.failure_reason ? ` · ${a.failure_reason}` : ""}
              </p>
            </div>
            <Badge variant={a.success ? "secondary" : "destructive"}>
              {a.success ? "Signed in" : "Failed"}
            </Badge>
          </div>
        ))}
      </div>
    </main>
  );
}
