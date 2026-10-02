# Stakeholders becomes a full contacts list

## What changes
The **Stakeholders** page in the client's Cap Table sidebar becomes one list of every contact tied to the client: people already on the cap table and people who aren't, like counsel, accountants, board members and prospects.

## Columns
- Name (and title)
- Email
- Phone
- Status: **Active**, **Invited**, **Not invited**, **Inactive**
- Role tags, such as Investor, Founder, Employee, Advisor, Board, Counsel, Accountant or Signatory
- Ownership, taken read-only from the cap table: securities and fully diluted %, shown only when the person is a stakeholder
- Last activity, meaning the date of the last sign-in or invite
- Notes, shown as a short preview in the list. Click the preview to see the full text.

## Actions
- **Add contact**: name, email, phone, title, role tags and notes.
- **Edit** a contact. Name and email changes go into the change history.
- **Invite**: sends one invite email when clicked, never automatically. **Resend** shows once an invite exists. **Cancel invite** is also available.
- **Deactivate / Reactivate**: contacts are never deleted.
- Search, filters by status and role tag, and **Export CSV**.
- Click a row to open a side panel with full details, notes, invite history, ownership summary and an activity log.

## Other features worth adding
- **Duplicate warning**: if the email matches an existing person, the app suggests linking to them instead of creating a second record. It never merges them automatically.
- **Identity check badge** (verified or needed), reusing the existing identity check.
- **Primary contact** flag for each client.
- **Bulk invite** for selected contacts, with a confirmation step.

## Who can do what
- Client general partners and Harmonious staff can add, edit, invite and deactivate.
- Viewers can only read.
- Notes are visible only to the client team and Harmonious, never to the contact.

## Technical details
- Builds on the existing `client_contacts` table, which already has name, email, phone, title, notes, status and designations. Ownership comes from joining by `person_id` to the cap table stakeholders projection. Cap-table economics are never edited from this page.
- Add `invited_at`, `invite_count`, `last_invited_by` and `is_primary`. Add an append-only `client_contact_events` table for edits, invites and deactivations, with grants and row-level security scoped to client members and staff.
- New server functions in `src/lib/client-contacts.functions.ts` (list, create, update, invite, cancel invite, deactivate). All of them check roles on the server.
- Invites reuse the existing client invitation and email path. Email goes out only on an explicit click.
- Rewrite `StakeholdersScreen` in `company-360-screens.tsx` as the contacts table plus a side panel. The route stays the same.
- Add tests for permissions, the duplicate-email warning and invite idempotency.
