# Harmonious Security & Compliance Center — Foundation Pass

Scope: only the bounded first pass from section 33 of the brief. No automated evidence collection, no vendor integrations, no emails, no certification claims, no generated policy text, and no bulk generation of controls.

## 1. What exists today

**Routes**
- `/data-security`: a public, Harmonious-branded security statement. It covers product controls, how long records are kept, cookies and consent, a Cookie settings button, and a link to the platform trust center.
- `/ops/compliance`: the internal Compliance & Controls page. Its tabs are Controls, Evidence, Access Reviews, Privacy registers, Policies and CSA STAR.
- `/.well-known/trust.html`: the platform trust center. Lovable manages it, so we can't change it.

**Live data that must be preserved**
| Data | Rows |
|---|---|
| Controls (AC-01…, AR-01, LG-01, PR-01, DI-01…) | 22 |
| Control-to-framework mappings (SOC 2, GDPR, ISO) | 79 |
| Framework requirements | 38 |
| Control status history | 14 |
| Evidence items (private storage, second-person review) | 1 |
| Access review campaigns | 1 |
| Policies (POL-001 to POL-006, all Draft) | 6 |
| Retention rules (RS-001 to RS-006, Approved) | 6 |
| CSA STAR questions / answers | 0 / 0 (waiting on the CAIQ file) |

Privacy registers are also in place, all stored as versioned compliance records: data map, processing activities, rights requests, DPIAs, transfers, vendors, risks, incidents, exceptions, joiner/mover/leaver and privacy-by-design reviews.

**Current authorization**
- Server functions are gated by `administration.controls.view/edit` and the matching atomic permissions for each register.
- The compliance tables are append-only, and the client can't read them directly.
- Evidence is kept in a private bucket and opened through short-lived signed links.

**Reusable today**
- The register engine: one versioned record type per kind, with field specs and status rules.
- Evidence upload and review.
- The access review campaign and snapshot generators.
- The CSA STAR panel.
- The second-person / Super Admin self-approval path.
- The append-only history tables.

**Gaps against the brief**
- The control lifecycle uses 6 statuses; the brief asks for 13.
- Controls use their own IDs (AC-01), not HCA-domain-NNN.
- There is no framework record with version, scope, assessment period or auditor.
- There is no compliance scope.
- Risks have no inherent vs residual 5x5 scoring.
- Policies have no Review → Effective → Superseded lifecycle and no staff acknowledgment.
- Evidence has no expiration date, sensitivity level or link to systems.
- There is no publishing gate between internal records and `/data-security`.
- No one has a dedicated security or compliance role.

**Security risks found**
- `/data-security` contains one sentence nobody confirmed: "preparing for an independent SOC 2 Type I review". It will be removed unless Harmonious confirms it.
- Public content is hard-coded today. That is safe, but nothing stops someone from editing it into a certification claim.

## 2. What gets built

**A. Internal Security & Compliance Center** at `/ops/security-compliance`, with a left-hand section list:
- Overview, Frameworks, Controls, Evidence, Risks, Policies and Trust Center are built in this pass.
- Vendors, Assets & Systems, Access Reviews, Vulnerabilities, Incidents, Business Continuity, Privacy, Employees, Audits and Exceptions get a shell page. Where data already exists, the shell shows the existing register. The rest say "Planned — next phase".
- The current `/ops/compliance` redirects here. The existing STAR, Privacy and Access Review panels are reused as they are.
- The look stays restrained and audit-oriented: tables and status chips, nothing gamified.

**B. Canonical Control Library**
- Existing controls keep their records. Each gains a canonical ID (for example AC-01 becomes HCA-IAM-001), and the old key is kept as an alias.
- New fields: domain, executive owner, preventive/detective/corrective, manual/automated/hybrid, systems in scope, data classifications, last and next test, auditor notes and internal notes.
- The new 13-step lifecycle is added. The current statuses map onto it: designed becomes Remediation Planned, implemented becomes Implemented, operating becomes Operating Effectively, tested becomes Internal Review, exception becomes Exception, and remediation becomes Implementation In Progress.
- Two moves are restricted:
  - Reaching Operating Effectively requires reviewed evidence that is still current.
  - Auditor Verified can only be set from a recorded audit result.
- Every change is written to history, with the value before and after.

**C. Framework model**
- Framework records: framework, version, scope, applicability, assessment period, auditor or certification body, and status.
- Seeded with SOC 2, ISO/IEC 27001:2022, ISO/IEC 27701:2025, CSA CCM v4.1 / STAR and NIST CSF 2.0. Only identifiers and short titles are stored, never copyrighted standard text.
- Requirements belong to a framework. Existing SOC 2 and GDPR requirements are linked to it, and GDPR stays as a privacy framework.
- The control-to-requirement mapping table is reused. Coverage, gaps and readiness are calculated, never typed in.
- Certification status is a separate record, described in G.

**D. Compliance Scope**
- Scope items can be: legal entity, business unit, product, application, infrastructure, environment, data store, vendor, employee group, location or process.
- A framework assessment must point to a defined scope.
- One starter scope is created, "Harmonious Production Platform", empty for Harmonious to fill in.

**E. Evidence model**
- New fields on existing evidence: expiration/review date, sensitivity (Internal / Restricted / Highly Restricted), linked systems, collection method, links to specific requirements, and a file fingerprint.
- One evidence item can support many controls and many requirements.
- Every view and download is logged. Evidence is never shown in the Trust Center.

**F. Risk Register and 5x5 matrix**
- Risk fields: inherent likelihood and impact, residual likelihood and impact, treatment (Mitigate / Avoid / Transfer / Accept), owner, target date, review date, linked controls, affected systems and affected data.
- Residual scores must be entered and assessed explicitly. Linking a control never changes them.
- Accepting a risk needs an authorized approver (a second person, or a Super Admin with a reason) and an expiry date.
- The matrix shows inherent and residual risk side by side.
- Existing risk records are carried forward.

**G. Policy Library**
- Lifecycle: Draft → Review → Approved → Effective → Superseded → Retired.
- Approved versions are permanent; any edit creates a new version. Policies have an approver, version number and effective date, are linked to controls, and can require staff acknowledgment.
- An acknowledgment table is ready, but no requests are sent in this pass.
- The six existing draft policies stay as Drafts.
- All 21 required policy categories are listed. Missing ones show as gaps, and no policy text is generated.

**H. Executive Overview**
- Headline numbers: controls Operating Effectively, evidence still current, open high/critical risks, policies due for review, vendor reviews due, access reviews due, open incidents, and audit readiness.
- Charts: control effectiveness by domain, framework readiness, risk distribution (5x5).
- Every number is calculated from records; nothing is typed in.

**I. Trust Center publishing**
- New publishable items: assurance status per framework, security section text, and trust documents.
- Publishing states: Internal Only → Approved for Trust Center → Published → Withdrawn. Every state change is kept in history.
- Approval follows the same second-person or reasoned Super Admin rule.
- External assurance statuses are Planned, In Preparation, Assessment In Progress, Report Issued and Certified.
  - Report Issued and Certified require an issued audit record with the report or certificate attached as evidence, recorded by an authorized administrator.
  - No certification logo appears without that record.

**J. Restructured `/data-security`**
- Sections: Overview, Data Protection, Infrastructure & Cloud Security, Identity & Access, Application Security, Encryption, Business Continuity, Privacy, Vendor Risk, Compliance & Assurance, Security Contact, Trust Documents.
- Existing content moves into these sections. The retention and cookie sections are kept.
- "Compliance & Assurance" shows only Published assurance statuses. It falls back to "No external assessments completed yet" when none exist.
- Trust Documents lists only Published items, each marked Public, Login Required, NDA/Approval Required or Internal Only.
  - Visitors can request a document. A request creates a record for staff and grants nothing.
- The unconfirmed SOC 2 sentence is removed.

**K. Authorization**
- New capabilities: `security_compliance.view`, `security_compliance.manage`, `risk.manage`, `evidence.view`, `evidence.manage`, `audit.manage`, `trust_center.publish`.
- New roles: Security & Compliance Manager (all except publish) and Security & Compliance Viewer.
- Super Admin holds every capability.
- Sales, Fund Managers, clients and investors hold none.
- A Harmonious email address grants nothing by default.
- Existing `administration.controls.*` holders keep access through a compatibility mapping, so nobody loses access.
- All checks run on the server.

## 3. Technical details

**New tables** (all append-only or versioned, with GRANTs to `service_role` only, RLS enabled, reached through server functions):
- `compliance_frameworks`
- `compliance_scopes`, `compliance_scope_items`
- `compliance_control_details` (versioned extension of `compliance_controls`)
- `compliance_risk_assessments`
- `compliance_policy_versions`, `compliance_policy_acknowledgments`
- `compliance_evidence_details`, `compliance_evidence_access_log`
- `compliance_audits`
- `trust_publications`, `trust_publication_events`
- `trust_document_requests`
- `compliance_audit_log`

**Changes to existing tables**
- Additive only: nullable `framework_id` on `compliance_requirements` and a `canonical_id` alias on `compliance_controls`.
- Backfills run inside the same migration and only link records. No status is changed.

**Code layout**
- Pure model: `src/lib/security-compliance-model.ts` (lifecycle rules, risk scoring, readiness and assurance gating), with unit tests.
- Server functions: `src/lib/security-compliance.functions.ts`.
- Public reads: `src/lib/trust-center-public.functions.ts`, using the publishable-key client and narrow anon SELECT on published rows only.
- Pages: `src/routes/_authenticated/ops.security-compliance.*.tsx`.

**Possible breaking changes**
- The `/ops/compliance` URL becomes a redirect.
- Old control keys remain as aliases.
- The sidebar entry is renamed.

**Production data changed**
- New link rows and seeded framework and scope records only.
- No control status, evidence, policy or retention record is altered.

**Checks after the build**
- Unit tests, type check and a fresh production build.
- No emails sent and no certification status set.

## 4. Decisions needed from Harmonious
1. **SOC 2 sentence:** confirm or remove "preparing for an independent SOC 2 Type I review". It is removed by default.
2. **Staff roles:** who should hold Security & Compliance Manager and who should hold Viewer.
3. **Production platform scope:** what is in "Harmonious Production Platform" scope (filled in by you after the build).
