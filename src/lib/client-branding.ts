/** Fonts a white-labeled client can choose (all Google Fonts). */
export const BRAND_FONTS = [
  "Rubik", "Poppins", "Montserrat", "Lato", "Merriweather", "Playfair Display", "Source Sans 3", "Roboto", "Open Sans", "Libre Baskerville",
] as const;

export const WHITELABEL_MONTHLY_FEE = 100;

export const WHITELABEL_STATUS_LABEL: Record<string, string> = {
  off: "Not enabled",
  payment_pending: "Requested - card billing being set up",
  active_paid: "Active - $100/month",
  unlocked_free: "Active - unlocked free by Harmonious",
};

export function isWhitelabelActive(status?: string | null) {
  return status === "active_paid" || status === "unlocked_free";
}

export function customAppAddress(sub?: string | null) {
  return sub ? `app.${sub}.harmonious.co` : null;
}

export function googleFontsHref(fonts: (string | null | undefined)[]) {
  const fams = [...new Set(fonts.filter(Boolean) as string[])];
  if (!fams.length) return null;
  return `https://fonts.googleapis.com/css2?${fams.map((f) => `family=${encodeURIComponent(f).replace(/%20/g, "+")}:wght@400;500;600;700`).join("&")}&display=swap`;
}
