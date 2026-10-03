import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";

/** Landing page for the HubSpot consent popup: forwards the one-time code to the opener and closes. */
function OAuthReturn() {
  const [message, setMessage] = useState("Finishing connection…");
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const notify = (type: "appUserConnectorOAuthComplete" | "appUserConnectorOAuthFailed", code?: string) => {
      window.opener?.postMessage({ type, connectorId: "hubspot", code: code ?? null }, window.location.origin);
      window.close();
    };
    if (params.get("success") !== "true") { setMessage(params.get("error") ?? "HubSpot sign-in did not complete."); notify("appUserConnectorOAuthFailed"); return; }
    const code = params.get("code");
    if (!code) {
      if (params.get("offline_access_allowed") === "false") { notify("appUserConnectorOAuthComplete"); return; }
      setMessage("HubSpot sign-in completed without an exchange code."); notify("appUserConnectorOAuthFailed"); return;
    }
    notify("appUserConnectorOAuthComplete", code);
  }, []);
  return <p className="p-6 text-sm text-muted-foreground">{message}</p>;
}

export const Route = createFileRoute("/oauth/hubspot/return")({
  head: () => ({ meta: [{ title: "Connecting HubSpot - Harmonious" }, { name: "robots", content: "noindex" }] }),
  component: OAuthReturn,
});
