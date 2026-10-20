import { describe, it, expect, beforeEach } from "vitest";
import { withFailureLogging, resourceFromUrl, scrubMessage, rateLimit, __resetForTests } from "./supabase-fetch-log.server";

const HOST = "https://db.example";
const flush = () => new Promise((r) => setTimeout(r, 10));

function fakeFetch(status: number, body: string): typeof fetch {
  return (async () => new Response(body, { status, headers: { "content-type": "application/json" } })) as any;
}

describe("supabase failure logging", () => {
  beforeEach(() => __resetForTests());

  it("logs failures with table, status, code, scrubbed message only", async () => {
    const lines: string[] = [];
    const f = withFailureLogging(fakeFetch(400, JSON.stringify({ code: "22P02", message: 'invalid input syntax for type uuid: "secret-value"', details: "x" })), (u) => u.startsWith(HOST), (l) => lines.push(l));
    const res = await f(`${HOST}/rest/v1/marketing_posts?email=eq.alice@x.com`, { headers: { apikey: "sb_secret_abc" }, body: "payload" });
    expect(res.status).toBe(400);
    expect(await res.json()).toMatchObject({ code: "22P02" }); // body still readable by caller
    await flush();
    expect(lines).toEqual(['[db-fail] marketing_posts status=400 code=22P02 msg=invalid input syntax for type uuid: "…"']);
    expect(lines[0]).not.toMatch(/alice|secret|payload|sb_/);
  });

  it("ignores successes and non-database hosts", async () => {
    const lines: string[] = [];
    await withFailureLogging(fakeFetch(200, "[]"), (u) => u.startsWith(HOST), (l) => lines.push(l))(`${HOST}/rest/v1/t`);
    await withFailureLogging(fakeFetch(500, "{}"), (u) => u.startsWith(HOST), (l) => lines.push(l))("https://other.example/x");
    await flush();
    expect(lines).toEqual([]);
  });

  it("never throws when logging itself fails, and passes base errors through unchanged", async () => {
    const f = withFailureLogging(fakeFetch(500, "not json"), () => true, () => { throw new Error("boom"); });
    expect((await f(`${HOST}/rest/v1/t`)).status).toBe(500);
    const err = new Error("network");
    const g = withFailureLogging((async () => { throw err; }) as any, () => true, () => {});
    await expect(g(`${HOST}/rest/v1/t`)).rejects.toBe(err);
  });

  it("rate-limits identical lines and reports suppressed count", () => {
    expect(rateLimit("a", 0)).toBe("a");
    expect(rateLimit("a", 1000)).toBeNull();
    expect(rateLimit("a", 2000)).toBeNull();
    expect(rateLimit("a", 61_000)).toBe("a (+2 repeats suppressed)");
    expect(rateLimit("b", 61_000)).toBe("b");
  });

  it("derives resources and scrubs values", () => {
    expect(resourceFromUrl(`${HOST}/rest/v1/rpc/do_thing?x=1`)).toBe("rpc:do_thing");
    expect(resourceFromUrl(`${HOST}/storage/v1/object/bucket/path`)).toBe("storage:object");
    expect(scrubMessage("duplicate key (email)=(a@b.c) id 123456")).toBe("duplicate key (…)=(…) id …");
  });
});
