# Client onboarding: from invitation to a fund in the portal

A new client contact should not land in an empty portal. This adds a guided first run:
an administrator creates the contact, the contact signs in, tells us about their fund,
and only then does the portal open.

## The flow

```text
Admin invites contact  ->  Contact signs in  ->  Policies signed (already built)
   ->  Fund details form (new)  ->  Fund created  ->  Portal opens
```

1. **Admin creates the contact** — unchanged. Today's onboarding screen already invites a
   contact, gives them their role and sends the welcome email with a password link.
2. **The contact signs in** and accepts the current policies, as they do now.
3. **Fund details** — the first time a main contact reaches the portal, they see a short
   multi-step form instead of the portal. Nothing else is reachable until it is submitted.
4. **The fund is created immediately** from what they entered, attached to their
   organisation, and the portal opens with that fund on it.

## What the form asks

Four short steps, each one savable so they can come back to it:

- **Fund basics** — fund name, legal entity name, entity type, state of formation,
  formation date, and the kind of fund.
- **Offering terms** — exemption used (506(b) or 506(c) and the other supported types),
  target raise, minimum investment, and expected number of investors.
- **Key people and advisers** — general partner, authorised signatory, lawyer,
  accountant and bank contact (name, firm, email each).
- **Banking and tax** — EIN (or "we don't have one yet"), the bank the fund uses, and
  where distributions are paid from.

Only fund name, legal entity name, entity type and exemption are required to submit;
the rest can be left blank and completed later from the portal.

## Who has to complete it

General partner, authorised signatory, finance, legal and compliance contacts see the
form. View-only contacts skip it and go straight to the portal. Harmonious staff are
never shown it.

## What the fund looks like after submission

The fund appears right away for the client and for staff, but it starts **closed to
investors** and marked "Awaiting Harmonious review". A fund can only be opened once a
signed and approved statement of work covers it — that rule stays exactly as it is today.
If the organisation already has a signed, approved statement of work with no fund
attached, the new fund is linked to it automatically and no review flag is needed.

The client sees this plainly on their fund card: what they submitted, and that Harmonious
is setting the fund up. Staff see the same intake, in full, on the client's onboarding
record with a link to the fund.

## Technical notes

- New table `client_fund_intakes`: `client_id`, `offering_id`, `submitted_by`,
  `submitted_at`, `status` (draft / submitted / accepted), and a `details` jsonb holding
  the advisers, banking and tax answers, plus timestamps and an update trigger.
  GRANTs for `authenticated` and `service_role`; RLS so a client contact reads and writes
  only their own organisation's rows and staff with client-onboarding authority read all.
- New `src/lib/client-intake.functions.ts`:
  - `getIntakeRequirement` — returns whether the signed-in person owes an intake
    (their client, their contact role, any existing draft).
  - `saveFundIntakeDraft` — per-step save.
  - `submitFundIntake` — validates with Zod, inserts the `offerings` row with
    `is_open: false` and `client_id` set, links an eligible signed+approved SOW when one
    exists, stores EIN through the existing entity-details path, records the intake row,
    and writes an audit event. Runs under `requireSupabaseAuth`; privileged writes use the
    admin client loaded inside the handler after the caller's client membership is checked.
- New `src/components/client-intake-form.tsx` (stepper, brand styling) and
  `src/components/client-intake-gate.tsx`, mounted inside `/client` and `/client/invoices`
  around the existing content — the same shape as `PolicyGate`, and running after it.
- `src/components/client-onboarding-board.tsx` gains an intake column per contact and the
  submitted answers on the client's detail panel.
- Fund creation from the intake does not bypass any existing rule: opening the fund,
  fees, pricing and wires all still require the statement of work and approvals already
  in place.
