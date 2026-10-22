import { expect, it, vi } from "vitest";
vi.mock("@/lib/fund-tabs.server", () => ({
  isStaff: async (id: string) => id === "staff",
  db: async () => { throw new Error("Database must not be read for a manager generation request"); },
  team: async () => { throw new Error("Team must not be read"); },
}));
import { generate } from "./standard-forms.server";
it("denies manager standard-form generation before reading or writing fund facts", async () => {
  await expect(generate("manager", "fund", "operating_agreement")).rejects.toThrow("Only Harmonious staff");
});