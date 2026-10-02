import { useEffect, useState } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { usePlaidLink } from "react-plaid-link";
import { finishBankConnection } from "@/lib/bank-feed.functions";

export const Route = createFileRoute("/plaid-oauth")({
  ssr: false,
  head: () => ({ meta: [{ title: "Finishing bank connection · Harmonious" }, { name: "description", content: "Returning from your bank to finish connecting the fund's account." }, { property: "og:title", content: "Finishing bank connection · Harmonious" }, { property: "og:description", content: "Returning from your bank to finish connecting the fund's account." }, { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary" }, { name: "robots", content: "noindex" }] }),
  component: PlaidOAuth,
});

function PlaidOAuth() {
  const finish = useServerFn(finishBankConnection);
  const navigate = useNavigate();
  const [saved] = useState(() => { try { return JSON.parse(localStorage.getItem("plaid-oauth") ?? "null"); } catch { return null; } });
  const [msg, setMsg] = useState("Finishing your bank connection…");
  const back = typeof saved?.back === "string" && saved.back.startsWith("/") ? saved.back : "/my-funds";
  const { open, ready } = usePlaidLink({
    token: saved?.linkToken ?? null,
    receivedRedirectUri: window.location.href,
    onSuccess: async (publicToken) => {
      try { await finish({ data: { fundId: saved.fundId, publicToken } }); localStorage.removeItem("plaid-oauth"); navigate({ to: back as any }); }
      catch (e) { setMsg(e instanceof Error ? e.message : "Could not save the connection."); }
    },
    onExit: () => navigate({ to: back as any }),
  });
  useEffect(() => { if (!saved) setMsg("This bank sign-in has expired. Go back to the fund and connect again."); else if (ready) open(); }, [ready, open, saved]);
  return <main className="mx-auto max-w-md p-10 text-center text-sm text-muted-foreground">{msg}</main>;
}
