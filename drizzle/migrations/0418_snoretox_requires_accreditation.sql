INSERT INTO public.offering_requirements (offering_id, accreditation_required, accreditation_verification, notes)
SELECT o.id, true, 'self_certification', 'Accreditation self-certification required (requested 2026-11-18).'
FROM public.offerings o
WHERE o.id = 'ff02424d-05e0-4b9d-8166-d6402adfe2e1'
ON CONFLICT (offering_id) DO UPDATE
SET accreditation_required = true,
    accreditation_verification = 'self_certification',
    updated_at = now();