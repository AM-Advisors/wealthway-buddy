import { beforeEach, describe, expect, it, vi } from "vitest";

const mock = vi.hoisted(() => ({ tables: {} as Record<string, any[]>, urls: vi.fn() }));
vi.mock("@/integrations/supabase/client.server", () => ({ supabaseAdmin: {
  from: (table: string) => {
    const filters: ((row: any) => boolean)[] = [];
    const q: any = {
      select: () => q, eq: (key: string, value: unknown) => { filters.push((r) => r[key] === value); return q; },
      is: (key: string, value: unknown) => { filters.push((r) => (r[key] ?? null) === value); return q; },
      order: () => q,
      maybeSingle: async () => ({ data: (mock.tables[table] ?? []).filter((r) => filters.every((f) => f(r)))[0] ?? null }),
      then: (resolve: any) => Promise.resolve({ data: (mock.tables[table] ?? []).filter((r) => filters.every((f) => f(r))) }).then(resolve),
    };
    return q;
  },
  storage: { from: (bucket: string) => ({ createSignedUrl: async (path: string) => { mock.urls(bucket, path); return { data: { signedUrl: `https://synthetic.test/${bucket}/${path}` } }; } }) },
} }));
import { listFiles } from "./fund-tabs.server";
import { einComplete } from "./fund-setup-complete";

describe("shared IRS evidence read-back", () => {
  beforeEach(() => {
    mock.urls.mockClear();
    mock.tables = {
      fund_files: [], fund_setups: [{ id: "setup", offering_id: "series-fund" }],
      fund_setup_documents: [
        { id: "letter", setup_id: "setup", doc_type: "ein_letter", is_current: true, storage_path: "current.pdf", title: "IRS EIN letter", created_at: "2026-10-18" },
        { id: "old", setup_id: "setup", doc_type: "ein_letter", is_current: false, storage_path: "old.pdf" },
        { id: "other", setup_id: "other-setup", doc_type: "ein_letter", is_current: true, storage_path: "other.pdf" },
      ],
    };
  });
  it("the current canonical IRS upload completes the EIN box without duplicating a fund file", async () => {
    const files = await listFiles("series-fund", true);
    expect(files.map((f) => f.id)).toEqual(["letter"]);
    expect(files[0]?.category).toBe("ein_letter");
    expect(einComplete({ status: "recorded", hasLetter: files.some((f) => f.category === "ein_letter") })).toBe(true);
    expect(mock.tables["fund_files"]).toEqual([]);
    expect(mock.urls).toHaveBeenCalledWith("fund-formation", "current.pdf");
  });
  it("ordinary fund viewers never receive restricted setup evidence", async () => {
    expect(await listFiles("series-fund", false)).toEqual([]);
    expect(mock.urls).not.toHaveBeenCalled();
  });
});