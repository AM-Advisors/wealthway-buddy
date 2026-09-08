# Investor Due Diligence Workspace

A secure diligence room that sits in front of the existing onboarding flow: an investor reviews the opportunity, signs an NDA, works through the materials, asks questions, and then moves straight into identity checks, accreditation, signing and funding — with everything they did preserved in their record.

Built for both fund/SPV raises and startup/company raises, in one build.

## What gets added

### Entities
A single entity record covers both a fund and an operating company. Existing funds are linked to an entity automatically, so nothing already live changes or is duplicated. Each entity has a name, logo, type (fund / SPV / operating company), and a current raise.

### Due Diligence navigation
A new "Due Diligence" area with tabs: Overview, Investor Access, Documents, Checklist, Questions & Requests, Activity, Settings. Admins and fund managers see it; managers only for entities they are assigned to.

### Overview (admin)
Header with entity logo, name, type, current raise, raise status, target, committed, funded, investor counts, diligence completion and last updated. Actions: Invite Investor, Upload Document, Add Diligence Item, Preview Investor View.

Cards for investor activity (invited → opened → reviewing → completed → onboarding → committed → funded), document activity (total, viewed, most viewed, recent, needing updates, missing) and open requests.

### Diligence structure
Sections and requirements are created automatically from a template chosen by entity type.

- Company: Company, Capitalization, Fundraising, Financial, Business, Legal, Team, Tax, Security & Compliance.
- Fund: Fund Overview, Manager/GP, Fund Documents, Economics, Track Record, Portfolio, Financial, Legal & Compliance, Service Providers, Tax.

Structured data (not just files) for fund economics, track record (investment, date, cost basis, current value, realized value, MOIC, IRR, status, realized/unrealized, gross/net) and portfolio holdings. Service providers list, with a "Administered by Harmonious" marker where the platform provides the service.

### Documents and versions
Every document keeps full version history: uploader, upload date, effective date, expiry, current vs archived. Old versions are never deleted. Admins can notify investors of an update. Files live in a new private storage area; investors only ever get short-lived signed links, never direct storage paths. Per-document controls: view-only, download blocked, watermark notice.

Documents that come from an authoritative platform record (executed subscription documents, KYC/AML results, offering terms, wire details) are shown as "Verified by Harmonious". Uploaded files never get that label.

### Checklist and readiness
Each requirement has category, description, responsible party, status (Not Started, Missing, In Progress, Ready for Review, Complete, Not Applicable), linked document, last updated, expiry, visibility and notes. Readiness is calculated overall and per category, with prioritised recommended actions and a clear note that it is not legal, investment, accounting or regulatory approval.

### Investor access, permissions, NDA
Invite by name, email, organization, investor type. Permission profiles: Standard Investor, Lead Investor, Institutional Diligence, Advisor/Attorney, Custom. Access can be granted or withheld at room, section and individual document level, with expiring access and revocation.

NDA gate: invitation → identity → NDA → room. In-app typed signature (matching the existing document-signing style), recording investor, NDA version, signed date, IP and device, document hash and the executed agreement PDF.

### Questions & Requests
Investors can ask a question, request a document, or request clarification. Each has category, assignee, status (New, Assigned, In Progress, Answered, Closed), response, attachments and dates. Admins can publish an answer as an FAQ visible to other authorized investors.

### Per-investor progress and activity
A table of investor, room access, NDA, documents reviewed, questions, diligence status, onboarding, commitment, funding. Clicking an investor opens their timeline. A separate immutable activity log records invitations, logins, NDA signatures, views, downloads, uploads, document changes, questions, responses, permission changes and revocations, filterable by investor, document, user, type and date, with an export.

### Investor room
A deliberately simpler experience: opportunity overview, executive summary, thesis, raise details, minimum, target, instrument, closing date, contact, and a clear path — Review Opportunity → Complete Due Diligence → Begin Investor Onboarding → Sign → Fund. On completion, a "Ready to Invest" panel hands off to the existing onboarding, which already covers identity, accreditation, subscription documents, signature, wire/ACH and funding.

### AI assistant readiness
No assistant is built now. Documents, structured records and permissions are stored so that a future assistant can answer only from what a given investor may see, with citations back to the source record. No new AI surface appears in this build.

## Technical notes

- New tables: `entities`, `diligence_rooms`, `diligence_sections`, `diligence_requirements`, `diligence_documents`, `document_versions`, `diligence_investors`, `investor_permissions`, `nda_agreements`, `nda_executions`, `diligence_questions`, `diligence_responses`, `diligence_faqs`, `diligence_activity`, `diligence_readiness`, `diligence_notifications`, plus `fund_economics`, `track_record_entries`, `portfolio_holdings`, `service_providers`. UUID keys, real foreign keys, `entity_id`, `created_by`, `created_at`, `updated_at` throughout; no JSON blobs where a relation belongs.
- RLS on every table, with security-definer helpers for "is admin", "manages this entity" and "has access to this room / section / document". Investor-facing reads go through server functions that re-check entity + user + investor + permission on each call; the UI never carries authorization on its own.
- Private storage bucket for diligence files; access only via short-lived signed URLs generated server-side after the permission check. Downloads are logged and can be blocked per document.
- New server functions in `src/lib/diligence*.functions.ts` (admin, investor, documents, questions, activity), following the existing authenticated-server-function pattern. Existing offering, application, signing, Box and email code is reused, not replaced.
- Routes: `/_authenticated/diligence/*` for admin and manager, `/_authenticated/room/$roomId/*` for investors, using existing design system components (cards, tables, badges, tabs, progress, dialogs) with the Harmonious palette and fonts, desktop-first and responsive, including empty, loading and error states.
- Every existing screen and flow stays as it is.

Given the size, the build proceeds in a set order — data model and security, then admin surfaces, then documents and versions, then access/NDA, then Q&A and activity, then the investor room and onboarding handoff — so each layer is checked before the next is added.
