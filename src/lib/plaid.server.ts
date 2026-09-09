/** Thin server-only wrapper around the Plaid REST API. */

function creds() {
  const clientId = process.env["PLAID_CLIENT_ID"];
  const secret = process.env["PLAID_SECRET"];
  const env = (process.env["PLAID_ENV"] ?? "sandbox").toLowerCase();
  if (!clientId || !secret) {
    throw new Error("The bank feed is not set up yet: Plaid credentials are missing.");
  }
  const base =
    env === "production" ? "https://production.plaid.com" : "https://sandbox.plaid.com";
  return { clientId, secret, base };
}

export function plaidConfigured() {
  return Boolean(process.env["PLAID_CLIENT_ID"] && process.env["PLAID_SECRET"]);
}

async function call<T>(path: string, body: Record<string, unknown>): Promise<T> {
  const { clientId, secret, base } = creds();
  const response = await fetch(`${base}${path}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ client_id: clientId, secret, ...body }),
  });
  const text = await response.text();
  if (!response.ok) {
    let message = text.slice(0, 300);
    try {
      const parsed = JSON.parse(text) as { error_message?: string; error_code?: string };
      message = parsed.error_message ?? parsed.error_code ?? message;
    } catch {
      /* keep raw text */
    }
    console.error(`Plaid ${path} failed [${response.status}]: ${text.slice(0, 500)}`);
    throw new Error(`Your bank connection service rejected the request: ${message}`);
  }
  return JSON.parse(text) as T;
}

export function createLinkToken(opts: { userId: string; fundName: string }) {
  return call<{ link_token: string; expiration: string }>("/link/token/create", {
    user: { client_user_id: opts.userId },
    client_name: "Harmonious",
    products: ["transactions"],
    country_codes: ["US"],
    language: "en",
  });
}

export function exchangePublicToken(publicToken: string) {
  return call<{ access_token: string; item_id: string }>("/item/public_token/exchange", {
    public_token: publicToken,
  });
}

export type PlaidAccount = {
  account_id: string;
  name: string;
  mask: string | null;
  official_name: string | null;
};

export function getAccounts(accessToken: string) {
  return call<{ accounts: PlaidAccount[]; item: { institution_id: string | null } }>(
    "/accounts/get",
    { access_token: accessToken },
  );
}

export function getInstitution(institutionId: string) {
  return call<{ institution: { name: string } }>("/institutions/get_by_id", {
    institution_id: institutionId,
    country_codes: ["US"],
  });
}

export type PlaidTransaction = {
  transaction_id: string;
  date: string;
  amount: number;
  name: string;
  merchant_name?: string | null;
  original_description?: string | null;
  pending: boolean;
};

export function getTransactions(accessToken: string, startDate: string, endDate: string) {
  return call<{ transactions: PlaidTransaction[]; total_transactions: number }>(
    "/transactions/get",
    {
      access_token: accessToken,
      start_date: startDate,
      end_date: endDate,
      options: { count: 500, offset: 0 },
    },
  );
}
