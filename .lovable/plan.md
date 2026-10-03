# Harmonious Roles page, role hierarchy, Sales and Account Manager pages

## What you get
1. **Operations → Harmonious Roles** page listing every Harmonious staff member with their roles. Super admins (and the CEO) can assign or remove: Super admin, CEO, CRO, Sales management, Sales, Account Manager. Each change needs a reason and is logged permanently.
2. **Role hierarchy** (who can assign whom, and what each sees):

```text
Super admin  - everything, assigns any role
  CEO        - everything except Super admin; assigns CEO/CRO/Sales mgmt/Sales/AM
    CRO      - Sales + Account Management + pricing approvals; assigns Sales mgmt/Sales/AM
      Sales management - Sales pipeline, team, pricing approvals; assigns Sales/AM
        Sales           - own pipeline/CRM only (commercial data only)
        Account Manager - own assigned clients: health, funds, tasks, messages
```
   The side menu shows only the parts each role may see, and every page/server request re-checks the role.
3. **You:** your account (alyssa@harmonious.co) already holds Super admin and CEO (Executive). Confirmed and kept; nothing else changes.
4. **Sales page** (rebuilt): pipeline by stage, deals and value, my vs team view (team for Sales mgmt/CRO/CEO), leads, quotes/SOWs awaiting signature, pricing approvals queue, rep leaderboard. No investor tax, KYC or bank data.
5. **Account Manager page** (new): my clients with health score, open tasks, stuck funds, unanswered messages, renewals/billing status, 360 timeline link; managers see all AMs' books and can reassign clients.

## Safeguards
- Nobody can grant a role higher than their own or change their own roles; the last Super admin can't be removed.
- Privileged roles still require the Individual account classification.
- No money, filing or access is granted by Sales/AM roles beyond their pages.

## Technical details
- Migration: add `cro` and `account_manager` to `app_role`; `staff_role_events` append-only audit table (service_role only, RLS).
- `src/lib/harmonious-staff.ts`: map `cro` -> sales+management, `account_manager` -> account team; add `ROLE_RANK` + `canAssign(actorRoles, role)` pure helpers with unit tests.
- `src/lib/staff-roles.functions.ts`: list/assign/revoke via requireSupabaseAuth, server-checked hierarchy, writes `user_roles` with admin client after authorization, logs event; PRICE_APPROVER_ROLES gains `cro`.
- Routes: `ops.roles.tsx`, rebuild `sales.tsx`, new `account-manager.tsx`; account assignments reuse `client_team_assignments`.
- Menu gating in the Operations/Sales shells by role; AGENTS.md rule for the hierarchy.
