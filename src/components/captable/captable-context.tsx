import { createContext, useContext, useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";

import { getCapTableWorkspace } from "@/lib/captable.functions";

type Workspace = Awaited<ReturnType<typeof getCapTableWorkspace>>;

type CapTableContextValue = {
  workspace: Workspace | undefined;
  isLoading: boolean;
  error: unknown;
  companyId: string | null;
  setCompanyId: (id: string) => void;
  refetch: () => void;
};

const CapTableContext = createContext<CapTableContextValue | null>(null);

const STORAGE_KEY = "harmonious.captable.company";

export function CapTableProvider({ children }: { children: React.ReactNode }) {
  const load = useServerFn(getCapTableWorkspace);
  const [companyId, setCompanyIdState] = useState<string | null>(null);

  useEffect(() => {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    if (stored) setCompanyIdState(stored);
  }, []);

  const query = useQuery({
    queryKey: ["captable-workspace", companyId],
    queryFn: () => load({ data: { companyId } }),
  });

  const value = useMemo<CapTableContextValue>(
    () => ({
      workspace: query.data,
      isLoading: query.isLoading,
      error: query.error,
      companyId: query.data?.company?.id ?? companyId,
      setCompanyId: (id: string) => {
        window.localStorage.setItem(STORAGE_KEY, id);
        setCompanyIdState(id);
      },
      refetch: () => void query.refetch(),
    }),
    [query.data, query.isLoading, query.error, companyId, query],
  );

  return <CapTableContext.Provider value={value}>{children}</CapTableContext.Provider>;
}

export function useCapTable() {
  const ctx = useContext(CapTableContext);
  if (!ctx) throw new Error("useCapTable must be used inside the CapTable workspace.");
  return ctx;
}

export function fmtNumber(value: number | null | undefined, digits = 0) {
  if (value === null || value === undefined || !Number.isFinite(value)) return "—";
  return value.toLocaleString("en-US", { maximumFractionDigits: digits });
}

export function fmtMoney(value: number | null | undefined, digits = 2) {
  if (value === null || value === undefined || !Number.isFinite(value)) return "—";
  return value.toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: digits,
  });
}

export function fmtPercent(value: number | null | undefined) {
  if (value === null || value === undefined || !Number.isFinite(value)) return "—";
  if (value === 0) return "0%";
  return `${value < 0.01 ? value.toFixed(4) : value.toFixed(2)}%`;
}

export function fmtDate(value: string | null | undefined) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" });
}
