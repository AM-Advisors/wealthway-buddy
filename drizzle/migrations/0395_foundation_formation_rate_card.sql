ALTER TABLE public.foundation_component_release_events DROP CONSTRAINT foundation_component_release_events_component_check;
ALTER TABLE public.foundation_component_release_events ADD CONSTRAINT foundation_component_release_events_component_check CHECK (component = ANY (ARRAY[
  'onboarding_setup','governance_admin','bookkeeping_reporting','contributions_restrictions','grant_administration','annual_compliance',
  'formation_planning','formation_incorporation','formation_governing_documents','exemption_application','state_registrations','operating_reporting'
]::text[]));

-- Approved Foundation Administration list prices (Nonprofit Foundation proposal, approved 2026-11-14).
-- Added to the current published rate card; quotes at or above these need no approval, lower prices need CEO or CRO.
INSERT INTO public.pricing_items (version_id, service_key, label, category, pricing_model, amount_cents, unit, condition, pass_through, sort_order)
SELECT 'fa7aa8d3-49f8-45d6-925d-1e93e077c011'::uuid, x.key, x.label, 'foundation', x.model, x.cents, x.unit, x.cond, false, x.ord
FROM (VALUES
  ('FOUNDATION_ADMIN:formation_planning', 'Foundation formation: planning, governance and board orientation', 'one_time', 150000::bigint, 'per foundation', 'Setup fee. 50% at signing, 50% when Form 1023 is submitted.', 300),
  ('FOUNDATION_ADMIN:formation_incorporation', 'Foundation formation: incorporation, EIN and registered agent setup', 'one_time', 100000::bigint, 'per foundation', 'Setup fee. Government fees billed at cost.', 301),
  ('FOUNDATION_ADMIN:formation_governing_documents', 'Foundation formation: bylaws, policies and minutes (with attorney review)', 'one_time', 250000::bigint, 'per foundation', 'Setup fee.', 302),
  ('FOUNDATION_ADMIN:exemption_application', 'Foundation formation: IRS Form 1023 preparation and IRS correspondence', 'one_time', 350000::bigint, 'per foundation', 'Setup fee. IRS user fee billed at cost.', 303),
  ('FOUNDATION_ADMIN:state_registrations', 'Foundation formation: state charity, tax exemption and local registrations', 'one_time', 100000::bigint, 'per foundation', 'Setup fee. State and local fees billed at cost.', 304),
  ('FOUNDATION_ADMIN:operating_reporting', 'Foundation operating and reporting retainer', 'recurring', 125000::bigint, 'per month', 'Billed monthly, beginning the month after incorporation.', 305)
) AS x(key, label, model, cents, unit, cond, ord)
WHERE EXISTS (SELECT 1 FROM public.pricing_versions v WHERE v.id = 'fa7aa8d3-49f8-45d6-925d-1e93e077c011'::uuid AND v.status = 'published')
  AND NOT EXISTS (SELECT 1 FROM public.pricing_items i WHERE i.version_id = 'fa7aa8d3-49f8-45d6-925d-1e93e077c011'::uuid AND i.service_key = x.key);