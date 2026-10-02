import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect } from "react";

import { getMyClientBranding } from "@/lib/client-branding.functions";
import { googleFontsHref, isWhitelabelActive } from "@/lib/client-branding";

/** Loads the active client's white-label branding (only when it is turned on). */
export function useClientBrand(enabled: boolean) {
  const fn = useServerFn(getMyClientBranding);
  const q = useQuery({ queryKey: ["my-client-branding"], queryFn: () => fn(), enabled, staleTime: 60_000 });
  const b = q.data?.branding;
  return enabled && b && isWhitelabelActive(b.whitelabel_status) ? (b as any) : null;
}

/** Applies a client's colors and fonts to the page while it is shown. */
export function ClientBrandStyles({ brand }: { brand: any | null }) {
  useEffect(() => {
    if (!brand) return;
    const root = document.documentElement;
    const set: [string, string | null][] = [
      ["--primary", brand.primary_color],
      ["--sidebar", brand.primary_color],
      ["--accent", brand.accent_color],
      ["--sidebar-primary", brand.accent_color],
      ["--font-heading", brand.heading_font ? `"${brand.heading_font}", ui-sans-serif, system-ui, sans-serif` : null],
      ["--font-sans", brand.body_font ? `"${brand.body_font}", ui-sans-serif, system-ui, sans-serif` : null],
    ];
    for (const [k, v] of set) if (v) root.style.setProperty(k, v);
    const href = googleFontsHref([brand.heading_font, brand.body_font]);
    let link: HTMLLinkElement | null = null;
    if (href) {
      link = document.createElement("link");
      link.rel = "stylesheet";
      link.href = href;
      document.head.appendChild(link);
    }
    return () => {
      for (const [k] of set) root.style.removeProperty(k);
      link?.remove();
    };
  }, [brand]);
  return null;
}
