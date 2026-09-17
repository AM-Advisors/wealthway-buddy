import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  internalJobSecret,
  isInternalJobRequest,
  requireInternalJob,
} from "./internal-job-auth.server";

const SECRET = "test-cron-secret-0123456789abcdef";
const PUBLISHABLE = "sb_publishable_FWkAdGnWIxmrFtxvS7xj7g_lpxQJ46N";

function req(headers: Record<string, string> = {}) {
  return new Request("https://example.test/api/public/hooks/invoice-reminders", {
    method: "POST",
    headers,
  });
}

describe("internal job authentication", () => {
  beforeEach(() => {
    process.env["CRON_SECRET"] = SECRET;
    process.env["SUPABASE_PUBLISHABLE_KEY"] = PUBLISHABLE;
    delete process.env["LOVABLE_CRON_SECRET"];
  });

  afterEach(() => {
    delete process.env["CRON_SECRET"];
    delete process.env["LOVABLE_CRON_SECRET"];
    delete process.env["SUPABASE_PUBLISHABLE_KEY"];
  });

  it("rejects a request with no credential", () => {
    expect(isInternalJobRequest(req())).toBe(false);
    expect(requireInternalJob(req())?.status).toBe(401);
  });

  it("rejects an incorrect credential", () => {
    expect(isInternalJobRequest(req({ "x-cron-secret": "nope" }))).toBe(false);
  });

  it("rejects a credential that is a prefix of the real secret", () => {
    expect(isInternalJobRequest(req({ "x-cron-secret": SECRET.slice(0, -1) }))).toBe(false);
  });

  it("rejects the Supabase publishable key", () => {
    expect(isInternalJobRequest(req({ "x-cron-secret": PUBLISHABLE }))).toBe(false);
    expect(isInternalJobRequest(req({ authorization: `Bearer ${PUBLISHABLE}` }))).toBe(false);
  });

  it("never treats a publishable key configured as CRON_SECRET as valid", () => {
    process.env["CRON_SECRET"] = PUBLISHABLE;
    expect(internalJobSecret()).toBeNull();
    expect(isInternalJobRequest(req({ "x-cron-secret": PUBLISHABLE }))).toBe(false);
  });

  it("rejects everything when no secret is configured", () => {
    delete process.env["CRON_SECRET"];
    expect(internalJobSecret()).toBeNull();
    expect(isInternalJobRequest(req({ "x-cron-secret": SECRET }))).toBe(false);
  });

  it("accepts the valid CRON_SECRET via header or bearer token", () => {
    expect(isInternalJobRequest(req({ "x-cron-secret": SECRET }))).toBe(true);
    expect(isInternalJobRequest(req({ authorization: `Bearer ${SECRET}` }))).toBe(true);
    expect(requireInternalJob(req({ "x-cron-secret": SECRET }))).toBeNull();
  });

  it("accepts the legacy LOVABLE_CRON_SECRET", () => {
    delete process.env["CRON_SECRET"];
    process.env["LOVABLE_CRON_SECRET"] = SECRET;
    expect(isInternalJobRequest(req({ "x-cron-secret": SECRET }))).toBe(true);
  });

  it("returns a generic 401 that does not reveal the secret", async () => {
    const response = requireInternalJob(req({ "x-cron-secret": "wrong" }))!;
    const body = await response.text();
    expect(response.status).toBe(401);
    expect(body).toBe("unauthorized");
    expect(body).not.toContain(SECRET);
  });
});

const mocks = vi.hoisted(() => ({
  sendInvoiceReminders: vi.fn(),
  claimReminderRun: vi.fn(),
  drainManagerAlerts: vi.fn(),
}));

vi.mock("@/lib/invoice-reminders.server", () => ({
  sendInvoiceReminders: mocks.sendInvoiceReminders,
  claimReminderRun: mocks.claimReminderRun,
}));
vi.mock("@/lib/manager-alerts.server", () => ({
  drainManagerAlerts: mocks.drainManagerAlerts,
}));

describe("privileged job logic is not entered before authentication", () => {
  const { sendInvoiceReminders, claimReminderRun, drainManagerAlerts } = mocks;

  beforeEach(() => {
    process.env["CRON_SECRET"] = SECRET;
    sendInvoiceReminders.mockReset().mockResolvedValue({ reminded: 0 });
    claimReminderRun.mockReset().mockResolvedValue(true);
    drainManagerAlerts.mockReset().mockResolvedValue({ sent: 0 });
  });

  afterEach(() => {
    delete process.env["CRON_SECRET"];
  });

  it("invoice reminders do no work for an unauthenticated caller", async () => {
    const { Route } = await import("@/routes/api/public/hooks/invoice-reminders");
    const handler = (Route.options as any).server.handlers.POST;

    const denied = await handler({ request: req() });
    expect(denied.status).toBe(401);
    expect(claimReminderRun).not.toHaveBeenCalled();
    expect(sendInvoiceReminders).not.toHaveBeenCalled();

    const denied2 = await handler({ request: req({ "x-cron-secret": PUBLISHABLE }) });
    expect(denied2.status).toBe(401);
    expect(sendInvoiceReminders).not.toHaveBeenCalled();

    const ok = await handler({ request: req({ "x-cron-secret": SECRET }) });
    expect(ok.status).toBe(200);
    expect(sendInvoiceReminders).toHaveBeenCalledTimes(1);
  });

  it("the alert drain does no work for an unauthenticated caller", async () => {
    const { Route } = await import("@/routes/api/public/notify/drain");
    const handler = (Route.options as any).server.handlers.POST;

    const denied = await handler({ request: req({ "x-cron-secret": "wrong" }) });
    expect(denied.status).toBe(401);
    expect(drainManagerAlerts).not.toHaveBeenCalled();

    const ok = await handler({ request: req({ authorization: `Bearer ${SECRET}` }) });
    expect(ok.status).toBe(200);
    expect(drainManagerAlerts).toHaveBeenCalledTimes(1);
  });
});
