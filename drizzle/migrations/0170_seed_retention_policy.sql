-- Harmonious data retention policy: one approved retention record per record family.
-- Policy and workflow only - nothing is deleted automatically.

INSERT INTO public.compliance_records (kind, record_ref, version, title, status, data, change_reason) VALUES
('retention', 'RS-001', 1, 'Tax records (K-1s, filings, workpapers)', 'approved',
 jsonb_build_object('classification', 'Confidential', 'purpose', 'Tax preparation, filing and audit support', 'basis', 'IRS recordkeeping requirements', 'period', '7 years after the return is filed', 'trigger', 'Return filed', 'hold', false, 'disposition', 'archive', 'last_reviewed', '2026-10-07', 'next_review', '2027-10-07', 'disposition_requested', false),
 'Initial Harmonious retention policy'),
('retention', 'RS-002', 1, 'Fund formation and offering documents (PPM, operating agreement, subscriptions)', 'approved',
 jsonb_build_object('classification', 'Confidential', 'purpose', 'Evidence of fund terms and investor commitments', 'basis', 'Securities and fund recordkeeping obligations', 'period', 'Life of the fund plus 7 years after dissolution', 'trigger', 'Fund dissolved', 'hold', false, 'disposition', 'archive', 'last_reviewed', '2026-10-07', 'next_review', '2027-10-07', 'disposition_requested', false),
 'Initial Harmonious retention policy'),
('retention', 'RS-003', 1, 'Investor identity and KYC data', 'approved',
 jsonb_build_object('classification', 'Restricted', 'purpose', 'Identity verification and anti-money-laundering checks', 'basis', 'AML and financial recordkeeping obligations', 'period', '7 years after the investor relationship ends', 'trigger', 'Investor relationship ends', 'hold', false, 'disposition', 'archive', 'last_reviewed', '2026-10-07', 'next_review', '2027-10-07', 'disposition_requested', false),
 'Initial Harmonious retention policy'),
('retention', 'RS-004', 1, 'Fund books and accounting records', 'approved',
 jsonb_build_object('classification', 'Confidential', 'purpose', 'NAV, capital accounts and financial reporting', 'basis', 'Accounting and fund recordkeeping obligations', 'period', '7 years after the period the records cover', 'trigger', 'End of the accounting period', 'hold', false, 'disposition', 'archive', 'last_reviewed', '2026-10-07', 'next_review', '2027-10-07', 'disposition_requested', false),
 'Initial Harmonious retention policy'),
('retention', 'RS-005', 1, 'Signed agreements (MSA, SOW) and audit logs', 'approved',
 jsonb_build_object('classification', 'Confidential', 'purpose', 'Contractual evidence and append-only activity history', 'basis', 'Contract and legal recordkeeping', 'period', '7 years after the agreement ends; audit logs retained for the life of the platform', 'trigger', 'Agreement terminated', 'hold', false, 'disposition', 'retain_obligation', 'last_reviewed', '2026-10-07', 'next_review', '2027-10-07', 'disposition_requested', false),
 'Initial Harmonious retention policy'),
('retention', 'RS-006', 1, 'Marketing contacts and consent records', 'approved',
 jsonb_build_object('classification', 'Internal', 'purpose', 'Outreach with recorded consent', 'basis', 'Consent-based processing (privacy)', 'period', 'Until consent is withdrawn, then 3 years as proof of consent', 'trigger', 'Consent withdrawn', 'hold', false, 'disposition', 'delete', 'last_reviewed', '2026-10-07', 'next_review', '2027-10-07', 'disposition_requested', false),
 'Initial Harmonious retention policy');