import { afterEach, describe, expect, it, vi } from "vitest";
import { renderFilingPdf } from "./filing-pdf";
import type { FilingForm } from "./filing-forms";
import officialFormD from "@/assets/official-form-d.pdf.asset.json";

const form: FilingForm = { kind: "form_d", title: "Form D", subtitle: "Fictional fund", where: "Manual submission", sections: [], notices: [] };
afterEach(() => vi.unstubAllGlobals());
describe("official Form D paperwork", () => {
  it("returns the supplied official form unchanged rather than generating a substitute", async () => {
    const original = new Uint8Array([37, 80, 68, 70, 45, 49, 46, 55]);
    const fetcher = vi.fn().mockResolvedValue(new Response(original));
    vi.stubGlobal("fetch", fetcher);
    expect(await renderFilingPdf(form)).toEqual(original);
    expect(fetcher).toHaveBeenCalledWith(officialFormD.url);
  });
  it("does not silently substitute a worksheet if the official form is unavailable", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(null, { status: 404 })));
    await expect(renderFilingPdf(form)).rejects.toThrow("Couldn't load the official Form D.");
  });
});