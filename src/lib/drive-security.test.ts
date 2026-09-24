import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  classifyDocument,
  destinationDecision,
  exceptionKey,
  investorMayOpenDriveFolder,
  issueAfterAttempts,
  linkProblem,
  managerMayOpenDriveFolder,
  neverInDrive,
  rootFor,
  type FolderFacts,
} from "@/lib/drive-policy";
import { can, capabilitiesFor } from "@/lib/ops-capabilities";

// The actual Harmonious Team audience, as read from Drive.
const SHARED_MEMBERS = [
  "info@harmoniouscapitaladmin.com",
  "alyssa@harmonious.co",
  "sales@harmoniouscapitaladmin.com",
  "operations@harmoniouscapitaladmin.com",
].map((email) => ({ type: "user", role: "fileOrganizer", email }));

const DRIVE = "0APbA-DxnxQINUk9PVA";
const ROOT = "1ObGXOWYDm0XGgf0YyTqA8YTc6A3aS0Ak";
const QA_ROOT = "QA_ROOT_0000000000";
const folder = (over: Partial<FolderFacts> = {}): FolderFacts => ({
  id: "FundAFolder0000001",
  mimeType: "application/vnd.google-apps.folder",
  driveId: DRIVE,
  ancestors: [ROOT, DRIVE],
  ...over,
});

describe("Drive permission safety gate", () => {
  it("broad shared-drive membership withholds restricted investor documents", () => {
    const d = destinationDecision("investor_restricted", { limitedAccess: false, principals: SHARED_MEMBERS });
    expect(d.allowed).toBe(false);
    expect((d as any).reason).toMatch(/Drive filing withheld — destination permissions too broad/);
  });

  it("a limited-access folder still withholds when sales@ is not approved", () => {
    const d = destinationDecision("investor_restricted", { limitedAccess: true, principals: SHARED_MEMBERS }, ["alyssa@harmonious.co"]);
    expect(d.allowed).toBe(false);
  });

  it("allows restricted filing only when every principal is approved", () => {
    const d = destinationDecision(
      "investor_restricted",
      { limitedAccess: true, principals: [{ type: "user", role: "organizer", email: "alyssa@harmonious.co" }] },
      ["alyssa@harmonious.co"],
    );
    expect(d.allowed).toBe(true);
  });

  it("Harmonious-restricted content is never filed; link/domain sharing blocks everything", () => {
    expect(destinationDecision("harmonious_restricted", { limitedAccess: true, principals: [] }).allowed).toBe(false);
    expect(destinationDecision("fund_general", { limitedAccess: false, principals: [{ type: "anyone", role: "reader" }] }).allowed).toBe(false);
    expect(destinationDecision("fund_general", { limitedAccess: false, principals: SHARED_MEMBERS }).allowed).toBe(true);
  });

  it("classifies by document, not folder", () => {
    expect(classifyDocument("subscription_agreement")).toBe("investor_restricted");
    expect(classifyDocument("accreditation letter")).toBe("investor_restricted");
    expect(classifyDocument("aml screening")).toBe("harmonious_restricted");
    expect(classifyDocument("formation", "Certificate of Formation")).toBe("fund_general");
    expect(classifyDocument("lpa", "LPA joinder signature page")).toBe("investor_general");
  });

  it("tax forms and raw KYC/ID evidence never go to Drive", () => {
    for (const t of ["Form W-9", "W-8BEN-E", "passport scan", "KYC report", "government id"]) expect(neverInDrive(t)).toBe(true);
    expect(neverInDrive("Subscription Agreement")).toBe(false);
  });
});

describe("Drive access decisions", () => {
  it("broad Drive membership never grants Harmonious authorization", () => {
    // sales@ holding Drive access says nothing about Operations capabilities.
    expect(capabilitiesFor([])).toEqual([]);
    expect(can(capabilitiesFor([]), "documents", "prepare")).toBe(false);
  });

  it("fund managers and investors never get Drive folders", () => {
    expect(managerMayOpenDriveFolder()).toBe(false);
    expect(investorMayOpenDriveFolder()).toBe(false);
  });
});

describe("Manual folder linking", () => {
  const base = { expectedDriveId: DRIVE, root: ROOT, otherRoot: QA_ROOT, mappedTo: [], targetKey: "fund:B" };

  it("rejects an arbitrary or missing ID", () => {
    expect(linkProblem({ ...base, folder: null })).toMatch(/does not exist/);
    expect(linkProblem({ ...base, folder: folder({ id: "../x" }) })).toMatch(/valid/);
  });

  it("rejects files, other drives, the root itself and folders outside Funds", () => {
    expect(linkProblem({ ...base, folder: folder({ mimeType: "application/pdf" }) })).toMatch(/not a folder/);
    expect(linkProblem({ ...base, folder: folder({ driveId: "OtherDrive" }) })).toMatch(/shared drive/);
    expect(linkProblem({ ...base, folder: folder({ id: ROOT }) })).toMatch(/root folder/);
    expect(linkProblem({ ...base, folder: folder({ ancestors: [DRIVE] }) })).toMatch(/Funds root/);
  });

  it("Fund A's folder cannot be linked to Fund B; Investor A's cannot map to Investor B", () => {
    expect(linkProblem({ ...base, folder: folder(), mappedTo: ["fund:A"] })).toMatch(/already linked/);
    expect(linkProblem({ ...base, targetKey: "investor:F:B", folder: folder(), mappedTo: ["investor:F:A"] })).toMatch(/already linked/);
    expect(linkProblem({ ...base, folder: folder(), mappedTo: ["fund:B"] })).toBeNull();
  });

  it("production and test roots never cross", () => {
    expect(linkProblem({ ...base, folder: folder({ ancestors: [QA_ROOT, ROOT, DRIVE] }) })).toMatch(/other environment/);
    expect(() => rootFor("test", { production: ROOT, test: null })).toThrow(/never fall back/);
    expect(rootFor("production", { production: ROOT, test: QA_ROOT })).toBe(ROOT);
  });
});

// In-memory stand-in for the database, for the exception task lifecycle.
const store: any[] = [];
vi.mock("@/integrations/supabase/client.server", () => {
  const table = () => {
    let filters: [string, any][] = [];
    let patch: any = null;
    let insertRow: any = null;
    const api: any = {
      select: () => api,
      eq: (k: string, v: any) => ((filters = [...filters, [k, v]]), api),
      update: (p: any) => ((patch = p), api),
      insert: (r: any) => ((insertRow = r), api),
      maybeSingle: async () => ({ data: store.find((r) => filters.every(([k, v]) => r[k] === v)) ?? null }),
      single: async () => {
        const row = { id: `x${store.length + 1}`, status: "open", attempts: 1, ...insertRow };
        store.push(row);
        return { data: row, error: null };
      },
      then: (res: any) => {
        if (patch) store.filter((r) => filters.every(([k, v]) => r[k] === v)).forEach((r) => Object.assign(r, patch));
        return Promise.resolve({ data: null, error: null }).then(res);
      },
    };
    return api;
  };
  return { supabaseAdmin: { from: () => table() } };
});

describe("Drive exception tasks", () => {
  beforeEach(() => store.splice(0));

  it("retries never duplicate the task, and success resolves it", async () => {
    const { raiseDriveException, resolveDriveException } = await import("@/lib/drive.server");
    const key = exceptionKey("fund", "o1");
    for (let i = 0; i < 3; i++) {
      await raiseDriveException({ key, issue: "needs_attention", offeringId: "o1", detail: "boom", action: "create fund folder" });
    }
    expect(store.filter((r) => r.dedupe_key === key)).toHaveLength(1);
    expect(store[0].attempts).toBe(3);
    expect(store[0].issue_type).toBe("retry_failed");
    await resolveDriveException(key);
    expect(store[0].status).toBe("resolved");
  });

  it("repeated failures escalate to retry failed, but conflicts stay conflicts", () => {
    expect(issueAfterAttempts("upload_failed", 3)).toBe("retry_failed");
    expect(issueAfterAttempts("conflict", 5)).toBe("conflict");
  });
});
