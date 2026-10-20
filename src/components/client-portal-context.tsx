import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";

import { useClientWorkspace } from "@/components/client-workspace";
import { getClientPortal, maybeSendClientWelcome } from "@/lib/client-portal.functions";
import { LoadError } from "@/components/load-error";

type ClientPortalContextValue = {
  data: any;
  isLoading: boolean;
  clientId: string | null;
  setClientId: (id: string) => void;
};

const ClientPortalContext = createContext<ClientPortalContextValue | null>(null);

export function ClientPortalProvider({ children }: { children: ReactNode }) {
  const load = useServerFn(getClientPortal);
  const sendWelcome = useServerFn(maybeSendClientWelcome);
  const { activeClientId } = useClientWorkspace();
  const [clientId, setClientId] = useState<string | null>(activeClientId);
  // The workspace switcher decides which client account is shown.
  useEffect(() => {
    if (activeClientId) setClientId(activeClientId);
  }, [activeClientId]);

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ["client-portal", clientId],
    queryFn: () => load({ data: { clientId } }),
    retry: false,
  });

  // First time a signed-up contact opens the portal, send their welcome email
  // (portal link + next steps). The server sends it once per person per client.
  useEffect(() => {
    if (data?.client) {
      sendWelcome({ data: { clientId: (data.client as any).id } } as any).catch(() => undefined);
    }
  }, [data?.client, sendWelcome]);

  if (isLoading) return <p role="status" className="p-4 text-sm text-muted-foreground">Loading your account…</p>;
  if (error || !data) return <LoadError audience="account" error={error} what="Your account" onRetry={() => void refetch()} />;

  return (
    <ClientPortalContext.Provider value={{ data, isLoading, clientId, setClientId }}>
      {children}
    </ClientPortalContext.Provider>
  );
}

export function useClientPortal() {
  const ctx = useContext(ClientPortalContext);
  if (!ctx) throw new Error("useClientPortal must be used inside ClientPortalProvider");
  return ctx;
}

/** Same as useClientPortal, but returns null outside the company workspace. */
export function useOptionalClientPortal() {
  return useContext(ClientPortalContext);
}
