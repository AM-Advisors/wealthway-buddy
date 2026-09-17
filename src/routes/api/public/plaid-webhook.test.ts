import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  verifyPlaidWebhook: vi.fn(),
  processPlaidWebhook: vi.fn(),
  insert: vi.fn(),
  update: vi.fn(),
}));

vi.mock("@/lib/plaid-webhook-verify.server", () => ({
  verifyPlaidWebhook: mocks.verifyPlaidWebhook,
}));
vi.mock("@/lib/plaid-webhook-process.server", () => ({
  processPlaidWebhook: mocks.processPlaidWebhook,
}));
vi.mock("@/integrations/supabase/client.server", () => ({
  supabaseAdmin: {
    from: () => ({
      insert: (row: unknown) => {
        mocks.insert(row);
        return {
          select: () => ({ maybeSingle: async () => ({ data: { id: "delivery-1" }, error: null }) }),
        };
      },
      update: (row: unknown) => {
        mocks.update(row);
        return { eq: async () => ({ error: null }) };
      },
    }),
  },
}));

const BODY = JSON.stringify({
  webhook_type: "TRANSACTIONS",
  webhook_code: "DEFAULT_UPDATE",
  item_id: "item-abc",
});

function request(body = BODY) {
  return new Request("https://example.test/api/public/plaid-webhook", {
    method: "POST",
    body,
    headers: { "plaid-verification": "token", "content-type": "application/json" },
  });
}

async function handler() {
  const { Route } = await import("@/routes/api/public/plaid-webhook");
  return (Route.options as any).server.handlers.POST;
}

describe("Plaid webhook route", () => {
  beforeEach(() => {
    mocks.verifyPlaidWebhook.mockReset();
    mocks.processPlaidWebhook.mockReset().mockResolvedValue({
      status: "processed",
      detail: "2 new deposit(s); 1 matched automatically.",
      offeringId: "11111111-1111-1111-1111-111111111111",
    });
    mocks.insert.mockReset();
    mocks.update.mockReset();
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("rejects an unverified delivery before any database write or processing", async () => {
    mocks.verifyPlaidWebhook.mockResolvedValue({ ok: false, reason: "invalid signature" });
    const response = await (await handler())({ request: request() });

    expect(response.status).toBe(401);
    expect(await response.text()).toBe("unauthorized");
    expect(mocks.insert).not.toHaveBeenCalled();
    expect(mocks.processPlaidWebhook).not.toHaveBeenCalled();
  });

  it("rejects a stale delivery before any database write", async () => {
    mocks.verifyPlaidWebhook.mockResolvedValue({ ok: false, reason: "stale delivery" });
    const response = await (await handler())({ request: request() });

    expect(response.status).toBe(401);
    expect(mocks.insert).not.toHaveBeenCalled();
    expect(mocks.processPlaidWebhook).not.toHaveBeenCalled();
  });

  it("rejects a body modified after signing before any database write", async () => {
    mocks.verifyPlaidWebhook.mockResolvedValue({
      ok: false,
      reason: "body does not match signature",
    });
    const response = await (await handler())({ request: request('{"item_id":"tampered"}') });

    expect(response.status).toBe(401);
    expect(mocks.insert).not.toHaveBeenCalled();
    expect(mocks.processPlaidWebhook).not.toHaveBeenCalled();
  });

  it("records and processes a verified delivery", async () => {
    mocks.verifyPlaidWebhook.mockResolvedValue({ ok: true, keyId: "key-1", bodySha256: "a".repeat(64) });
    const response = await (await handler())({ request: request() });

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({ ok: true, status: "processed" });
    expect(mocks.insert).toHaveBeenCalledWith(
      expect.objectContaining({
        item_id: "item-abc",
        webhook_type: "TRANSACTIONS",
        webhook_code: "DEFAULT_UPDATE",
        body_sha256: "a".repeat(64),
      }),
    );
    expect(mocks.processPlaidWebhook).toHaveBeenCalledWith({
      itemId: "item-abc",
      webhookType: "TRANSACTIONS",
      webhookCode: "DEFAULT_UPDATE",
    });
    expect(mocks.update).toHaveBeenCalledWith(expect.objectContaining({ status: "processed" }));
  });
});
