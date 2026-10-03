import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";

/**
 * Landing page for the per-employee Google consent popup. It only forwards the
 * one-time code to the opener window (same origin) and closes — the opener
 * exchanges the code server-side.
 */
function OAuthReturn() {
  const [message, setMessage] = useState("Finishing connection…");

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const notifyOpenerAndClose = (
      type: "appUserConnectorOAuthComplete" | "appUserConnectorOAuthFailed",
      code?: string,
    ) => {
      window.opener?.postMessage(
        { type, connectorId: "google_mail", code: code ?? null },
        window.location.origin,
      );
      window.close();
    };
    if (params.get("success") !== "true") {
      setMessage(params.get("error") ?? "Google sign-in did not complete.");
      notifyOpenerAndClose("appUserConnectorOAuthFailed");
      return;
    }
    const code = params.get("code");
    if (!code) {
      if (params.get("offline_access_allowed") === "false") {
        notifyOpenerAndClose("appUserConnectorOAuthComplete");
        return;
      }
      setMessage("Google sign-in completed without an exchange code.");
      notifyOpenerAndClose("appUserConnectorOAuthFailed");
      return;
    }
    notifyOpenerAndClose("appUserConnectorOAuthComplete", code);
  }, []);

  return <p className="p-6 text-sm text-muted-foreground">{message}</p>;
}

export const Route = createFileRoute("/oauth/google/return")({
  head: () => ({ meta: [{ title: "Connecting Google - Harmonious" }] }),
  component: OAuthReturn,
});
