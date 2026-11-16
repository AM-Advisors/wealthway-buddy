"""Counsel review draft: foundation Statement of Work with Harmonious as preparer.

Run: python3 scripts/foundation-sow/build_sow.py OUT.docx
Prices and service wording mirror the approved foundation rate card and
FOUNDATION_COMPONENTS; the preparer sections are a draft for counsel only and do
not change the platform's prepare-only wording.
"""
import os, sys
from docx import Document
from docx.shared import Pt, RGBColor, Inches, Cm
from docx.enum.text import WD_ALIGN_PARAGRAPH
from docx.enum.table import WD_TABLE_ALIGNMENT
from docx.oxml.ns import qn
from docx.oxml import OxmlElement

NAVY = RGBColor(0x14, 0x26, 0x47)
INK = RGBColor(0, 0, 0)
GREY = RGBColor(0x55, 0x55, 0x55)
LOGO = os.environ.get("LOGO", "/tmp/fp/logo.png")
DATE = "November 16, 2026"
VERSION = "Counsel review draft 1"

doc = Document()
for s in doc.sections:
    s.left_margin = s.right_margin = Inches(1)
    s.top_margin = Inches(0.9); s.bottom_margin = Inches(0.8)

st = doc.styles["Normal"]
st.font.name = "Poppins"; st.font.size = Pt(10); st.font.color.rgb = INK
st.element.rPr.rFonts.set(qn("w:eastAsia"), "Poppins")
st.paragraph_format.space_after = Pt(5); st.paragraph_format.line_spacing = 1.15
for lvl, size in ((1, 14), (2, 11.5)):
    h = doc.styles[f"Heading {lvl}"]
    h.font.name = "Rubik"; h.font.size = Pt(size); h.font.bold = True; h.font.color.rgb = NAVY
    h.element.rPr.rFonts.set(qn("w:asciiTheme"), "") if False else None
    rf = h.element.rPr.rFonts
    for a in ("w:ascii", "w:hAnsi", "w:eastAsia", "w:cs"):
        rf.set(qn(a), "Rubik")
    for a in ("w:asciiTheme", "w:hAnsiTheme", "w:eastAsiaTheme", "w:cstheme"):
        if rf.get(qn(a)) is not None:
            del rf.attrib[qn(a)]
    h.paragraph_format.space_before = Pt(14 if lvl == 1 else 10)
    h.paragraph_format.space_after = Pt(5)
    h.paragraph_format.keep_with_next = True

def shade(cell, hex_):
    tcPr = cell._tc.get_or_add_tcPr(); sh = OxmlElement("w:shd")
    sh.set(qn("w:val"), "clear"); sh.set(qn("w:color"), "auto"); sh.set(qn("w:fill"), hex_); tcPr.append(sh)

def para(text="", bold_lead=None, size=None, italic=False, color=None, align=None, after=None):
    p = doc.add_paragraph()
    if bold_lead:
        r = p.add_run(bold_lead + " "); r.bold = True
        if size: r.font.size = Pt(size)
    r = p.add_run(text); r.italic = italic
    if size: r.font.size = Pt(size)
    if color: r.font.color.rgb = color
    if align is not None: p.alignment = align
    if after is not None: p.paragraph_format.space_after = Pt(after)
    return p

def bullets(items, style="List Bullet"):
    for it in items:
        p = doc.add_paragraph(style=style); p.paragraph_format.space_after = Pt(2)
        if isinstance(it, tuple):
            r = p.add_run(it[0] + " "); r.bold = True; p.add_run(it[1])
        else:
            p.add_run(it)

def table(rows, widths, header=True, size=9):
    t = doc.add_table(rows=len(rows), cols=len(rows[0])); t.style = "Table Grid"
    t.alignment = WD_TABLE_ALIGNMENT.CENTER; t.autofit = False
    for col, w in zip(t.columns, widths):
        col.width = Inches(w)
    for i, row in enumerate(rows):
        trPr = t.rows[i]._tr.get_or_add_trPr(); cs = OxmlElement("w:cantSplit"); trPr.append(cs)
        for j, val in enumerate(row):
            c = t.cell(i, j); c.width = Inches(widths[j]); c.text = ""
            p = c.paragraphs[0]; p.paragraph_format.space_after = Pt(1)
            r = p.add_run(str(val)); r.font.size = Pt(size)
            if i < len(rows) - 1:
                p.paragraph_format.keep_with_next = True
            if header and i == 0:
                r.bold = True; r.font.color.rgb = RGBColor(0xFF, 0xFF, 0xFF); shade(c, "142647")
    doc.add_paragraph().paragraph_format.space_after = Pt(2)
    return t

def counsel(text):
    p = doc.add_paragraph(); p.paragraph_format.left_indent = Cm(0.6)
    r = p.add_run("[Counsel note: " + text + "]"); r.italic = True; r.font.size = Pt(9); r.font.color.rgb = GREY

# Header / footer
sec = doc.sections[0]
hp = sec.header.paragraphs[0]
hr = hp.add_run(f"Harmonious · Foundation Statement of Work · {VERSION} · {DATE} · Not for client distribution")
hr.font.size = Pt(7.5); hr.font.color.rgb = GREY; hp.alignment = WD_ALIGN_PARAGRAPH.RIGHT
fp = sec.footer.paragraphs[0]; fp.alignment = WD_ALIGN_PARAGRAPH.CENTER
fr = fp.add_run("Confidential · Prepared for review by counsel · Not effective until signed by both parties · Page ")
fr.font.size = Pt(7.5); fr.font.color.rgb = GREY
for kind, txt in (("begin", None), (None, "PAGE"), ("end", None)):
    r = fp.add_run(); r.font.size = Pt(7.5); r.font.color.rgb = GREY
    if kind:
        e = OxmlElement("w:fldChar"); e.set(qn("w:fldCharType"), kind); r._r.append(e)
    else:
        e = OxmlElement("w:instrText"); e.set(qn("xml:space"), "preserve"); e.text = txt; r._r.append(e)

# Title block
if os.path.exists(LOGO):
    doc.add_picture(LOGO, width=Inches(1.7))
t = doc.add_paragraph(); r = t.add_run("Statement of Work"); r.font.name = "Rubik"; r.font.size = Pt(22); r.bold = True; r.font.color.rgb = NAVY
t.paragraph_format.space_after = Pt(0)
t = doc.add_paragraph(); r = t.add_run("Nonprofit Foundation Formation, Tax Preparation, Operations and Reporting"); r.font.name = "Rubik"; r.font.size = Pt(12.5); r.font.color.rgb = NAVY
table([
    ["Client", "[Foundation legal name] (the \"Foundation\"; before incorporation, its founders acting for it)"],
    ["Provider", "Harmonious (\"Harmonious\")"],
    ["Governing agreement", "Harmonious Master Services Agreement in force between the parties"],
    ["Draft", f"{VERSION}, {DATE}"],
    ["Effective date", "[Date of last signature]"],
], [1.6, 4.9], header=False)

box = doc.add_table(rows=1, cols=1); box.style = "Table Grid"; c = box.cell(0, 0); shade(c, "E8F6F8")
c.text = ""
p = c.paragraphs[0]; r = p.add_run("About this draft"); r.bold = True; r.font.color.rgb = NAVY
for line in (
    "This draft changes the approved proposal (v4, November 14, 2026) in one respect: Harmonious acts as the preparer of the Foundation's Form 1023 and of its annual Form 990 series returns, and an individual at Harmonious signs those returns as paid preparer where the form has a paid preparer section.",
    "The Foundation's authorized officer still signs each application and return for the Foundation, and the Foundation still pays its own taxes and fees. Section 4.4 offers two filing options for counsel to choose between.",
    "Prices, services and payment terms are the approved list prices from the proposal. Items in square brackets and the questions in Appendix A are for counsel. The Master Services Agreement is not changed by this draft.",
):
    q = c.add_paragraph(line); q.paragraph_format.space_after = Pt(3)
    for rr in q.runs: rr.font.size = Pt(9)
doc.add_paragraph()

# 1
doc.add_heading("1. Parties and governing agreement", 1)
para("1.1 This Statement of Work is entered into between the Foundation and Harmonious. It is issued under, and incorporates, the Harmonious Master Services Agreement in force between the parties (the \"MSA\"). A new client accepts the MSA once, at its first signing, together with the Harmonious Privacy Policy and Terms & Conditions. Signing this Statement of Work does not require signing the MSA again.")
para("1.2 The MSA provides that Harmonious takes on a role only when a Statement of Work expressly lists it. This Statement of Work expressly appoints Harmonious to prepare the documents, applications, registrations, returns and reports listed in Section 3, and to act as paid preparer of the returns described in Section 4.")
para("1.3 This Statement of Work does not appoint Harmonious as the Foundation's legal counsel, trustee, director, officer, investment adviser, fiduciary or signatory on any account, and does not authorize Harmonious to sign any application, return or declaration on the Foundation's behalf.")

# 2
doc.add_heading("2. Definitions", 1)
bullets([
    ("Authorized Officer:", "an officer, director or trustee of the Foundation authorized by its board to sign the relevant application, return or registration."),
    ("Application:", "IRS Form 1023, or Form 1023-EZ where the Foundation is eligible and the board chooses it, with its schedules and attachments."),
    ("Return:", "the Foundation's annual federal information return for a fiscal year: Form 990, 990-EZ or 990-PF, and the Form 990-N electronic notice where the Foundation qualifies for it, with required schedules."),
    ("State Reports:", "the state charitable annual financial report and the state corporate annual report (in Illinois, Form AG990-IL and Form NFP 114.05)."),
    ("Signing Preparer:", "an individual employed by Harmonious who holds a current IRS Preparer Tax Identification Number (PTIN) and is designated by Harmonious to sign a Return as paid preparer."),
    ("Filing Deadline:", "the due date of a Return, including any extension obtained with IRS Form 8868."),
])

# 3 Services
doc.add_heading("3. Services", 1)
para("Harmonious will provide the following services. Services not listed are not in scope and may be requested in writing through the Harmonious portal.")
services = [
    ("3.1 Formation planning, governance and board orientation", "$1,500 one-time",
     "Mission and program design workshop, public charity or private foundation analysis, name search, and orientation for the initial board and officers.",
     ["Mission and purpose statement", "Public charity or private foundation analysis for the board's decision", "Name availability search and reservation request, ready to sign", "Initial board and officer roster"],
     ["Legal advice, which comes from licensed counsel", "Recruiting directors for the Foundation", "Signing or filing anything for the Foundation"]),
    ("3.2 Incorporation, EIN and registered agent setup", "$1,000 one-time",
     "Prepare the Articles of Incorporation with the purpose and dissolution clauses the IRS requires, the EIN application and the registered agent designation.",
     ["Articles of Incorporation, ready for the incorporator to sign and file", "EIN application (Form SS-4), ready for the responsible party to sign", "Registered agent designation"],
     ["Signing or filing the Articles or Form SS-4: the incorporator and responsible party sign and file", "Government filing fees, billed at cost with no markup", "Registered agent annual fees, paid by the Foundation"]),
    ("3.3 Bylaws, policies and organizational minutes", "$2,500 one-time",
     "Bylaws, conflict of interest policy, supporting policies and organizational board minutes, reviewed by independent licensed counsel arranged by Harmonious.",
     ["Bylaws and conflict of interest policy", "Whistleblower and document retention policies", "Gift acceptance and donor privacy policies", "Financial controls policy: dual signatures, expense approval, reimbursement", "Grant-making policy (private foundations)", "Donation acknowledgment letter templates", "Organizational board minutes"],
     ["Legal advice from Harmonious, which is not a law firm", "Adopting the documents: the board adopts them"]),
    ("3.4 IRS Form 1023 preparation and IRS correspondence", "$3,500 one-time",
     "Harmonious prepares the Application, as described in Section 4.3, and helps the Foundation answer IRS questions until a determination is issued.",
     ["Application with narrative, financial history or projections and required schedules, ready for an Authorized Officer to sign", "Form 1023-EZ eligibility review", "Draft answers to IRS questions for the Foundation's approval"],
     ["Signing the Application or its declaration: an Authorized Officer signs", "Representing the Foundation before the IRS, except as Section 4.8 allows", "Any promise of IRS approval or timing", "The IRS user fee, paid by the Foundation"]),
    ("3.5 State charity, tax exemption and local registrations", "$1,000 one-time",
     "Prepare the state charitable registration, the state sales tax exemption application after the IRS determination, and any local permits.",
     ["State charitable registration (in Illinois, Form CO-1), ready to sign", "State sales tax exemption application (in Illinois, Form STAX-1), ready to sign", "List of local permits with applications prepared"],
     ["Signing or filing any registration: an Authorized Officer signs and files", "State and local fees, billed at cost with no markup"]),
    ("3.6 Operating, tax preparation and reporting retainer", "$1,250 per month",
     "Monthly bookkeeping and fund accounting, donor and grant records, board support, budgeting, a compliance calendar, preparation of each Return as paid preparer under Section 4, and preparation of the State Reports.",
     ["Monthly financial package by the 10th", "Restricted and unrestricted fund accounting", "Gift records and acknowledgment letters for approval", "Quarterly board agendas and draft minutes", "Annual budget and quarterly variance review", "Compliance calendar for every filing and renewal", "Each Return for each fiscal year in the term, prepared and signed by a Signing Preparer where the form has a paid preparer section", "Form 8868 extension request when needed, ready for an Authorized Officer to sign", "State Reports, prepared for an Authorized Officer to sign", "Forms 1099 and W-2 coordinated with the payroll provider", "Annual impact report"],
     ["Signing a Return or State Report for the Foundation: an Authorized Officer signs", "Form 990-T, amended Returns, prior-year Returns and IRS examinations, quoted separately", "Paying taxes, fees, penalties or grants", "Audit or independent review by a CPA", "Investment advice", "Software, insurance and payment processing costs, paid by the Foundation"]),
]
for title, price, scope, deliver, excluded in services:
    doc.add_heading(f"{title} · {price}", 2)
    para(scope, bold_lead="Scope.")
    para("", bold_lead="Deliverables", after=1); bullets(deliver)
    para("", bold_lead="Not included", after=1); bullets(excluded)

# 4 Preparer
doc.add_heading("4. Harmonious as preparer", 1)
para(bold_lead="4.1 Appointment.", text="The Foundation engages Harmonious to prepare the Application and, for each fiscal year that ends during the term, the Foundation's Return. Harmonious accepts the engagement on the terms in this Section 4.")
para(bold_lead="4.2 Signing as paid preparer.", text="For each Return that has a paid preparer section, a Signing Preparer reviews the completed Return and signs that section, with the Signing Preparer's PTIN and the Harmonious firm name, address and EIN. The Signing Preparer signs only as preparer. Form 990-N has no preparer section: Harmonious prepares the information and the Authorized Officer submits it.")
counsel("confirm the signing and PTIN wording, and whether Harmonious should designate named Signing Preparers in a schedule.")
para(bold_lead="4.3 Application.", text="Harmonious prepares the Application from information the Foundation provides. The Application has no paid preparer signature: an Authorized Officer reviews it, signs the declaration under penalties of perjury, submits it through the IRS online filing system and pays the user fee from the Foundation's account. Where the IRS asks who prepared the Application or who was paid to help with it, the Foundation will identify Harmonious.")
para(bold_lead="4.4 Filing.", text="Before any Return is filed, an Authorized Officer reviews it and signs the officer's declaration, including the IRS e-file signature authorization (Form 8879-TE) when the Return is filed electronically. Harmonious never signs the officer's declaration. The Return is then filed as follows:")
bullets([
    ("Option A (Foundation files):", "the Foundation files the signed Return through its own IRS account or an authorized e-file provider it chooses. Harmonious gives the Foundation a complete, final Return and filing instructions."),
    ("Option B (Harmonious transmits):", "Harmonious, acting as an authorized IRS e-file provider, transmits the Return only after it receives the Authorized Officer's signed Form 8879-TE for that exact Return, and gives the Foundation the IRS acknowledgment. Harmonious never transmits a Return that has not been signed and authorized."),
])
counsel("choose Option A or Option B. Option B needs confirmation that Harmonious is an authorized IRS e-file provider for exempt organization returns. Option A matches the approved proposal.")
para(bold_lead="4.5 Extensions.", text="When the Foundation's information will not be complete in time, Harmonious prepares Form 8868 for the Authorized Officer to sign and file (or, under Option B, transmit after signature) before the original due date. An extension extends the time to file, not the time to pay any tax.")
para(bold_lead="4.6 Preparation standards.", text="Harmonious prepares each Return and the Application from the Foundation's books, records and information. Harmonious asks reasonable questions when information appears incorrect, incomplete or inconsistent, but does not audit or independently verify it. Harmonious will not sign a Return as preparer if it believes the Return takes a position without adequate support or contains a statement it knows to be false, and may decline to sign or withdraw from preparing that Return after telling the Foundation why.")
para(bold_lead="4.7 Copies and records.", text="Harmonious gives the Foundation a complete copy of each Return and the Application as filed, and keeps its own copy and workpapers for at least three years after the Return's due date, or longer under the Harmonious published retention policy.")
para(bold_lead="4.8 IRS questions and representation.", text="Harmonious drafts answers to IRS letters and questions about the Application or a Return for the Foundation's approval, and the Authorized Officer sends them. Harmonious contacts the IRS on the Foundation's behalf only under a signed IRS authorization: Form 8821 for access to information, or Form 2848 naming an individual eligible to represent taxpayers before the IRS. Examinations and appeals are not included and are quoted separately.")
counsel("confirm which Harmonious individuals, if any, are eligible to be named on Form 2848, and whether the $3,500 Application fee should cover representation.")
para(bold_lead="4.9 Foundation responsibilities.", text="The Foundation is responsible for the accuracy and completeness of the information it provides, its books and records, and its decisions, including disclosure of compensation, related party transactions, grants, lobbying and political activity, and unrelated business income. The Foundation will provide year-end records within [60] days after its fiscal year end and return its approval and signatures at least [10] business days before the Filing Deadline. Harmonious is not responsible for late filing caused by late information, late approval or late signature or filing by the Foundation.")
para(bold_lead="4.10 Taxes and penalties.", text="The Foundation pays any tax shown on a Return, including excise tax on a private foundation's net investment income, and any fee or penalty assessed against it. Harmonious does not pay the Foundation's taxes, fees or penalties.")
counsel("advise whether Harmonious should bear interest and penalties caused solely by its own preparation error, and how that fits the MSA limitation of liability.")

# 5 Fees
doc.add_heading("5. Fees and payment", 1)
table([
    ["#", "Service", "Billed", "Amount"],
    ["1", "Formation planning, governance and board orientation", "Once", "$1,500"],
    ["2", "Incorporation, EIN and registered agent setup", "Once", "$1,000"],
    ["3", "Bylaws, policies and organizational minutes (with attorney review)", "Once", "$2,500"],
    ["4", "IRS Form 1023 preparation and IRS correspondence", "Once", "$3,500"],
    ["5", "State charity, tax exemption and local registrations", "Once", "$1,000"],
    ["6", "Operating, tax preparation and reporting retainer", "Monthly", "$1,250 per month"],
    ["", "Setup total (lines 1 to 5)", "", "$9,500"],
    ["", "Year one total (setup plus 12 months of retainer)", "", "$24,500"],
], [0.35, 4.0, 0.8, 1.35])
bullets([
    "Fees are fixed at signing. A later change to the Harmonious published rate card does not change them; any change needs a written amendment signed by both parties.",
    "50% of the setup total is due at signing and 50% when the Application is submitted. The retainer is billed monthly, beginning the month after incorporation.",
    "Preparation and paid preparer signature of each Return within the term are included in the retainer, with no separate return fee.",
    "Government filing, registration and user fees are paid by the Foundation or passed through at cost with no markup.",
    "Invoices are due within 15 days. Card payments carry a 3.5% service fee; ACH and wire are free.",
])

# 6 Terms
doc.add_heading("6. Service terms", 1)
bullets([
    ("Preparer, not signer for the Foundation.", "Harmonious prepares the Foundation's formation documents, Application, registrations, Returns and State Reports. A Signing Preparer signs Returns only as paid preparer. An Authorized Officer signs each document for the Foundation."),
    ("Legal review.", "Governing documents are reviewed by independent licensed counsel arranged by Harmonious. Harmonious is not a law firm and does not give legal advice."),
    ("IRS determination.", "The IRS decides whether to recognize the Foundation's exemption and how long its review takes. Harmonious does not promise approval or timing. When the Application is filed within 27 months after incorporation, recognition is generally effective from the incorporation date."),
    ("Third-party costs.", "Accounting software, insurance, payment processing, audits and registered agent fees are paid directly by the Foundation."),
    ("Money and decisions.", "Harmonious does not hold Foundation funds, sign on Foundation bank accounts, pay taxes, or approve or release grants or payments. Decisions stay with the board."),
])

# 7 Responsibilities
doc.add_heading("7. Responsibilities", 1)
table([
    ["Party", "Responsibilities"],
    ["Board and directors", "Approve the mission, classification, budgets, policies and grants; adopt governing documents; oversee the Foundation; fiduciary duties to the Foundation."],
    ["Authorized Officers", "Review and sign the Articles, Form SS-4, the Application, Returns (including Form 8879-TE), Form 8868, registrations and State Reports; file them under Option A; sign on bank accounts; approve and make payments."],
    ["Independent counsel", "Review governing documents and give legal advice. Harmonious arranges the review; counsel acts independently."],
    ["Harmonious", "Prepare the items in Section 3 before their deadlines; sign Returns as paid preparer through a Signing Preparer; keep the books, copies and workpapers; track the compliance calendar; tell the Foundation what needs its decision, approval or signature; transmit signed Returns only under Option B."],
    ["Foundation, all stages", "Provide complete and accurate information on time and keep it current. Harmonious may rely on it without independent verification."],
], [1.6, 4.9])

# 8 Term
doc.add_heading("8. Term, termination and records", 1)
bullets([
    ("Term.", "Setup services run until the IRS determination and state registrations are complete. The retainer runs for 12 months from the month after incorporation and renews for 12-month periods unless either party gives notice."),
    ("Termination.", "Either party may end this Statement of Work on 60 days' written notice. Fees for work done through the end date remain due."),
    ("Returns in progress.", "On termination, Harmonious delivers the books, workpapers and any draft Return in progress to the Foundation or its new preparer. Harmonious signs as preparer only a Return it completed and reviewed."),
    ("Records.", "Harmonious keeps the records made under this Statement of Work under its published retention policy and gives the Foundation copies on request."),
    ("Order of precedence.", "The MSA governs. Where this Statement of Work conflicts with it, this Statement of Work controls for this engagement only, and only to the extent of the conflict."),
    ("Amendment.", "This Statement of Work may be changed only by a written amendment signed by both parties."),
])

# 9 Signatures
doc.add_heading("9. Signatures", 1)
para("The parties have signed this Statement of Work as of the dates below.")
table([
    ["[Foundation legal name]", "Harmonious"],
    ["By: ________________________", "By: ________________________"],
    ["Name: [Authorized Officer]", "Name: [Harmonious signatory]"],
    ["Title: [Title]", "Title: [Title]"],
    ["Date: ________________", "Date: ________________"],
], [3.25, 3.25], header=False, size=9.5)
p = doc.add_paragraph(); r = p.add_run("Role disclaimer. "); r.bold = True; r.font.size = Pt(8.5)
r = p.add_run("Harmonious provides administrative, bookkeeping and preparation services. Harmonious is not a law firm and does not act as legal counsel, a discretionary investment adviser, trustee, director, officer or fiduciary of the Foundation, and is not a signatory on any Foundation account. Harmonious signs the Foundation's Returns only as paid preparer and never signs an application, return, registration or declaration for the Foundation. The Foundation's board and Authorized Officers keep responsibility for its decisions, filings and payments.")
r.font.size = Pt(8.5)
counsel("the role disclaimer above replaces the approved \"does not sign or file\" wording for this engagement only; please confirm or revise.")

# Appendix
doc.add_page_break()
doc.add_heading("Appendix A. Questions for counsel", 1)
qs = [
    ("Paid preparer.", "Is the Section 4.2 wording right for an individual Signing Preparer with a PTIN signing for Harmonious as the firm? Should Signing Preparers be named in a schedule, and does any credential requirement apply?"),
    ("Professional standards.", "If a Signing Preparer is a CPA or enrolled agent, what wording in Section 4.6 is needed for their professional standards and due diligence?"),
    ("Filing method.", "Option A (Foundation files) or Option B (Harmonious transmits after the signed Form 8879-TE)? Option B requires Harmonious to be an authorized IRS e-file provider for exempt organization returns."),
    ("Application.", "Is Section 4.3 right that Form 1023 carries no paid preparer signature, and how should Harmonious be disclosed where the form asks about paid help?"),
    ("Representation.", "Who at Harmonious, if anyone, can be named on Form 2848? Is Form 8821 sufficient for the correspondence included in Service 3.4?"),
    ("Liability.", "Does the MSA limitation of liability and indemnity cover preparer-signed Returns? Should Harmonious bear penalties caused solely by its own error (Section 4.10)? Does Harmonious's professional liability insurance cover return preparation?"),
    ("Return information.", "Does Harmonious need the Foundation's written consent to use or disclose Return information within its platform and with its service providers, and if so, what form should it take?"),
    ("State reports.", "Do the Illinois Attorney General and Secretary of State forms allow or require a preparer signature, and are the officer signer requirements in Section 7 correct?"),
    ("MSA.", "Does this Statement of Work's express appointment (Section 1.2) work under the current MSA without an MSA change? Harmonious's decision is that foundation terms live in the Statement of Work only."),
    ("Deadlines.", "Are the bracketed 60-day and 10-business-day periods in Section 4.9 reasonable?"),
]
for i, (lead, q) in enumerate(qs, 1):
    para(q, bold_lead=f"{i}. {lead}")

out = sys.argv[1] if len(sys.argv) > 1 else "/tmp/fsow/sow.docx"
os.makedirs(os.path.dirname(out), exist_ok=True)
doc.save(out); print("saved", out)
