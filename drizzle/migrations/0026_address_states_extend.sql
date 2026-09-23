-- Shared address intelligence: additional provider/proof states.
ALTER TYPE public.address_verification_state ADD VALUE IF NOT EXISTS 'located';
ALTER TYPE public.address_verification_state ADD VALUE IF NOT EXISTS 'validation_warning';
ALTER TYPE public.address_verification_state ADD VALUE IF NOT EXISTS 'proof_mismatch';