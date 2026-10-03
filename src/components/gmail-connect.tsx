import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Mail, RefreshCw, Unplug } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { completeGoogleConnection, disconnectGoogle, getMyGmailStatus, startGoogleConnect } from "@/lib/gmail.functions";
import { toast } from "sonner";

function waitForOAuthCompletion(popup: Window) {
  return new Promise<string | null>((resolve, reject) => {
    let poll: number | undefined;
    const cleanup = () => {
      window.removeEventListener("message", onMessage);
      if (poll !== undefined) window.clearInterval(poll);
    };
    const onMessage = (event: MessageEvent) => {
      const type = event.data?.type;
      if (
        event.origin !== window.location.origin ||
        event.source !== popup ||
        event.data?.connectorId !== "google_mail" ||
        (type !== "appUserConnectorOAuthComplete" && type !== "appUserConnectorOAuthFailed")
      ) return;
      cleanup();
      if (type === "appUserConnectorOAuthComplete") {
        resolve(typeof event.data?.code === "string" ? event.data.code : null);
        return;
      }
      popup.close();
      reject(new Error("Google sign-in failed."));
    };
    window.addEventListener("message", onMessage);
    poll = window.setInterval(() => {
      if (!popup.closed) return;
      cleanup();
      reject(new Error("The Google sign-in window was closed before finishing."));
    }, 500);
  });
}

/**
 * "Connect your Google inbox" card for a staff member. Sends as the employee
 * once connected; their connection is never visible to anyone else.
 */
export function GmailConnectCard() {
  const qc = useQueryClient();
  const getStatus = useServerFn(getMyGmailStatus);
  const start = useServerFn(startGoogleConnect);
  const complete = useServerFn(completeGoogleConnection);
  const disconnect = useServerFn(disconnectGoogle);
  const [busy, setBusy] = useState(false);
  const status = useQuery({ queryKey: ["my-gmail-status"], queryFn: () => getStatus() });

  const connect = async () => {
    setBusy(true);
    const popup = window.open("", "lovable-oauth", "width=600,height=720");
    if (!popup) {
      setBusy(false);
      toast.error("Popup blocked. Allow popups and try again.");
      return;
    }
    try {
      const { authorizationUrl } = await start({});
      const completion = waitForOAuthCompletion(popup);
      popup.location.href = authorizationUrl;
      const code = await completion;
      if (code) await complete({ data: { code } });
      await qc.invalidateQueries({ queryKey: ["my-gmail-status"] });
      toast.success(status.data?.connected ? "Reconnected to Google." : "Your Google inbox is connected.");
    } catch (e) {
      popup.close();
      toast.error(e instanceof Error ? e.message : "Couldn't connect Google.");
    } finally {
      setBusy(false);
    }
  };

  const onDisconnect = async () => {
    setBusy(true);
    try {
      await disconnect({});
      await qc.invalidateQueries({ queryKey: ["my-gmail-status"] });
      toast.success("Google inbox disconnected.");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't disconnect.");
    } finally {
      setBusy(false);
    }
  };

  const s = status.data;
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base"><Mail className="h-4 w-4" /> Your Google inbox</CardTitle>
        <CardDescription>
          Connect your Google account to send email as yourself. Only you can use your connection.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-wrap items-center gap-3">
        {status.isLoading ? (
          <p className="text-sm text-muted-foreground">Checking…</p>
        ) : s?.connected ? (
          <>
            <p className="text-sm">Connected as <span className="font-medium">{s.email}</span></p>
            <Button size="sm" variant="outline" disabled={busy} onClick={connect}>
              <RefreshCw className="mr-1 h-3.5 w-3.5" /> Reconnect
            </Button>
            <Button size="sm" variant="ghost" disabled={busy} onClick={onDisconnect}>
              <Unplug className="mr-1 h-3.5 w-3.5" /> Disconnect
            </Button>
          </>
        ) : (
          <>
            {s?.reconnectRequired && <p className="text-sm text-muted-foreground">Your Google access needs to be renewed.</p>}
            <Button size="sm" disabled={busy} onClick={connect}>
              <Mail className="mr-1 h-3.5 w-3.5" /> {s?.reconnectRequired ? "Reconnect Google" : "Connect Google"}
            </Button>
          </>
        )}
      </CardContent>
    </Card>
  );
}
