import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";

import { getClientPortal, maybeSendClientWelcome } from "@/lib/client-portal.functions";

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
  const [clientId, setClientId] = useState<string | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ["client-portal", clientId],
    queryFn: () => load({ data: { clientId } }),
    retry: false,
  });

  // First time a signed-up contact opens the portal, send their welcome email
  // (portal link + next steps). The server sends it once per person per client.
  useEffect(() => {
    if (data?.client) {
      sendWelcome({}).catch(() => undefined);
    }
  }, [data?.client, sendWelcome]);

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
