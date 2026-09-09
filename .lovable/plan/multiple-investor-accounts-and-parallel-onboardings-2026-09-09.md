# Multiple investor accounts and parallel onboardings

Today one signed-in person has exactly one identity (one legal name, one tax ID, one investor type) and can only ever have one application per fund. This adds named investing accounts — individual, LLC, trust, IRA, joint — so the same person can apply and onboard several times, in the same fund or different funds, without their details overwriting each other.

## What the investor gets

**A new "Your accounts" page**
- Lists every investing account they have set up, with its type, legal/entity name, and the funds it is currently applying to or invested in.
- Add an account: pick a type (Individual, LLC / entity, Trust, IRA, Joint), give it a name, fill in legal details, tax ID, and address.
- Edit or rename an account, and mark one as the default.
- Each account shows its own onboarding progress per fund.

**An account switcher**
- A control in the portal and dashboard header shows which account they are acting as.
- Switching changes which application the onboarding steps (identity, screening, accreditation, documents, commitment, funding) read and write.
- The portal home lists every application across every account, so nothing is hidden behind the switch.

**Parallel onboarding**
- Applying to a fund asks which account is investing; the same fund can be entered twice under two different accounts.
- Each application keeps its own identity check, screening answers, accreditation, signed documents, commitment, and wire — they no longer share one profile record.

## What the team gets

Investor lists, cap table, wire tracking, manager inbox and approvals show the account name and type next to the person, so two rows for the same human are distinguishable.

## Technical outline

**Database**
- New `public.investor_personas`: `user_id`, `kind` (reuses the `investor_type` enum), `label`, `legal_name`, `entity_name`, `tax_id`, `date_of_birth`, `phone`, `email`, address fields, `is_default`, timestamps. GRANTs for `authenticated` + `service_role`; RLS: owner reads/writes their own; admins and assigned fund managers read personas of investors on their funds (via existing role helpers).
- Backfill one persona per existing `profiles` row, copying current details; `is_default = true`.
- `investor_applications.persona_id uuid references investor_personas(id)`; backfill to each user's default persona; replace `UNIQUE (user_id, offering_id)` with `UNIQUE (user_id, offering_id, persona_id)`.
- `profiles.active_persona_id` holds the current switcher selection; `profiles` stays as the person-level record (login email, default contact) and is no longer overwritten by per-account KYC.

**Server functions** — new `src/lib/personas.functions.ts`: `listPersonas`, `savePersona`, `setActivePersona`, `deletePersona` (blocked when applications exist). A shared `resolveApplication(supabase, userId, applicationId?)` helper picks the application by explicit id, else by active persona, else the default persona's first application; `onboarding.functions.ts`, `accreditation`, `documents`, `funding`, `subscription`, `step-rail`, `nav` and `apply` switch from "first application for user" to that helper.

**KYC writes** go to the selected persona row (and keep `profiles` in sync only for the default account), so an LLC application never overwrites the individual's details.

**UI** — new `/accounts` route plus `persona-switcher.tsx` mounted in the portal/dashboard; `/apply` gains an account selector; portal home groups commitments by account. Reviewer-facing lists join the persona for name/type display, falling back to the profile for legacy rows.
