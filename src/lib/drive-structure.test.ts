import { describe, expect, it } from "vitest";

import {
  DriveConflictError,
  FUND_SUBFOLDERS,
  ensureSubfolders,
  ensureTaggedFolder,
  executedFileName,
  filingTargets,
  fundKey,
  investorFolderName,
  investorKey,
  isTaxForm,
  type DriveClient,
  type DriveFile,
} from "@/lib/drive-structure";

function fakeDrive() {
  const files: (DriveFile & { parent: string })[] = [];
  let n = 0;
  const client: DriveClient = {
    async findByKey(p, k) { return files.find((f) => f.parent === p && f.appProperties?.["harmonious_key"] === k) ?? null; },
    async findByName(p, name) { return files.filter((f) => f.parent === p && f.name === name); },
    async createFolder(p, name, key) { const f = { id: `f${++n}`, name, parent: p, appProperties: { harmonious_key: key } }; files.push(f); return f; },
    async renameFolder(id, name) { const f = files.find((x) => x.id === id); if (f) f.name = name; },
    async uploadPdf(p, name, _b, key) { const f = { id: `u${++n}`, name, parent: p, appProperties: { harmonious_key: key } }; files.push(f); return f; },
  };
  return { client, files };
}

describe("Google Drive structure", () => {
  it("creation is idempotent — retries never make 'Fund (1)'", async () => {
    const { client, files } = fakeDrive();
    const a = await ensureTaggedFolder(client, "root", "Alpha Fund", fundKey("o1"));
    const b = await ensureTaggedFolder(client, "root", "Alpha Fund", fundKey("o1"));
    expect(a.folder.id).toBe(b.folder.id);
    expect(b.created).toBe(false);
    expect(files).toHaveLength(1);
  });

  it("an untagged same-named folder is a conflict, never adopted", async () => {
    const { client, files } = fakeDrive();
    files.push({ id: "legacy", name: "Alpha Fund", parent: "root" });
    await expect(ensureTaggedFolder(client, "root", "Alpha Fund", fundKey("o1"))).rejects.toBeInstanceOf(DriveConflictError);
    expect(files).toHaveLength(1);
  });

  it("creates every fund subfolder once", async () => {
    const { client, files } = fakeDrive();
    const first = await ensureSubfolders(client, "fund", fundKey("o1"), FUND_SUBFOLDERS);
    const again = await ensureSubfolders(client, "fund", fundKey("o1"), FUND_SUBFOLDERS);
    expect(first.created).toHaveLength(6);
    expect(again.created).toHaveLength(0);
    expect(files).toHaveLength(6);
  });

  it("separate profiles of the same person never share a folder", () => {
    expect(investorKey("o1", "p1")).not.toBe(investorKey("o1", "p2"));
    expect(investorFolderName("Jane Smith", "individual")).toBe("Jane Smith - Individual");
    expect(investorFolderName("Jane Smith IRA", "ira")).toBe("Jane Smith IRA - IRA-SDIRA");
    expect(investorFolderName("Smith/Family Trust", "trust")).toBe("Smith Family Trust - Trust");
  });

  it("files subscription agreements to 01 and 05, others to 05 only", () => {
    expect(filingTargets("subscription_agreement")).toEqual(["01 - Subscription Documents"]);
    expect(filingTargets("side letter")).toEqual(["03 - Approved Restricted Documents"]);
  });

  it("keeps tax forms out of Drive and dates file names", () => {
    expect(isTaxForm("Form W-9")).toBe(true);
    expect(isTaxForm("W-8BEN-E")).toBe(true);
    expect(isTaxForm("Subscription Agreement")).toBe(false);
    expect(executedFileName("LPA", "2026-09-24T10:00:00Z", "2")).toBe("2026-09-24 - LPA - executed v2.pdf");
  });
});
