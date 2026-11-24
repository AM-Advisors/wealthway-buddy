# Questionnaire task links

Rule: financial background, subscription information and review/certify tasks must open the matching investor questions or their recorded review, not unrelated uploaded documents. Only the investor can certify their own answers.

## Places checked by reading code

| Place | Result |
| --- | --- |
| Shared `readiness-open-target.ts` | Fixed all three canonical keys: `bsa_aml`, `subscription_questionnaire`, `certifications`; they previously fell through to uploaded Documents. |
| `InvestorRecordPage`, used by Operations and manager investor routes | Its checklist delegates through `InvestorReviewPanel`. No separate permission changes or investor impersonation. |
| `InvestorReviewPanel`, embedded record and investor drawer | Fixed: opens the existing inner Documents review tab, expands questionnaire evidence, scrolls/focuses it. Missing evidence gets an explicit empty state. Existing accreditation and other actions remain separate; owner is preserved when delegated. |
| `InvestmentChecklist`, `AttentionNeeded`, `ReadinessSurface` | Shared labels/handlers; completion is still derived from canonical readiness. No completion or admission writes. |
| Fund readiness and Operations readiness drawer | No separate questionnaire View details handler; these are summaries linking to the investor record. |
| Investor `Sign` and `QuestionnaireForm` | Financial background lives inside Investor questionnaire; certifications use the existing separate Sign task. No new manager completion form. |
| `OnboardPortal` | Uses FinancialBackgroundPanel and SharedReviewAndSign; answers are already present in the investor flow. |
| `investorOutstandingTasks` | Fixed financial background grouping: Sign, not Verification. Existing locked/review checks remain. |
| InvestorDashboard, InvestmentTaskList, OutstandingInvestments, ClientNotificationBell | Use the shared dashboard task projection; investment links open canonical investor workspace. |
| ParticipantHome | Helpers enter their assigned investment; does not route to a financial certification form. Unchanged. |
| Investor journey/home action models | Canonical step selection; unchanged gates. |
| Investor progress-email drain | Sends canonical investment/manager record links, not separate financial-form links. No emails sent or changed. |
| Investor review evidence reader | Reads exact investment questionnaire responses and filters sensitive questions; no new private-data projection. |

Database functions do not select these browser destinations. No database policies, settings, permissions, answers, signatures, sent links, money or settled records were changed.

## Validation

- Regression tests cover each task key, the Sign destination, task locking, signing checklist and existing investor journey/sandbox rules.
- Temporary browser harness rendered the real InvestorReviewPanel against fictional responses, blocking backend requests. Each button expanded the questionnaire, displayed the saved fictional answer and focused its section. Desktop and 390px mobile screenshots inspected; no mobile overflow.
- Temporary harness removed after testing; no new example records or fixtures persisted.
- Kelby’s actual signed-in account was not exercised. Publishing and that live check remain pending; no resolution email sent.