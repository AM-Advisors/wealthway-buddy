# Least-privilege fund-manager authorization

Fund managers today can read *and* write compliance, payment, subscription, invitation and manager-assignment records directly through the data API, because those tables carry blanket "manager can do everything" rules. This pass makes managers read-only at the database level and moves every legitimate manager action into an authorized server workflow that re-checks who they are and which fund the record actually belongs to.

Administrator authority, Google sign-in, provider webhooks and the earlier administrator hardening are untouched.

## 1. Database: read-only for managers

A new forward migration (no historical files edited) drops and replaces the manager rules.

Dropped (manager, all operations):
`investor_applications`, `payments`, `subscriptions`, `accreditation_records`, `kyc_verifications`, `aml_screenings`, `investor_emails`, `admin_notes`, `fund_managers`, `fund_invitations`.

Replacement (manager, read only) — same scoping helpers, so managers still see exactly the funds they manage:
- `investor_applications`, `fund_managers`, `fund_invitations` → read where `private.manages_offering(offering_id)`
- `payments`, `subscriptions`, `accreditation_records`, `kyc_verifications`, `aml_screenings`, `investor_emails`, `admin_notes` → read where `private.can_review_application(application_id)`

Admin, owner/investor and service-role rules stay exactly as they are. No cascade/foreign-key changes in this pass.

`admin_notes` specifics: managers read notes on their funds only, cannot update or delete any note, and new notes are written server-side with the author and timestamp taken from the authenticated session — never from the browser.

## 2. Server workflows keep working

Every manager action that used to write directly now runs through a server function that, before writing, resolves the target record server-side, reads its real fund, and confirms the caller manages that fund (or is an administrator). Nothing trusts an id sent by the browser.

Functions hardened and switched to verified privileged writes:
- `admin.functions.ts` — application review decisions, review notes, investor emails, payment decisions
- `invitations.functions.ts` — invite, resend, revoke, remove access, manager assignment
- `access.functions.ts`, `admin-setup.functions.ts` — fund-access grants and removals
- `subscription.functions.ts` — subscription and commitment updates
- `closing.functions.ts`, `wire-requests.functions.ts` — closing and wire/payment confirmation steps
- `accreditation.functions.ts` — reviewer decisions (investor self-service paths unchanged)
- KYC/AML reviewer overrides

Every manager grant and removal is written to the activity log.

## 3. Invitation role whitelist

The invite workflow accepts only `investor` and `fund_manager`. Any other value — administrator, super admin, operations, compliance, legal, finance or any internal staff role — is rejected on the server with a clear refusal, regardless of what the browser sends. Administrators keep their existing broader ability to assign staff roles through the team access page.

## 4. Deletion and retention

This pass only removes managers' ability to delete applications. Separately we produce a written review of every record that hangs off an application — compliance evidence, payments, executed documents, audit trail, operational data — classified by retention category, with a proposed archive-first deletion policy for a later change. No cascade behaviour changes yet.

## 5. Tests

A new adversarial test suite covers: manager reads own fund, cannot read another fund; cannot directly change KYC, AML, accreditation, payments, subscription economics; cannot delete an application; cannot add or remove fund managers; cannot touch invitation rows; can add a note only via the server function; can invite an investor and a fund manager to their own fund; cannot invite admin/super-admin/operations/staff roles; cannot run any permitted action against another fund; investors and signed-out users cannot call manager actions; administrator workflows and provider webhooks still work. Existing suites must stay green.

## 6. What changes for people using the app

Nothing visible should break: the manager screens already go through server workflows. The one behaviour that genuinely ends is any direct database edit made outside the app — for example a script or API call using a manager's login to correct a payment, compliance result or fund assignment. Those must go through the app, an administrator, or a provider.

## Follow-up recommendation

Fund invitations currently reuse the platform-wide role list. A dedicated invitation role type limited to investor and fund manager would make this class of escalation impossible by construction. Proposed as a separate change.
