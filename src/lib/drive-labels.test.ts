import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { DRIVE_LABELS, addFundTitle, intakeActionsEnabled } from "./drive-labels";

const card = readFileSync("src/components/investor-drive-intake.tsx", "utf8");
const fns = readFileSync("src/lib/investor-drive.functions.ts", "utf8");
const admin = readFileSync("src/components/client-admin.tsx", "utf8");

describe("Drive surface labels", () => {
  it("uses three distinct titles and directions, never bare 'Google Drive'", () => {
    const titles = [DRIVE_LABELS.intake.title, DRIVE_LABELS.imported.title, DRIVE_LABELS.filing.title];
    expect(new Set(titles).size).toBe(3);
    expect(titles).not.toContain("Google Drive");
    expect(DRIVE_LABELS.intake.direction).toBe("Restricted Investor Records → Harmonious");
    expect(DRIVE_LABELS.filing.direction).toBe("Harmonious → Restricted Investor Records");
    expect(DRIVE_LABELS.imported.direction).toBe("Import history");
  });
  it("intake card no longer uses the generic title", () => {
    expect(card).not.toMatch(/>Google Drive</);
    expect(card).toContain("DRIVE_LABELS.intake.title");
  });
});

describe("Drive intake empty state", () => {
  it("disables actions without an eligible investment or ready repository", () => {
    expect(intakeActionsEnabled({ repositoryReady: true, rowCount: 0 })).toBe(false);
    expect(intakeActionsEnabled({ repositoryReady: false, rowCount: 2 })).toBe(false);
    expect(intakeActionsEnabled({ repositoryReady: true, rowCount: 1 })).toBe(true);
  });
  it("renders the empty state instead of hiding the card when there are no rows", () => {
    expect(card).not.toMatch(/!q\.data\.rows\.length\) return null/);
    expect(card).toContain("DRIVE_LABELS.intake.emptyTitle");
    expect(DRIVE_LABELS.intake.emptyTitle).toBe("No investment available to connect yet");
  });
  it("still hides for non-Super-Administrators (server refuses → card not rendered)", () => {
    expect(card).toMatch(/if \(q\.isError\) return null/);
    const view = fns.slice(fns.indexOf("getInvestorDriveIntake"), fns.indexOf("searchInvestorFolders"));
    expect(view).toContain('requireSuperAdmin(context, "investor_drive_view")');
  });
  it("loading the card is read-only (no writes to investor_drive_connections)", () => {
    const view = fns.slice(fns.indexOf("getInvestorDriveIntake"), fns.indexOf("searchInvestorFolders"));
    expect(view).not.toMatch(/\.(insert|update|upsert|delete)\(/);
  });
});

describe("Add Fund heading", () => {
  it("names the workspace client", () => {
    expect(addFundTitle("Storybook Ventures")).toBe("Add Fund for Storybook Ventures");
    expect(addFundTitle(null)).toBe("Add Fund");
  });
  it("has no client selector in the dialog", () => {
    const dlg = admin.slice(admin.indexOf("function CreateFundDialog"), admin.indexOf("function CreateFundDialog") + 3000);
    expect(dlg).toContain("addFundTitle(clientName)");
    expect(dlg).not.toMatch(/clientId.*onChange|select[^>]*client/i);
  });
});
