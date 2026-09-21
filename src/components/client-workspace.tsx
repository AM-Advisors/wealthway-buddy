import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";

import { clearStoredClientContext } from "@/lib/client-context-storage";
import { configuredOrigins } from "@/lib/app-origins";
import { opsLeavesCurrentHost } from "@/lib/host-routing";
import { enterWorkspace, resolveSession } from "@/lib/session.functions";
import { workspaceOptions, type WorkspaceOption } from "@/lib/client-navigation";
import type { WorkspaceKind } from "@/lib/session-resolution";

const ACTIVE_KEY = "harmonious.workspace.active";

type SessionShape = {
  person: { userId: string; name: string; email: string };
  operations: boolean;
  staffRoles: string[];
  workspaces: { kind: WorkspaceKind; id: string; label: string; path: string; surface: "client" | "ops" }[];
  pendingInvitations: number;
  outstandingRequirements: string[];
  destination: string;
  destinationReason: string;
};

type ClientWorkspaceValue = {
  loading: boolean;
  session: SessionShape | null;
  options: WorkspaceOption[];
  activeId: string | null;
  activeKind: WorkspaceKind | null;
  switchTo: (workspaceId: string) => Promise<void>;
  clearWorkspace: () => void;
};

const Ctx = createContext<ClientWorkspaceValue>({
  loading: true,
  session: null,
  options: [],
  activeId: null,
  activeKind: null,
  switchTo: async () => {},
  clearWorkspace: () => {},
});

function readStored(): string | null {
  if (typeof window === "undefined") return null;
  try {
    return window.sessionStorage.getItem(ACTIVE_KEY);
  } catch {
    return null;
  }
}

/**
 * Holds which workspace a person is working in. The list of workspaces and the
 * right to enter one both come from the server; the browser only remembers the
 * last choice, and the server checks it again on every switch.
 */
export function ClientWorkspaceProvider({ children }: { children: React.ReactNode }) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const resolve = useServerFn(resolveSession);
  const enter = useServerFn(enterWorkspace);
  const [activeId, setActiveId] = useState<string | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ["client-session"],
    queryFn: () => resolve({ data: {} }) as Promise<SessionShape>,
    staleTime: 60_000,
  });

  useEffect(() => {
    setActiveId(readStored());
  }, []);

  const options = useMemo(() => {
    const env = {
      CLIENT_APP_ORIGIN: import.meta.env["VITE_CLIENT_APP_ORIGIN"] as string | undefined,
      OPS_APP_ORIGIN: import.meta.env["VITE_OPS_APP_ORIGIN"] as string | undefined,
    };
    const opsOrigin = configuredOrigins(env).ops;
    const currentHost = typeof window === "undefined" ? "" : window.location.host;
    // Harmonious Operations lives at its own address. On a preview or local
    // address, where both applications are served together, it stays in place.
    // Either way the entry only appears because the server resolved it, and
    // opening it grants nothing on its own.
    const leaves = opsLeavesCurrentHost(currentHost, opsOrigin);
    return workspaceOptions((data?.workspaces ?? []) as never, env).map((option) =>
      option.surface === "ops" && !leaves
        ? { ...option, href: option.path, external: false }
        : option,
    );
  }, [data?.workspaces]);

  const resolvedActive = useMemo(() => {
    const stored = options.find((o) => o.id === activeId);
    return stored ?? options.find((o) => o.surface === "client") ?? options[0] ?? null;
  }, [options, activeId]);

  const switchTo = useCallback(
    async (workspaceId: string) => {
      // The server re-resolves authority; an identifier typed by hand fails here.
      const result: any = await enter({ data: { workspaceId } });
      // Nothing chosen in the previous workspace may be remembered here.
      clearStoredClientContext();
      try {
        window.sessionStorage.setItem(ACTIVE_KEY, workspaceId);
      } catch {
        /* storage unavailable — the switch still works for this visit */
      }
      setActiveId(workspaceId);
      // Nothing from the previous workspace should linger.
      await queryClient.cancelQueries();
      queryClient.clear();
      navigate({ to: result.path as never });
    },
    [enter, navigate, queryClient],
  );

  const clearWorkspace = useCallback(() => {
    clearStoredClientContext();
    setActiveId(null);
  }, []);

  const value: ClientWorkspaceValue = {
    loading: isLoading,
    session: (data as SessionShape) ?? null,
    options,
    activeId: resolvedActive?.id ?? null,
    activeKind: (resolvedActive?.kind as WorkspaceKind | undefined) ?? null,
    switchTo,
    clearWorkspace,
  };

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useClientWorkspace() {
  return useContext(Ctx);
}
