# Fund Team Access: manager-granted View-only and Assistant roles

## Goal
A Fund Manager can add a person to **their own Fund** as **Viewer** or **Assistant**, change or remove them, with no Harmonious approval step. Harmonious staff can still see the list and revoke access if needed (safety), but are not required to act.

## What each role can do

| | Viewer | Assistant |
|---|---|---|
| See Fund overview, setup progress, updates feed | Yes | Yes |
| See investor roster (names, stage, committed amount) | Yes | Yes |
| See approved documents and statements | Yes | Yes |
| Draft investor invitations / onboarding links (manager sends) | No | Yes (prepare only) |
| Prepare document sends and messages for manager review | No | Yes |
| Bank/wire details, tax IDs, KYC/identity evidence | No | No |
| Sign, approve, launch, fund, move money | No | No |
| Grant access to others | No | No |

Assistant actions are drafts; the Fund Manager sends/approves. A person can never be given more than the granting manager has.

## Manager experience
- New **Team access** box on the manager Fund page: list of people, role, granted by/when, status.
- **Add person**: email, role (Viewer / Assistant), optional end date. If they have no account, an invitation email is sent only when the manager clicks Send.
- **Change role** or **Remove** with a short reason. Removal takes effect on the next screen load; history stays.
- Granted users see only that Fund in a reduced Fund menu labelled with their role.

## Safety rules
- Manager must be an active Fund Manager on that exact Fund, checked on the server every time.
- Cannot grant to themselves, to investors in the same Fund via this path, or roles beyond Viewer/Assistant.
- Every grant, change and removal recorded in an append-only history.
- Access ends automatically if the granting manager is removed from the Fund (flagged for review, not silently transferred).

## Technical details
- New table `fund_team_grants` (offering_id, grantee_user_id/email, role enum `fund_viewer|fund_assistant`, granted_by, status, expires_at) + append-only `fund_team_grant_events` (trigger blocks update/delete). GRANTs + RLS: grantee reads own rows; managers read their Fund's rows; writes only via server functions (service role after checks).
- `src/lib/fund-team-access.ts` (pure role→atomic permission map, escalation check) with tests; `fund-team-access.functions.ts` for list/grant/change/revoke using `requireSupabaseAuth` and existing Fund Manager check.
- Feed the roles into existing authorization facts (`authorize.ts`) as fund-scoped atomic permissions; legacy checks stay authoritative, new roles run through shadow logging first per AGENTS.md, then enforce for the new read paths only.
- Manager Fund routes accept the new roles with masked/sensitive fields excluded server-side.
- Invite emails reuse the existing explicit-send invitation flow.
- Record the decision rule in `src/lib/AGENTS.md`. Unit tests for escalation, scoping, revocation, sensitive-field masking.
- No existing production records changed.
