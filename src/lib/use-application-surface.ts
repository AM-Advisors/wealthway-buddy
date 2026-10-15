import { useEffect, useState } from "react";
import { applicationSurfaceForHost } from "@/lib/host-routing";
import type { AppSurface } from "@/lib/app-origins";

export function useApplicationSurface(): AppSurface | null {
  const [surface, setSurface] = useState<AppSurface | null>(null);
  useEffect(() => {
    setSurface(applicationSurfaceForHost(window.location.host, {
      CLIENT_APP_ORIGIN: import.meta.env["VITE_CLIENT_APP_ORIGIN"],
      OPS_APP_ORIGIN: import.meta.env["VITE_OPS_APP_ORIGIN"],
    }));
  }, []);
  return surface;
}