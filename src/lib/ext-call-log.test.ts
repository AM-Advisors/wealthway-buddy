import { describe, it, expect, beforeEach } from "vitest";
import { redirect, notFound } from "@tanstack/react-router";
import { withExternalCallLogging, describeUrl, timeServerFn, isExpectedOutcome } from "./ext-call-log.server";
import { __resetForTests } from "./supabase-fetch-log.server";

const GW = "https://connector-gateway.lovable.dev";
const clock = (steps: number[]) => { let i = 0; return () => steps[Math.min(i++, steps.length - 1)]!; };

describe("outbound call logging", () => {
  beforeEach(() => __resetForTests());

  it("logs failures with service, method, two scrubbed segments; no query, ids or file names", async () => {
    const lines: string[] = [];
    const f = withExternalCallLogging((async () => new Response("secret body", { status: 404 })) as any, () => false, (l) => lines.push(l), clock([0, 50]));
    await f(`${GW}/google_drive/drive/v3/files/1AbCdEfGhIjKlMnOpQrStUv123/report.pdf?key=abc&q=alice`, { method: "post" });
    expect(lines).toEqual(["[ext] service=google_drive method=POST path=/drive/v3 status=404 ms=50"]);
    expect(lines[0]).not.toMatch(/report|alice|key|secret|1AbC/);
  });

  it("never reads the response body, so streams pass through untouched", async () => {
    const stream = new ReadableStream({ start(c) { c.enqueue(new TextEncoder().encode("chunk")); c.close(); } });
    const original = new Response(stream, { status: 500 });
    const f = withExternalCallLogging((async () => original) as any, () => false, () => {}, clock([0, 1]));
    const res = await f("https://api.box.com/2.0/files/123/content");
    expect(res).toBe(original);
    expect(res.bodyUsed).toBe(false);
    expect(await res.text()).toBe("chunk");
  });

  it("logs slow successes, ignores fast ones and database calls", async () => {
    const lines: string[] = [];
    const ok = (async () => new Response(null, { status: 200 })) as any;
    await withExternalCallLogging(ok, () => false, (l) => lines.push(l), clock([0, 100]))("https://api.box.com/2.0/folders/0");
    await withExternalCallLogging(ok, (u) => u.startsWith("https://db.x"), (l) => lines.push(l), clock([0, 9000]))("https://db.x/rest/v1/t");
    await withExternalCallLogging(ok, () => false, (l) => lines.push(l), clock([0, 4000]))("https://ai.gateway.lovable.dev/v1/responses");
    expect(lines).toEqual(["[ext] service=ai-gateway method=GET path=/v1/responses status=200 ms=4000 slow"]);
  });

  it("logs network errors/timeouts and rethrows the same error", async () => {
    const lines: string[] = [];
    const err = Object.assign(new Error("t"), { name: "TimeoutError" });
    const f = withExternalCallLogging((async () => { throw err; }) as any, () => false, (l) => lines.push(l), clock([0, 30]));
    await expect(f("https://verification.didit.me/v2/session/abc-123/decision/")).rejects.toBe(err);
    expect(lines).toEqual(["[ext] service=didit method=GET path=/v2/session status=timeout ms=30"]);
  });

  it("never throws when the logger itself fails", async () => {
    const f = withExternalCallLogging((async () => new Response(null, { status: 500 })) as any, () => false, () => { throw new Error("boom"); });
    expect((await f(`${GW}/slack/api/chat.postMessage`)).status).toBe(500);
  });

  it("keeps aws to one segment and slack method names", () => {
    expect(describeUrl(`${GW}/aws/s3/my-bucket/legacy/file.zip?uploadId=1`)).toEqual({ service: "aws", path: "/s3" });
    expect(describeUrl(`${GW}/slack/api/chat.postMessage`)).toEqual({ service: "slack", path: "/api/chat.postMessage" });
    expect(describeUrl(`${GW}/hubspot/crm/v3/objects/deals/98765`)).toEqual({ service: "hubspot", path: "/crm/v3" });
  });
});

describe("server function timing", () => {
  beforeEach(() => __resetForTests());

  it("passes thrown Responses, redirects and not-found through unchanged without logging", async () => {
    const lines: string[] = [];
    for (const thrown of [new Response(null, { status: 401 }), redirect({ to: "/auth" }), notFound(), Object.assign(new Error("Forbidden"), { status: 403 }), new Error("Unauthorized")]) {
      await expect(timeServerFn("f", async () => { throw thrown; }, (l) => lines.push(l), clock([0, 10]))).rejects.toBe(thrown);
      expect(isExpectedOutcome(thrown)).toBe(true);
    }
    expect(lines).toEqual([]);
  });

  it("logs real failures and slow calls, returning the original result", async () => {
    const lines: string[] = [];
    const err = new Error("db exploded with alice@x.com");
    await expect(timeServerFn("loadFund", async () => { throw err; }, (l) => lines.push(l), clock([0, 20]))).rejects.toBe(err);
    const out = { a: 1 };
    expect(await timeServerFn("slowOne", async () => out, (l) => lines.push(l), clock([0, 3500]))).toBe(out);
    expect(await timeServerFn("fastOne", async () => out, (l) => lines.push(l), clock([0, 5]))).toBe(out);
    expect(lines).toEqual(["[fn] name=loadFund result=error ms=20", "[fn] name=slowOne result=ok ms=3500 slow"]);
  });
});
