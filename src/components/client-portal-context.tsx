import { createContext, useContext, useState, type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";

import { getClientPortal } from "@/lib/client-portal.functions";

type ClientPortalContextValue = {
  data: any;
  isLoading: boolean;
  clientId: string | null;
  setClientId: (id: string) => void;
};

const ClientPortalContext = createContext<ClientPortalContextValue | null>(null);

export function ClientPortalProvider({ children }: { children: ReactNode }) {
  const load = useServerFn(getClientPortal);
  const [clientId, setClientId] = useState<string | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ["client-portal", clientId],
    queryFn: () => load({ data: { clientId } }),
    retry: false,
  });

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
