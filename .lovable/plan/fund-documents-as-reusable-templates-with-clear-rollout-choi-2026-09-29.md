# Fund Documents as Reusable Templates, with Clear Rollout Choices

## Goal
Each Fund document (Operating Agreement, Subscription Agreement, PPM, other) is uploaded and set up **once** as the Fund's template. Every investor it applies to uses that one template automatically. When the document changes, the person making the change picks who gets the new version, with a plain choice instead of the current technical "Investor Impact" step.

## What changes for the user

### 1. One simple "Fund Documents" list
In Fund Setup → Offering Documents, each document shows as one row:

```text
Subscription Agreement   v3 (in use)   Signature   All investors   12 signed on v2 · 3 on v3 · 4 not sent   [Manage] [Replace]
```

- **Template status:** in use, draft, or needs setup.
- **Who it applies to:** "All investors" by default, or specific investor types or classes.
- **Usage counts:** how many investors signed each version, and how many are waiting.
- The existing four setup steps (Upload → Who it applies to → Signature blocks → Approve) stay, but they're only shown while setting up or replacing a document.

### 2. Template = used by everyone automatically
- Once a version is approved and in use, every new investor it applies to gets it automatically. Nothing is set up per investor.
- Signature blocks are set once on the template. They fill in each investor's own names and roles when their packet is sent.
- The same template is reused for every investor and every close. Nobody uploads it again.

### 3. "Replace document": who should get the new version?
Clicking **Replace** (or activating a new version) asks one question, showing the number of investors next to each option:

| Choice | What happens |
|---|---|
| **New investors only** (default) | New investors, and anyone not yet sent a document, get the new version. Anyone already sent or signed keeps their version. |
| **All investors** | Same as above, and everyone who already signed or received the old version is listed as needing to re-sign. Harmonious then sends each re-sign request with the existing send button. |
| **Only one investor** | The new version is used for that one investor only (for example, a side letter or a corrected copy). The Fund template doesn't change. |

Rules for every choice:
- Signed documents are never changed. Earlier versions stay in history.
- Nothing is emailed or sent automatically. Choices only mark who needs the new version; sending uses the existing controls.
- Before confirming, a summary shows exactly who is affected.

### 4. Fund managers
- Fund managers see the same list read-only, plus a **Request a change** button. They upload the proposed file, pick one of the three choices, and add a note.
- The request goes to Harmonious to review, set up signature blocks for, approve and put in use. This keeps the current rule that only Harmonious puts documents into use.

### 5. Per-investor view
On each investor's Investment, the document list shows which version applies to them and why ("Fund template v3", "Individual version v1", "Re-sign needed: v2 → v3").

## Out of scope
- Automatic sending or re-sending of signing requests.
- Changing documents that are already signed.
- Where fields sit on the page (still done in the signing provider's editor).

## Technical details
- **Rollout scope column:** add `rollout_scope` ('new_only' | 'all' | 'single'), `target_onboarding_id` and `note` to `offering_document_versions`.
  - 'single' versions never become `active_version`.
  - `investmentsForDocument` and the investor document resolver pick the per-investor override first, then the active template.
- **Re-sign tracking:** a new append-only table `offering_document_resign_items` (onboarding_id, document_id, from_version, to_version, status open/sent/signed/waived, actor, created_at).
  - Created when 'all' is chosen, for investors already sent or signed.
  - Feeds the existing readiness "next action" wording through `readiness-reasons.ts`, and triggers `reconcileInvestmentReadiness`.
- **Manager requests:** `offering_document_change_requests` (proposed file path, scope, target, note, requested_by, status, decided_by).
  - Staff turn a request into a new version via `uploadDocumentVersion`.
  - The requester can't approve their own request.
- **Activation:** `activateDocumentVersion` takes a `scope` instead of `impactAcknowledged`; `versionChangeImpact` supplies the counts shown in the dialog.
- **UI:** simplify `offering-documents-setup.tsx` into a compact list with a Replace dialog. Add a manager view to the Fund workspace Documents tab.
- **Tests:**
  - Resolving per-investor overrides.
  - Choosing 'all' creates re-sign items only for sent or signed investors.
  - Signed versions never change.
  - The requester can't approve their own change request.
