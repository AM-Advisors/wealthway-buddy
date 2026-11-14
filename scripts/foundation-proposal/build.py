from reportlab.lib.pagesizes import letter
from reportlab.platypus import BaseDocTemplate, PageTemplate, Frame, Paragraph, Spacer, Table, TableStyle, PageBreak, KeepTogether, NextPageTemplate, CondPageBreak
from reportlab.lib.styles import ParagraphStyle
from reportlab.lib import colors
from reportlab.lib.units import inch
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.lib.enums import TA_CENTER, TA_RIGHT

import os
F=os.environ.get('FONT_DIR','/tmp/ddq/fonts')+'/'
pdfmetrics.registerFont(TTFont('Pop', F+'Poppins-Regular.ttf'))
pdfmetrics.registerFont(TTFont('PopM', F+'Poppins-Medium.ttf'))
pdfmetrics.registerFont(TTFont('PopSB', F+'Poppins-SemiBold.ttf'))
pdfmetrics.registerFont(TTFont('PopL', F+'Poppins-Light.ttf'))
pdfmetrics.registerFont(TTFont('Rub', F+'Rubik-Medium.ttf'))
pdfmetrics.registerFont(TTFont('RubB', F+'Rubik-Bold.ttf'))
from reportlab.lib.fonts import addMapping
addMapping('Pop',0,0,'Pop'); addMapping('Pop',1,0,'PopSB'); addMapping('Pop',0,1,'PopL'); addMapping('Pop',1,1,'PopSB')

NAVY=colors.HexColor('#142647'); DEEP=colors.HexColor('#0B1730'); TEAL=colors.HexColor('#5DC6D1'); TEALD=colors.HexColor('#2A9DA9')
INK=colors.HexColor('#221F20'); MUTED=colors.HexColor('#5B6675'); ZEB=colors.HexColor('#EEF3F8'); TOT=colors.HexColor('#E3F5F7'); LINE=colors.HexColor('#D5DEE8')
W,H=letter; M=0.6*inch
LOGO=os.environ.get('LOGO','/tmp/fp/logo.png')
CLIENT='[Client Name]'

st=lambda **k: ParagraphStyle('x',**k)
body=st(fontName='Pop',fontSize=9,leading=13.5,textColor=INK,spaceAfter=5)
small=st(fontName='Pop',fontSize=7.8,leading=11,textColor=MUTED,spaceAfter=4,spaceBefore=5)
h1=st(fontName='RubB',fontSize=17,leading=22,textColor=NAVY,spaceBefore=6,spaceAfter=8,keepWithNext=1)
h2=st(fontName='Rub',fontSize=12,leading=16,textColor=TEALD,spaceBefore=8,spaceAfter=5)
h3=st(fontName='PopSB',fontSize=9.5,leading=13,textColor=NAVY,spaceBefore=8,spaceAfter=2,keepWithNext=1)
bul=st(fontName='Pop',fontSize=9,leading=13,textColor=INK,leftIndent=12,bulletIndent=2,spaceAfter=1.5)
sub=st(fontName='Pop',fontSize=8.5,leading=11.5,textColor=INK,leftIndent=14,bulletIndent=4,spaceAfter=0.5)
cell=st(fontName='Pop',fontSize=7.8,leading=10.5,textColor=INK)
cellb=st(fontName='PopSB',fontSize=7.8,leading=10.5,textColor=INK)
cellh=st(fontName='PopSB',fontSize=7.8,leading=10.5,textColor=colors.white)
cellr=st(fontName='Pop',fontSize=7.8,leading=10.5,textColor=INK,alignment=TA_RIGHT)
cellbr=st(fontName='PopSB',fontSize=7.8,leading=10.5,textColor=INK,alignment=TA_RIGHT)
cellhr=st(fontName='PopSB',fontSize=7.8,leading=10.5,textColor=colors.white,alignment=TA_RIGHT)

def H1(n,t): return [CondPageBreak(2.4*inch), Paragraph(f'<font color="#5DC6D1">{n}.</font> {t}',h1)]
def P(t,s=body): return Paragraph(t,s)
def B(items): return [Paragraph(i,bul,bulletText='•') for i in items]

def table(rows, widths, total=False, right=()):
    data=[]
    for ri,r in enumerate(rows):
        out=[]
        for ci,c in enumerate(r):
            if ri==0: s=cellhr if ci in right else cellh
            elif total and ri==len(rows)-1: s=cellbr if ci in right else cellb
            elif ci==0: s=cellb
            else: s=cellr if ci in right else cell
            out.append(Paragraph(str(c),s))
        data.append(out)
    t=Table(data,colWidths=widths,repeatRows=1)
    sty=[('BACKGROUND',(0,0),(-1,0),DEEP),('VALIGN',(0,0),(-1,-1),'MIDDLE'),
         ('TOPPADDING',(0,0),(-1,-1),4.5),('BOTTOMPADDING',(0,0),(-1,-1),4.5),('LEFTPADDING',(0,0),(-1,-1),6),('RIGHTPADDING',(0,0),(-1,-1),6),
         ('LINEBELOW',(0,1),(-1,-1),0.4,LINE)]
    for i in range(1,len(rows)):
        if i%2==0: sty.append(('BACKGROUND',(0,i),(-1,i),ZEB))
    if total:
        sty+= [('BACKGROUND',(0,len(rows)-1),(-1,len(rows)-1),TOT),('LINEABOVE',(0,len(rows)-1),(-1,len(rows)-1),1,TEAL)]
    t.setStyle(TableStyle(sty)); return t

def cover(c,d):
    c.saveState()
    steps=60
    for i in range(steps):
        f=i/steps
        col=colors.Color(0.04+0.05*(1-f),0.09+0.07*(1-f),0.19+0.12*(1-f))
        c.setFillColor(col); c.rect(0,H*(1-(i+1)/steps),W,H/steps+1,stroke=0,fill=1)
    lw=2.3*inch; c.drawImage(LOGO,(W-lw)/2,H-3.3*inch,lw,lw*242/1030,mask='auto')
    bx,by,bw,bh=0.8*inch,H/2-0.95*inch,W-1.6*inch,2.0*inch
    c.setFillColor(colors.HexColor('#0F3B48')); c.roundRect(bx-4,by-4,bw+8,bh+8,14,stroke=0,fill=1)
    c.setFillColor(colors.white); c.roundRect(bx,by,bw,bh,11,stroke=0,fill=1)
    c.setFillColor(DEEP); c.setFont('RubB',23); c.drawCentredString(W/2,by+bh-0.62*inch,'Building Your Nonprofit Foundation')
    c.setStrokeColor(TEAL); c.setLineWidth(2.2); c.line(W/2-0.45*inch,by+bh-0.8*inch,W/2+0.45*inch,by+bh-0.8*inch)
    c.setFillColor(MUTED); c.setFont('Pop',10); c.drawCentredString(W/2,by+bh-1.12*inch,'Client Proposal, Quote and Statement of Work: Formation, Compliance, Operations & Reporting')
    c.setFont('PopL',9); c.setFillColor(INK); c.drawCentredString(W/2,by+0.33*inch,'Your foundation, made easy.')
    y=2.55*inch
    for k,v in [('PREPARED FOR',CLIENT),('PREPARED BY','Harmonious'),('DATE','November 14, 2026  ·  Valid for 30 days, through December 14, 2026'),('VERSION','v4: adds the quote, Statement of Work and service terms')]:
        c.setFont('PopSB',7.5); c.setFillColor(TEAL); c.drawRightString(W/2-0.55*inch,y,k)
        c.setFont('Pop',9); c.setFillColor(colors.white); c.drawString(W/2-0.42*inch,y,v); y-=0.26*inch
    c.setFont('Pop',7.5); c.setFillColor(colors.HexColor('#B9C4D3')); c.drawCentredString(W/2,0.55*inch,'info@HarmoniousCapitalAdmin.com   |   harmonious.co')
    c.restoreState()

def page(c,d):
    c.saveState()
    c.setFillColor(DEEP); c.rect(0,H-0.62*inch,W,0.62*inch,stroke=0,fill=1)
    c.setFillColor(TEAL); c.rect(0,H-0.65*inch,W,0.03*inch,stroke=0,fill=1)
    lw=1.25*inch; c.drawImage(LOGO,M,H-0.48*inch,lw,lw*242/1030,mask='auto')
    c.setFont('Pop',7.8); c.setFillColor(colors.HexColor('#C9D3E0')); c.drawRightString(W-M,H-0.36*inch,'Nonprofit Foundation Proposal, Quote and Statement of Work')
    c.setFillColor(DEEP); c.rect(0,0,W,0.45*inch,stroke=0,fill=1)
    c.setFont('Pop',7); c.setFillColor(colors.HexColor('#C9D3E0'))
    c.drawString(M,0.18*inch,f'Confidential · prepared for {CLIENT}   |   info@HarmoniousCapitalAdmin.com   |   harmonious.co')
    c.setFont('PopSB',7.5); c.setFillColor(TEAL); c.drawRightString(W-M,0.18*inch,f'Page {d.page}')
    c.restoreState()

doc=BaseDocTemplate('/tmp/fp/build/out.pdf',pagesize=letter,leftMargin=M,rightMargin=M,topMargin=0.9*inch,bottomMargin=0.7*inch,
    title='Harmonious Nonprofit Foundation Proposal, Quote and Statement of Work v4',author='Harmonious')
fr=Frame(M,0.7*inch,W-2*M,H-1.6*inch,id='f')
doc.addPageTemplates([PageTemplate('cover',[Frame(M,M,W-2*M,H-2*M)],onPage=cover),PageTemplate('body',[fr],onPage=page)])
CW=W-2*M
s=[NextPageTemplate('body'),PageBreak()]

# 1 Executive summary
s+= [*H1(1,'Executive Summary'),
 P(f'Harmonious proposes to guide {CLIENT} through the complete creation of a tax-exempt nonprofit foundation, from incorporation and IRS 501(c)(3) recognition through the first full year of operations and compliance reporting. We prepare the paperwork, filings, governance documents and ongoing reports, and tell your officers exactly what to sign and where to file, so your board can focus on the mission.')]
kp=Table([[Paragraph('<font name="RubB" size="17" color="#142647">4 to 7 mo</font>',st(fontName='Pop',alignment=TA_CENTER)),Paragraph('<font name="RubB" size="17" color="#142647">$9,500</font>',st(fontName='Pop',alignment=TA_CENTER)),Paragraph('<font name="RubB" size="17" color="#142647">$1,250/mo</font>',st(fontName='Pop',alignment=TA_CENTER)),Paragraph('<font name="RubB" size="17" color="#142647">~$26K</font>',st(fontName='Pop',alignment=TA_CENTER))],
 [Paragraph(x,st(fontName='Pop',fontSize=7.5,textColor=MUTED,alignment=TA_CENTER)) for x in ['To IRS determination','Harmonious setup fee','Operating & reporting','Year-one total']]],colWidths=[CW/4]*4)
kp.setStyle(TableStyle([('BACKGROUND',(0,0),(-1,-1),ZEB),('LINEABOVE',(0,0),(-1,0),2,TEAL),('TOPPADDING',(0,0),(-1,-1),7),('BOTTOMPADDING',(0,0),(-1,-1),7),('LINEAFTER',(0,0),(-2,-1),0.5,colors.white)]))
s+=[kp,Spacer(1,10)]
s+=[table([['Item','Summary'],
 ['Entity','Illinois not-for-profit corporation, seeking federal 501(c)(3) public charity or private foundation status'],
 ['Timeline','About 4 to 7 months to IRS determination; operating support for 12 months'],
 ['Government fees','About $340 to $900 one-time, plus about $25 to $300 per year, passed through at cost'],
 ['Harmonious fees','$9,500 setup (five quoted parts) + $1,250/month operating and reporting retainer'],
 ['Who signs and files','Harmonious prepares everything. Your authorized officers, or your tax preparer, sign and file.'],
 ['Year-one total','About $25,760 to $26,450 (see Section 7)']],[1.4*inch,CW-1.4*inch]),Spacer(1,6),
 P('Fees, government charges and the Illinois jurisdiction are planning estimates; final amounts are confirmed in the signed Statement of Work (Section 9). Harmonious is not a law firm. Governing documents are reviewed by independent licensed counsel arranged by Harmonious where noted.',small)]

# 2 Setup
s+=[*H1(2,'Setup: Filing, Registration & Legal Documents'),CondPageBreak(1.4*inch),P('Phase A: Planning & Governance',h2)]
s+=B(['Mission, purpose statement and program design workshop','Public charity vs. private foundation analysis (funding sources drive classification)','Name availability search and reservation','Recruit or confirm the initial board (at least 3 directors in Illinois) and officers'])
s+=[CondPageBreak(1.4*inch),P('Phase B: Formation Filings & Documents',h2),
 table([['Document / Filing','Agency','Purpose','Signed and filed by','Gov. Fee'],
 ['Articles of Incorporation (Form NFP 102.10) with IRS-required purpose and dissolution clauses','Illinois Secretary of State','Creates the legal entity','Incorporator','$50'],
 ['Registered agent designation','IL Secretary of State','Official address for legal notices','Incorporator','$0 to $150/yr'],
 ['Bylaws','Internal (board adopts)','Governance rules, meetings, voting, officers','Board','None'],
 ['Conflict of Interest Policy','Internal','Required disclosure on Form 1023','Board','None'],
 ['Organizational board minutes','Internal','Adopt bylaws, elect officers, authorize bank and filings','Secretary','None'],
 ['Employer Identification Number (Form SS-4)','IRS','Federal tax ID for banking and filings','Responsible party','$0'],
 ['Form 1023 (or 1023-EZ if eligible)','IRS','Apply for 501(c)(3) tax exemption','Authorized officer','$600 ($275 EZ)'],
 ['Charitable registration (Form CO-1)','Illinois Attorney General','Required before soliciting donations','Authorized officer','$15'],
 ['Sales tax exemption (E-number, Form STAX-1)','Illinois Dept. of Revenue','Exempt purchases','Authorized officer','$0'],
 ['Local business or charitable permits (if any)','City / County','Varies by location','Authorized officer','$0 to $100'],
 ['Bank account and donor platform setup','Bank','Segregated nonprofit funds','Authorized signers','$0']],
 [1.95*inch,1.25*inch,1.6*inch,1.1*inch,CW-5.9*inch]),
 P('Harmonious prepares every item above and gives the signer a ready-to-sign copy with filing instructions. Harmonious never signs or files on the foundation\'s behalf.',small),
 CondPageBreak(1.4*inch),P('Phase C: Supporting Policies',h2)]
s+=B(['Whistleblower and document retention policies','Gift acceptance and donor privacy policies','Financial controls: dual signatures, expense approval, reimbursement','Grant-making policy (for private foundations)','Donation acknowledgment letter templates meeting IRS substantiation rules'])
s+=[CondPageBreak(2.6*inch),CondPageBreak(1.4*inch),P('Setup Cost',h2),
 table([['Component','Harmonious Fee','Government Fees'],
 ['Planning, governance & board orientation','$1,500','None'],
 ['Incorporation, EIN, registered agent setup','$1,000','$50 to $200'],
 ['Bylaws, policies & minutes (incl. attorney review)','$2,500','None'],
 ['IRS Form 1023 preparation & IRS correspondence','$3,500','$275 to $600'],
 ['State charity, tax exemption & local registrations','$1,000','$15 to $100'],
 ['Total setup','$9,500','$340 to $900 + buffer']],[CW-2.6*inch,1.2*inch,1.4*inch],total=True,right=(1,2))]

# 3 Timeline
s+=[*H1(3,'Timeline'),table([['Weeks','Phase','Key Deliverables','Owner'],
 ['1 to 2','Discovery & planning','Mission statement, classification decision, board roster','Harmonious + Client'],
 ['3 to 4','Incorporation','Articles and EIN application prepared; incorporator files; registered agent named','Harmonious prepares, Client files'],
 ['4 to 6','Governance','Bylaws, policies, organizational meeting minutes','Harmonious + Board'],
 ['6 to 8','Banking & state','Bank account, IL AG CO-1, accounting system','Harmonious + Client'],
 ['8 to 10','IRS application','Form 1023 prepared with financial projections; officer signs and submits','Harmonious prepares, Client files'],
 ['10 to 28','IRS review','Draft answers to IRS questions; 1023-EZ about 1 to 3 months, full 1023 about 3 to 6 months','Harmonious + Client'],
 ['After determination','Finalize exemptions','IL sales tax exemption, update AG file, donor communications','Harmonious prepares, Client files'],
 ['Months 1 to 12','Operating support','Monthly bookkeeping, board support, compliance calendar','Harmonious']],[1.1*inch,1.25*inch,CW-4.0*inch,1.65*inch]),Spacer(1,5),
 P('Exemption granted by the IRS is generally retroactive to the incorporation date when Form 1023 is filed within 27 months, so donations received during review can be tax-deductible.',small)]

# 4 Operating
s+=[*H1(4,'Operating Section'),P('Once formed, Harmonious provides a monthly operating retainer so the foundation runs smoothly from day one.'),
 KeepTogether(table([['Service','Description','Frequency'],
 ['Bookkeeping & fund accounting','Nonprofit chart of accounts, restricted vs. unrestricted funds, reconciliations','Monthly'],
 ['Donor & grant management','Gift recording, acknowledgment letters for approval, grant tracking','Ongoing'],
 ['Board support','Meeting agendas, draft minutes, governance calendar','Quarterly'],
 ['Budgeting','Annual budget and variance review','Annual / Quarterly'],
 ['Payroll & contractors (if any)','Setup, 1099s, W-2 coordination with the payroll provider','As needed'],
 ['Compliance calendar','Deadline tracking for all filings and renewals','Ongoing'],
 ['Insurance guidance','D&amp;O and general liability coverage review','At setup + annual']],[1.9*inch,CW-3.1*inch,1.2*inch])),Spacer(1,5),
 P('Estimated third-party operating costs (paid by the foundation): accounting software $30 to $90/mo, D&amp;O insurance $500 to $1,500/yr, donation processing 2 to 3% per transaction.',small)]

# 5 Reporting
s+=[*H1(5,'Reporting Section'),table([['Report','Agency / Audience','Due','Signed and filed by','Gov. Fee'],
 ['Form 990-N / 990-EZ / 990 / 990-PF','IRS','15th day of 5th month after fiscal year end','Officer or tax preparer','$0'],
 ['Annual Report (NFP 114.05)','IL Secretary of State','Before anniversary month of incorporation','Authorized officer','$10'],
 ['Annual Financial Report (AG990-IL)','IL Attorney General','Within 6 months of fiscal year end','Authorized officer','$15 to $100+ (by revenue)'],
 ['Independent review / audit','IL AG (if revenue thresholds met)','With AG990-IL','Independent CPA','Varies'],
 ['Forms 1099 / W-2','IRS / contractors / staff','January 31','Officer or payroll provider','$0'],
 ['Excise tax on investment income','IRS (private foundations only)','With 990-PF','Officer or tax preparer','1.39% of net investment income'],
 ['Monthly financial package','Board / Executive','10th of each month','Delivered by Harmonious','Included'],
 ['Annual impact report','Donors & public','Annually','Delivered by Harmonious','Included']],[1.75*inch,1.35*inch,1.55*inch,1.25*inch,CW-5.9*inch]),Spacer(1,5),
 P('Harmonious prepares each return and report before its deadline. The foundation\'s authorized officer, or its tax preparer, reviews, signs and files it, and the foundation pays any tax or fee.',small)]

# 6 Involvement
s+=[*H1(6,'Harmonious Involvement'),table([['Stage','Harmonious Role','Client / Board Role','Involvement'],
 ['Setup (Months 1 to 3)','Prepare all filings, draft documents, coordinate counsel, prepare the IRS application','Approve mission, recruit board, sign and file documents, provide budget','High: about 60 to 80 hrs'],
 ['IRS review','Monitor the application and draft answers to IRS questions','Approve and send answers; provide information','Low: as needed'],
 ['Operating (Months 1 to 12)','Bookkeeping, board support, compliance calendar','Run programs, fundraising, board oversight','Medium: 8 to 10 hrs/mo'],
 ['Reporting','Prepare all IRS and state reports for signature','Review, sign and file returns','Medium: peaks at year end']],[1.35*inch,2.25*inch,2.1*inch,CW-5.7*inch]),Spacer(1,5),
 P('A dedicated Harmonious engagement lead will be your single point of contact, with monthly check-in calls and a shared document portal.',small)]

# 7 Investment summary
s+=[*H1(7,'Total Investment Summary'),table([['Category','Low Estimate','High Estimate'],
 ['Harmonious setup fee (one-time)','$9,500','$9,500'],['Government formation fees (one-time)','$340','$900'],
 ['Harmonious operating & reporting retainer (12 × $1,250)','$15,000','$15,000'],['Annual government reporting fees (year one)','$25','$150'],
 ['Registered agent (if using Harmonious\' partner)','$0','$150'],['Contingency for state and local variance','$895','$750'],
 ['Total Year-One Investment','$25,760','$26,450']],[CW-2.6*inch,1.3*inch,1.3*inch],total=True,right=(1,2)),Spacer(1,5),
 P('Ongoing years: about $15,000 to $16,000 per year for operating and reporting support, plus government fees. Third-party costs (insurance, software, audit) are billed directly to the foundation and are not included above.',small)]

# 8 Quote
s+=[PageBreak(),*H1(8,'Quote'),
 P(f'Quote for {CLIENT} · Prepared November 14, 2026 · Valid through December 14, 2026 · Prices from the current Harmonious published rate card'),
 CondPageBreak(1.4*inch),P('Harmonious services',h2),
 table([['#','Service (quote line)','Billed','Qty','Unit price','Year-one amount'],
 ['1','Foundation formation: planning, governance and board orientation','Once','1','$1,500','$1,500'],
 ['2','Foundation formation: incorporation, EIN and registered agent setup','Once','1','$1,000','$1,000'],
 ['3','Foundation formation: bylaws, policies and minutes (with attorney review)','Once','1','$2,500','$2,500'],
 ['4','Foundation formation: IRS Form 1023 preparation and IRS correspondence','Once','1','$3,500','$3,500'],
 ['5','Foundation formation: state charity, tax exemption and local registrations','Once','1','$1,000','$1,000'],
 ['6','Foundation operating and reporting retainer','Monthly','12','$1,250','$15,000'],
 ['','Harmonious fees, year one','','','','$24,500']],[0.3*inch,CW-3.95*inch,0.7*inch,0.45*inch,1.0*inch,1.5*inch],total=True,right=(3,4,5)),
 Spacer(1,4),
 table([['Totals by billing','Amount'],['One-time setup fees (lines 1 to 5)','$9,500'],['Monthly retainer (line 6), beginning the month after incorporation','$1,250 per month'],['Annual equivalent of the retainer','$15,000']],[CW-1.6*inch,1.6*inch],right=(1,)),
 CondPageBreak(1.4*inch),P('Pass-through estimates (billed at cost, no markup)',h2),
 table([['Government and third-party item','Low','High'],
 ['Government formation fees: Articles, Form 1023 user fee, CO-1, local permits','$340','$900'],
 ['Annual government reporting fees (year one)','$25','$150'],
 ['Registered agent (if using Harmonious\' partner)','$0','$150'],
 ['Contingency for state and local variance','$895','$750'],
 ['Pass-through estimate, year one','$1,260','$1,950']],[CW-2.6*inch,1.3*inch,1.3*inch],total=True,right=(1,2)),
 Spacer(1,4),
 P('Payment terms: 50% of the setup fees are due at signing and 50% when Form 1023 is submitted. The retainer is billed monthly, beginning the month after incorporation. Invoices are due within 15 days. Card payments carry a 3.5% service fee; ACH and wire are free. Pass-through amounts are invoiced at cost when incurred. Prices at or above the rate card need no further approval; any lower price needs approval by the Harmonious CEO or CRO before this quote is final.',small)]

# 9 SOW
s+=[PageBreak(),*H1(9,'Statement of Work'),
 CondPageBreak(1.4*inch),P('9.1 Parties and governing agreement',h2),
 P(f'This Statement of Work is entered into between {CLIENT} (the "Foundation", or the "Client" before incorporation) and Harmonious ("Harmonious"). It is issued under, and incorporates, the Harmonious Master Services Agreement in force between the parties. A new client accepts the Master Services Agreement once, at its first signing, together with the Harmonious Privacy Policy and Terms & Conditions; signing this Statement of Work does not require re-signing the Master Services Agreement.'),
 P('The Master Services Agreement provides that Harmonious takes on a role only when a Statement of Work expressly lists it. This Statement of Work expressly lists the preparation services in 9.2. It does not appoint Harmonious as legal counsel, tax return signer or filer, trustee, director, officer, investment adviser, or signatory on any account.'),
 CondPageBreak(1.4*inch),P('9.2 Services',h2),
 P('Harmonious will provide the following services. Services not listed are not in scope and may be requested in writing through the portal.')]
import sys; sys.path.insert(0,os.path.dirname(os.path.abspath(__file__)))
from comps import COMPS, SOW_TERMS
for i,c in enumerate(COMPS,1):
    blk=[P(f'{i}. {c["name"]} · {c["price"]}',h3),P(f'<b>Scope.</b> {c["summary"]}')]
    for lab,key in [('Deliverables','deliverables'),('Included','included'),('Not included','excluded')]:
        blk.append(P(f'<b>{lab}</b>',st(fontName='Pop',fontSize=9,leading=12,textColor=INK,spaceBefore=2,spaceAfter=1)))
        blk+=[Paragraph(x,sub,bulletText='•') for x in c[key]]
    s.append(KeepTogether(blk))
s+=[CondPageBreak(1.4*inch),P('9.3 Fees and payment',h2),P('Fees are the quoted amounts in Section 8, fixed at execution. A later change to the Harmonious published rate card does not change them; any change needs a written amendment signed by both parties.')]
s+=[CondPageBreak(1.4*inch),P('9.4 Service terms',h2)]
s+=B([f'<b>{t}.</b> {b}' for t,b in SOW_TERMS])
s+=[CondPageBreak(1.4*inch),P('9.5 Responsibilities',h2),
 table([['Party','Responsibilities'],
 ['Board and directors','Approve the mission, classification, budgets, policies and grants; adopt governing documents; oversee the foundation; fiduciary duties to the foundation.'],
 ['Authorized officers','Review, sign and file the Articles, Form SS-4, Form 1023, state registrations, annual reports and returns; sign on bank accounts; approve payments.'],
 ['Tax preparer (if appointed)','Review, sign and file the foundation\'s tax returns when the board asks them to.'],
 ['Independent counsel','Review governing documents and give legal advice. Harmonious arranges the review; counsel acts independently.'],
 ['Harmonious','Prepare the documents, filings, returns and reports listed in 9.2 before their deadlines; keep the books and records; track the compliance calendar; tell the foundation what needs its decision, approval or signature.'],
 ['Client, all stages','Provide complete and accurate information and keep it current. Harmonious may rely on it without independent verification.']],[1.6*inch,CW-1.6*inch]),
 CondPageBreak(1.4*inch),P('9.6 Term, termination and records',h2)]
s+=B(['<b>Term.</b> Setup services run until the IRS determination and state registrations are complete. The retainer runs for 12 months from the month after incorporation and renews monthly after that unless either party ends it.',
 '<b>Termination.</b> Either party may end this Statement of Work on 60 days\' written notice. Fees for work done through the end date, and reasonable record-transfer costs, remain payable.',
 '<b>Records.</b> Harmonious keeps the records made under this Statement of Work under its published retention schedule and provides an export on request after termination.',
 '<b>Order of precedence.</b> The Master Services Agreement governs. Where this Statement of Work conflicts with it, this Statement of Work controls for this engagement only, and only to the extent of the conflict.',
 '<b>Amendment.</b> This Statement of Work may be changed only by a written amendment signed by both parties.'])

# Signature
sig=Table([[Paragraph('<b>Accepted by Client</b>',cellb),Paragraph('<b>Harmonious</b>',cellb)],
 [Paragraph('Signature: ______________________________',cell),Paragraph('Signature: ______________________________',cell)],
 [Paragraph('Name / Title: ___________________________',cell),Paragraph('Name / Title: ___________________________',cell)],
 [Paragraph('Date: __________________________________',cell),Paragraph('Date: __________________________________',cell)]],colWidths=[CW/2,CW/2])
sig.setStyle(TableStyle([('LINEABOVE',(0,0),(-1,0),1.5,TEAL),('TOPPADDING',(0,0),(-1,-1),9),('BOTTOMPADDING',(0,0),(-1,-1),5)]))
from disc import DISC
s+=[CondPageBreak(4.2*inch),*H1(10,'Acceptance'),P('By signing, the Client accepts this proposal, the quote in Section 8 and the Statement of Work in Section 9.'),sig,Spacer(1,10),
 P('Role disclaimer',h3)]+[P(x,small) for x in DISC]
s+=[CondPageBreak(1.4*inch),P('Next steps',h2)]+B(['Review and approve this proposal','Sign the Statement of Work (and the Master Services Agreement if this is your first Harmonious engagement) and schedule the discovery workshop','Confirm initial board members and the foundation name'])
doc.build(s)
