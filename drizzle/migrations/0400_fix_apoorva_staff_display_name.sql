-- Apoorva's staff account (apoorva@harmonious.co) carried the leftover name
-- "Apoorva Inani Test". Correct it to "Apoorva Inani". Skipped unless the row
-- still has the old value.
UPDATE public.profiles
SET legal_name = 'Apoorva Inani'
WHERE user_id = '7ba9caee-11bd-43b4-930c-3650af3d6f78'
  AND email = 'apoorva@harmonious.co'
  AND legal_name = 'Apoorva Inani Test';
