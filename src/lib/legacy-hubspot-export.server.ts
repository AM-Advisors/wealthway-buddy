// Server-only: HubSpot legacy-export client. Strict GET-only policy and a fixed
// allowlist of read endpoints, enforced for every export key (including scopes
// such as `tickets`/`files`/`forms`/`automation` that also permit writes).
// The export key env var is configured per run; never the everyday HubSpot key.

const GATEWAY = "https://connector-gateway.lovable.dev/hubspot";

/** Approved read endpoints. Anything not matching is refused before any network call. */
export const HUBSPOT_EXPORT_ALLOWLIST: RegExp[] = [
  /^\/crm\/objects\/(v3|\d{4}-\d{2})\/[a-z_0-9-]+(\/\d+)?(\/associations\/[a-z_0-9-]+)?$/,
  /^\/crm\/properties\/(v3|\d{4}-\d{2})\/[a-z_0-9-]+(\/[a-z_0-9-]+)?$/,
  /^\/crm\/pipelines\/(v3|\d{4}-\d{2})\/[a-z_]+(\/[A-Za-z0-9_-]+\/stages)?$/,
  /^\/crm\/owners\/(v3|\d{4}-\d{2})\/?$/,
  /^\/crm\/(v3|\d{4}-\d{2})\/schemas$/,
  /^\/crm-object-schemas\/(v3|\d{4}-\d{2})\/schemas$/,
  /^\/crm\/v3\/lists\/[0-9]+(\/memberships)?$/,
  /^\/files\/v3\/files\/(search|[0-9]+)$/,
  /^\/files\/v3\/files\/[0-9]+\/signed-url$/,
  /^\/marketing\/v3\/(campaigns|emails|forms)(\/[A-Za-z0-9-]+)?$/,
  /^\/automation\/v4\/flows(\/[0-9]+)?$/,
  /^\/account-info\/(v3|\d{4}-\d{2})\/details$/,
];

export class ExportPolicyError extends Error {}

export function assertAllowed(method: string, path: string) {
  if (method.toUpperCase() !== "GET") throw new ExportPolicyError(`Refused ${method}: export is GET-only`);
  const bare = path.split("?")[0];
  if (!HUBSPOT_EXPORT_ALLOWLIST.some((r) => r.test(bare))) throw new ExportPolicyError(`Refused path not on allowlist: ${bare}`);
}

export async function exportGet(keyEnv: string, path: string): Promise<Response> {
  assertAllowed("GET", path);
  const l = process.env.LOVABLE_API_KEY, k = process.env[keyEnv];
  if (!l || !k) throw new Error(`Export credential ${keyEnv} is not configured`);
  return fetch(GATEWAY + path, { method: "GET", headers: { Authorization: `Bearer ${l}`, "X-Connection-Api-Key": k } });
}
