import { describe, expect, it } from 'vitest';
import { fullTaxNumber, verifiedEin, verifiedSsn, redactTaxIdentifierEvidence } from './verified-tax-identifier';
const person = { legal_first_name: 'Jane', legal_last_name: 'Example', date_of_birth: '1980-02-03' };
const personal = () => ({ status: 'Approved', session_kind: 'user', id_verifications: [{ status: 'Approved', issuing_state: 'USA', first_name: 'Jane', last_name: 'Example', date_of_birth: '1980-02-03', verification_method: 'id_lookup', id_lookup: { outcome: 'match', comparison: [{ field: 'ssn', record: '123456789', provided: '123456789', result: 'match' }] } }] });
const business = () => ({ status: 'Approved', session_kind: 'business', registry_checks: [{ status: 'Approved', company: { status: 'Approved', is_from_registry: true, country_code: 'USA', company_name: 'Example Trust', tax_number: '12-3456789' } }] });
describe('approved verification tax identifiers', () => {
  it('keeps full SSNs and EINs out of callback history and stored review evidence', () => {
    const safe = redactTaxIdentifierEvidence({ session_id: 'fictional', decision: personal(), company: { tax_number: '12-3456789' }, ssn: '123456789' }) as Record<string, unknown>;
    expect(safe['session_id']).toBe('fictional');
    expect(JSON.stringify(safe)).not.toMatch(/123456789|12-3456789/);
    expect(JSON.stringify(safe)).toContain('Approved');
  });
  it('records a full explicitly matched individual SSN', () => expect(verifiedSsn(personal(), person)).toBe('123456789'));
  it('records a verified EIN only for the exact trust/company', () => {
    expect(verifiedEin(business(), { legal_name: 'Example Trust' })).toBe('123456789');
    expect(verifiedEin(business(), { legal_name: 'Other Trust' })).toBeNull();
  });
  it('never uses a document number or a partial/masked SSN', () => {
    expect(verifiedSsn({ status: 'Approved', id_verification: { ...person, status: 'Approved', issuing_state: 'USA', document_number: '123456789' } }, person)).toBeNull();
    for (const value of ['6789','***-**-6789','123456789X']) expect(fullTaxNumber(value)).toBeNull();
  });
  it('rejects pending and declined results', () => {
    expect(verifiedSsn({ ...personal(), status: 'In Review' }, person)).toBeNull();
    expect(verifiedEin({ ...business(), status: 'Declined' }, { legal_name: 'Example Trust' })).toBeNull();
  });
  it('does not borrow another person’s SSN or birthday', () => {
    expect(verifiedSsn(personal(), { ...person, legal_first_name: 'John' })).toBeNull();
    expect(verifiedSsn(personal(), { ...person, date_of_birth: '1981-02-03' })).toBeNull();
  });
  it('never substitutes registration numbers or foreign tax numbers for EINs', () => {
    expect(verifiedEin({ status: 'Approved', session_kind: 'business', registry_checks: [{ status: 'Approved', company: { status: 'Approved', is_from_registry: true, country_code: 'USA', company_name: 'Example Trust', registration_number: '123456789' } }] }, { legal_name: 'Example Trust' })).toBeNull();
    expect(verifiedEin({ ...business(), session_kind: 'user' }, { legal_name: 'Example Trust' })).toBeNull();
  });
  it('fails closed when approved checks disagree', () => {
    const d = personal();
    const first = d.id_verifications[0];
    if (!first) throw new Error('Missing fictional fixture');
    d.id_verifications.push({ ...first, id_lookup: { outcome: 'match', comparison: [{ field: 'ssn', record: '234567891', provided: '234567891', result: 'match' }] } });
    expect(() => verifiedSsn(d, person)).toThrow('conflicting tax numbers');
  });
});