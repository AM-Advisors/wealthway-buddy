import { describe, expect, it } from 'vitest';
import { assessmentGrade, canReadAssessment, publicationError, riskAssessment } from './report-card-model';
import { portfolioSummary } from './portfolio-workspace-model';
describe('portfolio and report cards',()=>{
 it('marks missing evidence unavailable',()=>expect(assessmentGrade([{label:'NAV',score:null,weight:1,evidence:''}])).toEqual({score:null,grade:'Not assessed',coverage:0}));
 it('uses V2.5 grade threshold 90 for A',()=>expect(assessmentGrade([{label:'NAV',score:90,weight:1,evidence:'review'}]).grade).toBe('A'));
 it('requires different approver without override',()=>expect(publicationError({sameAuthor:true,override:false,evidenceCount:1,metrics:[{label:'x',score:90,weight:1,evidence:'y'}]})).toBe('A different approver is required.'));
 it('requires evidence before publication',()=>expect(publicationError({sameAuthor:false,override:false,evidenceCount:0,metrics:[{label:'x',score:90,weight:1,evidence:'y'}]})).toMatch('Attach evidence'));
 it('hides diligence cards until NDA accepted',()=>expect(canReadAssessment({kind:'diligence',published:true,staff:false,manager:false,owner:false,investorVisible:true,diligenceAccess:true,ndaAccepted:false})).toBe(false));
 it('keeps investor cards owner-only',()=>expect(canReadAssessment({kind:'investor',published:true,staff:true,manager:true,owner:false,investorVisible:true,diligenceAccess:true,ndaAccepted:true})).toBe(false));
 it('scores all-four risk answers as aggressive',()=>expect(riskAssessment(Object.fromEntries(['horizon','drawdown','goal','liquidity','income','alt','experience','concentration','leverage','esg'].map(k=>[k,4])))).toMatchObject({score:100,profile:'Aggressive'}));
 it('does not sum mixed currencies',()=>expect(portfolioSummary([{id:'1',offeringId:'f',fundName:'',assetName:'',issuerName:'',assetClass:'',costCents:1,valueCents:1,effectiveDate:null,currency:'USD',monitoring:{}},{id:'2',offeringId:'f',fundName:'',assetName:'',issuerName:'',assetClass:'',costCents:1,valueCents:1,effectiveDate:null,currency:'EUR',monitoring:{}}]).valueCents).toBeNull());
});
