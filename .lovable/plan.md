# Professional Organizations, Delegated Access & Proxy Authority

Design only — nothing is built until you approve.

This extends the Person → KYC/AML → Investment Profile → KYB/Accreditation → Investment model so that lawyers, advisers, accountants, family offices and fund teams can act for their clients without ever becoming a global "role" in the system.

## The core idea

Five separate things, never collapsed into one:

1. **Identity** — the human being. One person record, forever, no duplicates.
2. **Affiliation** — the firm that person works through.
3. **Delegation** — the specific authorization a client granted.
4. **Scope** — exactly what that authorization covers.
5. **Authority** — whether they are looking, helping, or legally acting.

Being "a lawyer" grants nothing. Only a live delegation grants anything.

## Entity model

```text
Person ──< ProfessionalMembership >── ProfessionalOrganization
  │                                          │
  │ (principal)                              │
  └──< Delegation >───(delegate: Person)─────┘
              │
              ├─ scope_type: person | investment_profile | fund | investment | data_category
              ├─ scope_id
              ├─ authority_level
              ├─ effective / expires / status
              ├─ granted_by / revoked_by
              ├─ authority_document
              └──< DelegationPermission (one row per capability)

Person ──< InvestmentProfile ──< Investment >── Fund
```

Organization types: investment adviser/RIA, broker-dealer, law firm, CPA/accounting, family office, wealth manager, tax advisor, trustee/fiduciary, custodian, consultant, fund manager/GP, administrator, placement agent, other.

A professional may hold many delegations across many clients. A client may grant many delegations to many firms. Natural-person identity is never duplicated — a person can be principal in one delegation and delegate in another.

## Authority levels

| Level | Meaning | Requirements |
| --- | --- | --- |
| view | read only | client grant |
| assist | prepare/draft, cannot submit | client grant |
| limited_proxy | submit named non-financial actions | signed authorization on file |
| authorized_signatory | sign named documents | signed authorization + delegate identity verified |
| transaction_authority | initiate money movement | signed authorization + verified identity + staff counter-approval + dual approval at execution |

Authority is a ceiling, not a grant. Every action still needs its own permission row. General proxy never implies money movement.

## Permission matrix (deny by default)

Capabilities: view profile, edit permitted profile info, view investments, prepare investment, initiate investment, view documents, upload documents, view tax documents/K-1, view financial statements, view compliance status, assist KYC/KYB, assist accreditation, view capital calls, view distributions, view banking info, view wire instructions, sign specified documents, approve specified actions.

Minimum authority required per capability:

- view: all "view …" capabilities except banking info and wire instructions
- assist: edit permitted profile info, upload documents, prepare investment, assist KYC/KYB, assist accreditation
- limited_proxy: approve specified actions, view banking info
- authorized_signatory: sign specified documents
- transaction_authority: initiate investment, view wire instructions

Banking details, wire instructions and tax documents are additionally opt-in per delegation — never included in a "give my lawyer access" default.

## Authorization enforcement

Every privileged path resolves authority server-side:

1. Authenticate the human actor.
2. Load the resource by ID from the database — never trust a client-supplied scope.
3. Walk from that resource up to its owning profile/fund/principal.
4. Find a live delegation covering that principal and scope, not expired, not revoked.
5. Check the specific capability and the authority ceiling.
6. Only then perform the write, with a privileged client.

Database side: a `private.delegated_capability(actor, resource_type, resource_id, capability)` SECURITY DEFINER helper backs read policies on profiles, investments, documents, tax documents, statements, capital calls and distributions. Direct client writes stay closed; all delegated writes go through server functions. Banking and wire tables remain staff-only at the row level and are exposed only through audited server functions.

## Audit

Every delegated action records the full chain: human actor → organization → delegation → principal → profile/fund/investment → action → timestamp → result. Organization-level access never hides which employee acted.

## Acting On Behalf Of mode

Context is explicit and never silent. A persistent banner across the whole app reads "Acting on behalf of [Client / Profile / Fund]", with the firm name, the authority level, and an exit control. Any action beyond the active authority level is visibly disabled with the reason shown. Switching client context is a deliberate action and is logged.

## UI architecture

**Client Access Manager** (for the principal): who has access, their organization, their role, the profiles/funds/investments covered, what information they can see, what actions they can take, proxy authority level, effective and expiry dates, last activity, and a revoke control per delegation. Revocation takes effect immediately and notifies both sides.

**Professional Workspace** (for the firm): My Clients, Client Profiles, Funds, Investments, Documents, Tasks, Tax, Reporting, Activity. Every list is filtered by live delegations; nothing unauthorized is ever fetched, not merely hidden.

**Organization admin**: membership management, seat roles inside the firm, and a firm-wide activity log.

## Migration plan

Additive only, in phases:

1. Organizations, memberships, delegations, delegation permissions, enums, audit table. No behavior change.
2. Read helpers and RLS read policies for delegated access.
3. Professional Workspace and Acting On Behalf Of mode, view/assist levels only.
4. Client Access Manager with revocation.
5. Proxy levels: signatory, then transaction authority with dual approval.

Existing fund-manager and staff authorization is left exactly as it is; delegations sit alongside it. Nothing existing is dropped or renamed.

## Security implications

- Cross-client and cross-fund IDOR is the primary risk; every server function resolves the resource independently and is tested with a second unrelated tenant attempting substitution of profile, fund, investment, document and delegation IDs.
- Revoked and expired delegations must fail closed at the database layer, not just in the UI.
- Privilege escalation through delegation must be impossible: a delegation can never grant staff, admin or compliance roles, and a delegate cannot create delegations for themselves.
- Tax, banking, wire and executed legal documents get explicit opt-in and stronger authority than general viewing.
- Every proxy-level grant requires a stored authorization document; professional status alone is never sufficient.
