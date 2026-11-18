UPDATE public.offering_requirements
SET accreditation_required = false,
    notes = 'Accreditation not required, restored to the original setting (requested 2026-11-18).',
    updated_at = now()
WHERE offering_id = 'ff02424d-05e0-4b9d-8166-d6402adfe2e1';