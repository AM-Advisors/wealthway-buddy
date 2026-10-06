import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/public/slack/events")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const raw = await request.text();
        let body: any = {};
        try { body = JSON.parse(raw); } catch { return new Response("bad request", { status: 400 }); }
        if (body.type === "url_verification") return Response.json({ challenge: body.challenge });
        if (request.headers.get("x-slack-retry-num")) return new Response("ok");
        const { verifySlackSignature, handleReaction, handleMention } = await import("@/lib/marketing-slack.server");
        const v = verifySlackSignature(raw, request.headers.get("x-slack-request-timestamp"), request.headers.get("x-slack-signature"));
        if (v === "absent") return new Response("ok");
        if (v === "invalid") return new Response("invalid signature", { status: 401 });
        // Work is a few quick DB/Slack calls; done before acking because no background-task API is wired here.
        const ev = body.type === "event_callback" ? body.event : null;
        if (ev?.type === "reaction_added") await handleReaction(ev).catch((e) => console.error("slack reaction", e));
        if (ev?.type === "app_mention") await handleMention(ev).catch((e) => console.error("slack mention", e));
        return new Response("ok");
      },
    },
  },
});
