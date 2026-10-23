import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Button } from "@/components/ui/button";
import { unsubscribeEmail } from "@/lib/marketing.functions";

export const Route = createFileRoute("/unsubscribe/$token")({
  head: () => ({
    meta: [
      { title: "Unsubscribe - Harmonious" },
      { name: "description", content: "Stop receiving marketing emails from Harmonious." },
      { property: "og:title", content: "Unsubscribe - Harmonious" },
      { property: "og:description", content: "Manage Harmonious marketing emails." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: Unsubscribe,
});

function Unsubscribe() {
  const { token } = Route.useParams();
  const fn = useServerFn(unsubscribeEmail);
  const m = useMutation({ mutationFn: () => fn({ data: { token } }) });
  return (
    <main className="mx-auto flex min-h-[70vh] max-w-md flex-col justify-center gap-4 px-6 text-center">
      <h1 className="text-3xl">Unsubscribe</h1>
      {m.data?.ok ? (
        <p className="text-muted-foreground">You're unsubscribed. You won't receive Harmonious marketing emails anymore. Account and service emails still arrive.</p>
      ) : m.data && !m.data.ok ? (
        <p className="text-destructive">This link isn't valid anymore.</p>
      ) : (
        <>
          <p className="text-muted-foreground">Stop receiving marketing emails from Harmonious?</p>
          <Button onClick={() => m.mutate()} disabled={m.isPending}>{m.isPending ? "Unsubscribing…" : "Unsubscribe"}</Button>
          {m.error && <p className="text-sm text-destructive">Something went wrong. Please try again.</p>}
        </>
      )}
      <Link to="/" className="text-sm text-primary underline">Back to harmonious.co</Link>
    </main>
  );
}
