# Forecasting deployment pending

The required `lov_database--migration` tool was not available in this environment. `pending-schema.sql` is reviewed deployment input, NOT an applied migration. Apply it using that tool before enabling this feature; it grants service-role access before enabling RLS and permits no browser database access.

The catalog entry uses a custom quote with price explicitly to be confirmed, never a free purchase. Confirm the approved rate through existing Services & Pricing. Validate actual signed SOW, included exact-scope entitlement, and positive confirmed fund payment bound by `used_for` to the subject. Existing service-request payments may bind `used_for` to a request rather than the subject; reconcile this binding through the existing billing flow before production activation (the forecast gate deliberately fails closed).

Unverified: live RLS/trigger behavior, billing activation end-to-end, browser navigation, canonical fund opening NAV mapping. Fund projection inputs currently expose recorded calls and waterfall terms read-only, but opening NAV and projected periods require explicit assumptions. Portfolio annualized IRR is a single-entry/single-exit return, not multi-date XIRR. Cap table pool percentage represents a new post-round pool, not a target including an existing pool.

Roadmap remains unchecked until migration and paid activation are verified. No canonical writes or payment actions are introduced.
