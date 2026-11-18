/**
 * Client View (staff "view as fund manager") is read-only: nothing on the page
 * may be clicked, typed into or changed. The only exception is an element
 * marked data-view-safe, used for actions that change nothing and only
 * copy or open something (Copy Link, Preview Investor Experience, Copy
 * Invitation Message). Server authorization stays authoritative.
 */
export const VIEW_SAFE_SELECTOR = "[data-view-safe]";

/** Keys that only move focus or scroll the page; everything else is blocked. */
const MOVE_KEYS = new Set(["Tab", "Shift", "Escape", "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "PageUp", "PageDown", "Home", "End"]);
/** Controls where arrow keys change a value or open a menu. */
const VALUE_CONTROL = "input,textarea,select,[contenteditable=true],[role=combobox],[role=listbox],[role=slider],[role=spinbutton],[role=radio],[role=switch],[role=tab],[role=menuitem],[aria-haspopup]";

export type ReadOnlyTarget = { closest(selector: string): unknown };

export function readOnlyAllowsTarget(target: ReadOnlyTarget | null): boolean {
  return !!target && !!target.closest(VIEW_SAFE_SELECTOR);
}

export function readOnlyAllowsKey(key: string, opts: { ctrlOrMeta: boolean; target: ReadOnlyTarget | null }): boolean {
  if (readOnlyAllowsTarget(opts.target)) return true;
  // Copying or selecting text never changes anything.
  if (opts.ctrlOrMeta && (key === "c" || key === "C" || key === "a" || key === "A")) return true;
  if (key === "Tab" || key === "Shift" || key === "Escape") return true;
  if (!MOVE_KEYS.has(key)) return false;
  return !(opts.target && opts.target.closest(VALUE_CONTROL));
}
