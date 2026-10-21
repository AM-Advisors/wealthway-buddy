import { useEffect, useState } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { usePlaidLink } from "react-plaid-link";
import { finishBankConnection } from "@/lib/bank-feed.functions";
import { finishPersonalAccountFeed } from '@/lib/account-aggregation.functions';

export const Route = createFileRoute("/plaid-oauth")({
  ssr: false,
  head: () => ({ meta: [{ title: "Finishing bank connection · Harmonious" }, { name: "description", content: "Returning from your bank to finish connecting the fund's account." }, { property: "og:title", content: "Finishing bank connection · Harmonious" }, { property: "og:description", content: "Returning from your bank to finish connecting the fund's account." }, { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary" }, { name: "robots", content: "noindex" }] }),
  component: PlaidOAuth,
});

function PlaidOAuth() {
  const finish = useServerFn(finishBankConnection);
  const finishPersonal = useServerFn(finishPersonalAccountFeed);
  const navigate = useNavigate();
  const [saved, setSaved] = useState<{ kind?: string; linkToken?: string; consentId?: string; fundId?: string; back?: string; createdAt?: number } | null>(null);
  const [msg, setMsg] = useState("Finishing your bank connection…");
  const back = typeof saved?.back === "string" && saved.back.startsWith("/") ? saved.back : "/my-funds";
  const { open, ready } = usePlaidLink({
    token: saved?.linkToken ?? null,
    receivedRedirectUri: window.location.href,
    onSuccess: async (publicToken) => {
      try {
        if (saved?.kind === 'personal' && saved.consentId) {
          const result = await finishPersonal({ data: { consentId: saved.consentId, publicToken } });
          if (!result.ok) setMsg(result.message ?? 'The connection was saved; account information is not available yet.');
          localStorage.removeItem('plaid-oauth');
          await navigate({ to: '/wealth' });
        } else if (saved?.fundId && publicToken) {
          await finish({ data: { fundId: saved.fundId, publicToken } }); localStorage.removeItem("plaid-oauth"); navigate({ to: back as any });
        } else setMsg('This account sign-in has expired. Connect again from your portfolio.');
      }
      catch (e) { setMsg(e instanceof Error ? e.message : "Could not save the connection."); }
    },
    onExit: () => navigate({ to: back as any }),
  });
  useEffect(() => { try { const value = JSON.parse(localStorage.getItem('plaid-oauth') ?? 'null'); if (value?.createdAt && Date.now() - value.createdAt > 30 * 60_000) { localStorage.removeItem('plaid-oauth'); return; } setSaved(value); } catch { setSaved(null); } }, []);
  useEffect(() => { if (!saved) setMsg("This account sign-in has expired. Go back to your portfolio and connect again."); else if (ready) open(); }, [ready, open, saved]);
  return <main className="mx-auto max-w-md p-10 text-center text-sm text-muted-foreground">{msg}</main>;
}
