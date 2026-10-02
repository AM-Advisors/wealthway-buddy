export const usd = (c: number | null | undefined) =>
  typeof c === "number" ? (c / 100).toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }) : "-";

export const fmtDate = (d: string | null | undefined) =>
  d ? new Date(d).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) : "Not recorded";

/** Dollars typed by a person -> cents, or null when blank/invalid. */
export const toCents = (v: string) => {
  const n = Number(String(v).replace(/[$,\s]/g, ""));
  return v.trim() && Number.isFinite(n) && n >= 0 ? Math.round(n * 100) : null;
};

export const toPct = (v: string) => {
  const n = Number(String(v).replace(/[%\s]/g, ""));
  return v.trim() && Number.isFinite(n) && n >= 0 && n <= 100 ? n : null;
};

export function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result).split(",")[1] ?? "");
    r.onerror = () => reject(new Error("Couldn't read that file."));
    r.readAsDataURL(file);
  });
}
