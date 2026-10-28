import { expect, it } from "vitest";
import { questionAuthorAccess } from "./fund-question-ai.server";
function client(roles: string[], manager: boolean) {
  return { from(table: string) { const chain: any = { select: () => chain, eq: () => chain, limit: () => chain, then(resolve: (value: unknown) => void) { resolve({ data: table === "user_roles" ? roles.map((role) => ({ role })) : manager ? [{ id: "exact-fund-manager" }] : [], error: null }); } }; return chain; } };
}
it("allows exact-fund managers to draft without granting staff review authority", async () => {
  expect(await questionAuthorAccess(client([], true), "actor", "fund")).toEqual({ staff: false });
});
it("refuses client viewers and investors who are not fund managers", async () => {
  await expect(questionAuthorAccess(client(["investor"], false), "actor", "fund")).rejects.toThrow("Only staff");
});
it("permits Operations staff to draft", async () => {
  expect(await questionAuthorAccess(client(["operations"], false), "actor", "fund")).toEqual({ staff: true });
});