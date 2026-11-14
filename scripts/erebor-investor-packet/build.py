import os
from reportlab.pdfgen import canvas
from reportlab.lib.pagesizes import letter
from reportlab.lib.colors import HexColor, white
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.lib.utils import simpleSplit, ImageReader
from pypdf import PdfReader, PdfWriter

F = "/tmp/ddq/fonts/"
for n, f in [("RubikB","Rubik-Bold.ttf"),("RubikM","Rubik-Medium.ttf"),("Pop","Poppins-Regular.ttf"),("PopM","Poppins-Medium.ttf"),("PopL","Poppins-Light.ttf"),("PopS","Poppins-SemiBold.ttf")]:
    pdfmetrics.registerFont(TTFont(n, F+f))
NAVY, TEAL, INK, SLATE, LINE, FILL, TEALBG, PALE = [HexColor(x) for x in ("#142647","#5DC6D1","#221F20","#415B81","#D5DCE6","#F6F8FB","#E8F6F8","#D3DEEB")]
W, H = letter; M = 54; CW = W-2*M
D = "/tmp/erebor-packet/"; R = "/mnt/documents/Erebor-Review/"; REPO = "/dev-server/"
# Released, verified wire instructions exported from the platform (never committed to the repo).
import json as _json
WIRE = _json.load(open(D + "wire.json"))
FUND = "CORPS EREBOR"; FUND_SUB = "A series of AM SPV Fund Management LLC"
SUPPORT = "support@harmonious.co"
CONTACT = ("Thomas Morgan Jr., Manager, Corps Capital BDC LLC", "thomas.morgan@corpscappartners.com", "214-452-2300")

DOCS = [  # key, title, file, divider info
 ("ppm","Private Placement Memorandum", R+"Erebor_PPM_v8.pdf", "Read and keep", [
   "Explains the fund, its single investment, fees, risks and tax matters.",
   "Nothing to sign in this document. You confirm you received and read it on the Subscriber Information Form.",
   "Pay close attention to the Investment Considerations section, which covers the risks."]),
 ("oa","Operating Agreement", D+"oa_black.pdf", "Read and keep", [
   "The fund's governing agreement. It sets out members' rights, distributions, the 6% one-time management fee and the 20% carry.",
   "You do not sign this document directly. Your signature page in the Subscription Agreement also counts as your signature on this agreement.",
   "The signature lines in this document are for the fund manager."]),
 ("sa","Subscription Agreement", D+"SA_print.pdf", "Sign page 16", [
   "Your agreement to buy an interest in the fund. Read all of it before signing.",
   "On page 16, fill in: signature, date, subscription amount, the investor's legal name, the signer's legal name and title.",
   "Page 17, Acceptance of Subscription, is completed by the fund manager. Leave it blank.",
   "Exhibits A to E follow page 17. They are the Subscriber Information Form: the same questions the platform asks."]),
 ("tax","Tax forms", None, "Complete one form only", [
   "Form W-9: U.S. individuals, trusts and companies.",
   "Form W-8BEN: individuals who are not U.S. persons.",
   "Form W-8BEN-E: companies and other entities that are not U.S. persons.",
   "Sign and date the one that applies. If you are unsure which form you need, ask your tax adviser."]),
]
TAX = [("W-9", D+"fw9.pdf"), ("W-8BEN", D+"fw8ben.pdf"), ("W-8BEN-E", D+"fw8bene.pdf")]

def pages(p): return len(PdfReader(p).pages)

class Doc:
    def __init__(s, path, total=0, running="Investor onboarding packet"):
        s.c = canvas.Canvas(path, pagesize=letter); s.page = 0; s.total = total; s.running = running
        s.c.setTitle(f"{FUND} investor onboarding packet"); s.c.setAuthor("Harmonious"); s.c.setSubject("Investor onboarding packet")
    def chrome(s, header=True):
        s.page += 1; c = s.c
        c.setFont("Pop", 7.5); c.setFillColor(SLATE)
        c.drawString(M, 32, f"Harmonious · {FUND} investor packet · Confidential")
        if s.total: c.drawRightString(W-M, 32, f"Packet page {s.page} of {s.total}")
        if header:
            c.drawImage(ImageReader("/tmp/ddq/logo-navy.png"), M, H-46, width=90, height=90*449/1917, mask="auto")
            c.setFont("Pop", 8); c.drawRightString(W-M, H-40, f"{FUND} · {s.running}")
            c.setStrokeColor(TEAL); c.setLineWidth(1.2); c.line(M, H-54, W-M, H-54)
    def end(s): s.c.showPage()
    def text(s, x, y, t, font="Pop", size=10.5, color=INK, width=None, lead=None):
        c = s.c; lead = lead or size*1.45; c.setFont(font, size); c.setFillColor(color)
        lines = simpleSplit(t, font, size, width) if width else [t]
        for l in lines: c.drawString(x, y, l); y -= lead
        return y
    def heading(s, y, t, size=16):
        c = s.c; c.setFillColor(TEAL); c.rect(M, y-6, 4, 24, stroke=0, fill=1)
        c.setFillColor(NAVY); c.setFont("RubikB", size); c.drawString(M+14, y, t); return y-30
    def title_band(s, eyebrow, title, sub=None):
        c = s.c; c.setFillColor(NAVY); c.rect(0, H-150, W, 150, stroke=0, fill=1)
        c.setFillColor(TEAL); c.rect(0, H-154, W, 4, stroke=0, fill=1)
        c.drawImage(ImageReader("/tmp/ddq/logo-white.png"), M, H-62, width=110, height=110*449/1917, mask="auto")
        c.setFillColor(TEAL); c.setFont("PopM", 9.5); c.drawString(M, H-92, eyebrow.upper())
        c.setFillColor(white); c.setFont("RubikB", 24); c.drawString(M, H-122, title)
        if sub: c.setFillColor(PALE); c.setFont("PopL", 10.5); c.drawString(M, H-140, sub)
        return H-186

def bullet(d, x, y, t, width, size=10.5, color=INK, dot=TEAL):
    d.c.setFillColor(dot); d.c.circle(x+3, y+3.5, 2.6, stroke=0, fill=1)
    return d.text(x+14, y, t, size=size, width=width-14, color=color)

def box(d, x, y, w, h, fill=FILL, stroke=LINE, r=8):
    d.c.setFillColor(fill); d.c.setStrokeColor(stroke); d.c.setLineWidth(0.7); d.c.roundRect(x, y-h, w, h, r, stroke=1, fill=1)

def cover(d, toc):
    c = d.c; d.page += 1
    c.setFillColor(NAVY); c.rect(0, H-400, W, 400, stroke=0, fill=1)
    c.setFillColor(TEAL); c.rect(0, H-405, W, 5, stroke=0, fill=1)
    c.drawImage(ImageReader("/tmp/ddq/logo-white.png"), M, H-90, width=150, height=150*449/1917, mask="auto")
    c.setFillColor(TEAL); c.setFont("PopM", 11); c.drawString(M, H-190, "INVESTOR ONBOARDING PACKET")
    c.setFillColor(white); c.setFont("RubikB", 44); c.drawString(M, H-240, FUND)
    c.setFont("RubikM", 16); c.drawString(M, H-268, FUND_SUB)
    c.setFillColor(PALE); c.setFont("PopL", 11)
    y = H-306
    for l in simpleSplit("Everything you need to review, sign and complete your investment in the fund, in one place. Start with the next three pages: they explain the fund in plain words and tell you exactly what to sign and return.", "PopL", 11, CW-40):
        c.drawString(M, y, l); y -= 16
    y = H-450
    c.setFillColor(NAVY); c.setFont("RubikB", 15); c.drawString(M, y, "In this packet"); y -= 26
    for i, (name, note, pg) in enumerate(toc, 1):
        c.setFillColor(NAVY); c.circle(M+10, y+4, 10, stroke=0, fill=1)
        c.setFillColor(white); c.setFont("RubikB", 9.5); c.drawCentredString(M+10, y+0.5, str(i))
        c.setFillColor(INK); c.setFont("PopM", 11); c.drawString(M+30, y, name)
        c.setFillColor(SLATE); c.setFont("Pop", 9); c.drawString(M+30, y-13, note)
        c.setFillColor(NAVY); c.setFont("PopM", 10); c.drawRightString(W-M, y, f"Page {pg}")
        c.setStrokeColor(LINE); c.setLineWidth(0.5); c.line(M+30, y-21, W-M, y-21)
        y -= 33
    c.setFillColor(SLATE); c.setFont("Pop", 8)
    y = 70
    for l in simpleSplit("Confidential. Prepared for prospective investors in CORPS EREBOR, a series of AM SPV Fund Management LLC. Document versions current as of November 13, 2026. This packet is not an offer to sell in any place where an offer is not allowed. Blank for any investor: fill in your own details.", "Pop", 8, CW):
        c.drawString(M, y, l); y -= 11
    c.drawString(M, 32, f"Harmonious · {FUND} investor packet · Confidential"); c.drawRightString(W-M, 32, f"Packet page 1 of {d.total}")
    d.end()

def glance(d):
    d.chrome(); y = d.heading(H-90, "The fund at a glance")
    y = d.text(M, y, "A short summary of the main terms. If anything here differs from the fund's documents, the documents control.", color=SLATE, width=CW)
    y -= 10
    rows = [
      ("Fund", "CORPS EREBOR, a series of AM SPV Fund Management LLC, a Delaware series limited liability company"),
      ("What it does", "Makes one investment: buys private securities of a single portfolio company. It is not a managed portfolio."),
      ("Manager", "Corps Capital BDC LLC. The Manager makes all fund decisions; members have limited or no voting rights."),
      ("Organizer and adviser", "Corps Capital BDC LLC, under the Investment Advisory Agreement attached to the Operating Agreement."),
      ("Who can invest", "Accredited investors only, under Rule 506(b) of Regulation D. The fund may also require qualified purchaser status."),
      ("Minimum investment", "$100,000. The Manager may accept less at its discretion."),
      ("Management fee", "6% of committed capital, charged once. There is no annual or recurring management fee."),
      ("Carried interest", "20% of profits after members' capital is returned, paid to the Organizer, as set out in the Operating Agreement."),
      ("Closings", "Rolling. The Manager may accept subscriptions in one or more closings and may accept or reject any subscription."),
      ("Signed documents due", "At least 48 hours before the closing you want to join. Once made, a subscription cannot be withdrawn."),
      ("How to pay", "Wire or ACH, only after your subscription is approved. Wire instructions are on page 5 and on your investment page."),
      ("Fund documents", "Private Placement Memorandum, Operating Agreement and Subscription Agreement, all included in this packet."),
    ]
    lw = 130; vw = CW-lw-24
    for k, v in rows:
        lines = simpleSplit(v, "Pop", 10, vw); h = max(1, len(lines))*14 + 10
        d.c.setStrokeColor(LINE); d.c.setLineWidth(0.5); d.c.line(M, y-h+8, W-M, y-h+8)
        d.c.setFillColor(NAVY); d.c.setFont("PopS", 10); d.c.drawString(M, y-6, k)
        d.text(M+lw+12, y-6, v, size=10, width=vw, lead=14); y -= h
    y -= 16
    box(d, M, y, CW, 92, fill=TEALBG, stroke=TEALBG)
    yy = d.text(M+16, y-22, "Questions about the fund or your investment", font="RubikM", size=12, color=NAVY)
    yy = d.text(M+16, yy-2, CONTACT[0], size=10)
    yy = d.text(M+16, yy, f"{CONTACT[1]}  ·  {CONTACT[2]}", size=10, color=NAVY, font="PopM")
    d.text(M+16, yy, f"Trouble signing in or using the platform: {SUPPORT}", size=9.5, color=SLATE)
    d.end()

def how(d):
    d.chrome(); y = d.heading(H-90, "How to complete your investment")
    y = d.text(M, y, "There are two ways to sign. Signing on the platform is faster and fills in your details for you. Either way, a few steps always happen on the platform.", width=CW, color=SLATE)
    y -= 12
    colw = (CW-18)/2
    A = ("Sign on the platform", "Recommended", [
        "Open the personal link in your invitation email and create your account with the same email address.",
        "Tell us who is investing and answer the fund's questions.",
        "Complete the identity check with your phone or computer camera.",
        "Fill in and sign your W-9 or W-8 on screen.",
        "Review the documents, already filled in with your details, and sign electronically.",
        "Wait for the Manager's approval, then send your investment using the instructions shown."])
    B = ("Sign on paper", "Using this packet", [
        "Still open your invitation link, create your account, enter your details and complete the identity check on the platform.",
        "Fill in Exhibits A to E, the Subscriber Information Form, in this packet.",
        "Sign page 16 of the Subscription Agreement.",
        "Complete and sign one tax form: W-9 or W-8.",
        "Email clear scans of every signed page to the fund contact on page 4. Keep copies for yourself.",
        "Wait for the Manager's approval, then send your investment using the wire instructions on page 5."])
    tops = y
    for i, (t, tag, steps) in enumerate([A, B]):
        x = M + i*(colw+18); hh = 70 + sum(len(simpleSplit(s_, "Pop", 10, colw-60))*14+10 for s_ in steps)
        box(d, x, tops, colw, hh, fill=FILL if i else white)
        d.c.setFillColor(TEAL if i == 0 else SLATE); d.c.setFont("PopM", 8); d.c.drawString(x+16, tops-20, tag.upper())
        d.c.setFillColor(NAVY); d.c.setFont("RubikB", 14); d.c.drawString(x+16, tops-40, t)
        yy = tops-64
        for n, s_ in enumerate(steps, 1):
            d.c.setFillColor(NAVY); d.c.circle(x+26, yy+3.5, 9, stroke=0, fill=1)
            d.c.setFillColor(white); d.c.setFont("RubikB", 8.5); d.c.drawCentredString(x+26, yy+0.5, str(n))
            yy = d.text(x+42, yy, s_, size=10, width=colw-60, lead=14) - 10
        y = min(y, tops-hh)
    y -= 22
    y = d.heading(y, "Always on the platform", 13)
    for t in ["Your identity check. It cannot be done on paper.",
              "Your investor details, which must match your signed pages exactly.",
              "Recording your wire, so the payment is matched to you. Send money only after the Manager approves your subscription."]:
        y = bullet(d, M, y, t, CW) - 4
    y -= 10
    box(d, M, y, CW, 74, fill=NAVY, stroke=NAVY)
    d.text(M+16, y-22, "Protect yourself from wire fraud", font="RubikB", size=12.5, color=white)
    d.text(M+16, y-40, "Neither Harmonious nor the fund will ever email you new or changed bank details. Only use the instructions on page 5 or your investment page, and call the fund contact if anything looks different.", size=9.5, color=PALE, width=CW-32, lead=13)
    d.end()

def checklist(d, pg):
    d.chrome(); y = d.heading(H-90, "What to sign and return")
    y = d.text(M, y, "Paper signers only. If you sign on the platform, the same questions appear on screen and you can skip this page and Exhibits A to E.", width=CW, color=SLATE)
    y -= 12
    rows = [("Subscriber Information Form, Exhibits A to E", f"Pages {pg['exh']} to {pg['exh_end']}", "Answer every question that applies, check the confirmations, then sign and date the last page.", True),
            ("Subscription Agreement, signature page", f"Page {pg['sa_sig']} (document page 16)", "Sign and date. Write the subscription amount, the investor's legal name, and the signer's name and title.", True),
            ("Tax form: W-9, W-8BEN or W-8BEN-E", f"Pages {pg['tax']}", "Complete and sign the one form that applies to the investor.", True),
            ("Private Placement Memorandum", f"Page {pg['ppm']}", "Read and keep. Nothing to sign.", False),
            ("Operating Agreement", f"Page {pg['oa']}", "Read and keep. Your Subscription Agreement signature page also signs this agreement.", False),
            ("Acceptance of Subscription", f"Page {pg['sa_sig']+1} (document page 17)", "Leave blank. The Manager signs this when accepting your subscription.", False)]
    d.c.setFillColor(SLATE); d.c.setFont("PopM", 8); d.c.drawString(M+30, y, "ITEM"); d.c.drawString(M+250, y, "WHAT TO DO"); y -= 12
    for name, where, todo, ret in rows:
        tl = simpleSplit(todo, "Pop", 9.5, CW-302); h = max(2, len(tl))*13 + 18
        d.c.setStrokeColor(LINE); d.c.setLineWidth(0.5); d.c.line(M, y-h+6, W-M, y-h+6)
        d.c.setStrokeColor(NAVY if ret else LINE); d.c.setLineWidth(1.2); d.c.rect(M+2, y-14, 13, 13, stroke=1, fill=0)
        d.c.setFillColor(NAVY); d.c.setFont("PopS", 10); 
        nl = simpleSplit(name, "PopS", 10, 200); yy = y-11
        for l in nl: d.c.drawString(M+30, yy, l); yy -= 13
        d.c.setFillColor(SLATE); d.c.setFont("Pop", 8.5); d.c.drawString(M+30, yy, where)
        d.c.setFillColor(TEAL if ret else SLATE); d.c.setFont("PopM", 7.5); d.c.drawRightString(W-M, y-11, "RETURN" if ret else "KEEP")
        d.text(M+250, y-11, todo, size=9.5, width=CW-262-40, lead=13)
        y -= max(h, (len(nl)+1)*13+12)
    y -= 18
    y = d.heading(y, "Before you send", 13)
    for t in ["The amount is at least $100,000 and matches the amount on your investment page.",
              "The investor's legal name is the same on every page and matches the platform. For a trust or company, use its full legal name.",
              "If you sign for a trust or company, write your own name and title as the signer.",
              "Every signature line marked above is signed and dated. Do not change or cross out any printed wording.",
              "Do not send money yet. Wire only after the Manager approves, using page 5."]:
        y = bullet(d, M, y, t, CW) - 4
    y -= 10
    box(d, M, y, CW, 76, fill=TEALBG, stroke=TEALBG)
    d.text(M+16, y-22, "Return your signed pages to", font="RubikM", size=11.5, color=NAVY)
    d.text(M+16, y-40, CONTACT[0], size=9.5, color=INK)
    d.text(M+16, y-56, f"{CONTACT[1]}  ·  {CONTACT[2]}", size=9.5, color=NAVY, font="PopM")
    d.end()

def field(d, x, y, label, w):
    d.c.setFillColor(SLATE); d.c.setFont("PopM", 7.5); d.c.drawString(x, y, label.upper())
    d.c.setStrokeColor(HexColor("#8A9AB3")); d.c.setLineWidth(0.7); d.c.line(x, y-20, x+w, y-20)
def checks(d, x, y, items, colw, cols):
    for i, t in enumerate(items):
        cx = x + (i % cols)*colw; cy = y - (i//cols)*18
        d.c.setStrokeColor(NAVY); d.c.setLineWidth(0.9); d.c.rect(cx, cy-2, 10, 10, stroke=1, fill=0)
        d.c.setFillColor(INK); d.c.setFont("Pop", 9.5); d.c.drawString(cx+16, cy, t)
    return y - ((len(items)+cols-1)//cols)*18
def sec(d, y, n, t):
    d.c.setFillColor(NAVY); d.c.circle(M+9, y+4, 9, stroke=0, fill=1)
    d.c.setFillColor(white); d.c.setFont("RubikB", 9); d.c.drawCentredString(M+9, y+1, str(n))
    d.c.setFillColor(NAVY); d.c.setFont("RubikM", 12.5); d.c.drawString(M+26, y, t); return y-26

def form(d):
    d.chrome(); y = d.heading(H-90, "Subscriber Information Form")
    y = d.text(M, y, "Paper signers only. The Subscription Agreement signature page confirms this form is accurate and complete. Print clearly. Your answers must match what you enter on the platform.", width=CW, color=SLATE, size=9.5)
    y -= 10
    half = (CW-20)/2
    y = sec(d, y, 1, "Investor")
    field(d, M, y, "Investor legal name, exactly as it should appear on the documents", CW); y -= 38
    d.c.setFillColor(SLATE); d.c.setFont("PopM", 7.5); d.c.drawString(M, y, "INVESTING AS"); y -= 16
    y = checks(d, M, y, ["Individual", "Joint (two people)", "Trust", "Company or partnership", "Retirement account (IRA)", "Other: ______________"], CW/3, 3) - 8
    field(d, M, y, "Date of birth (individual) or date formed (entity)", half); field(d, M+half+20, y, "Country of citizenship or formation", half); y -= 38
    d.c.setFillColor(SLATE); d.c.setFont("PopM", 7.5); d.c.drawString(M, y, "FOR TAX PURPOSES THE INVESTOR IS"); y -= 16
    y = checks(d, M, y, ["A U.S. person (complete Form W-9)", "Not a U.S. person (complete a Form W-8)"], CW/2, 2) - 10
    y = sec(d, y, 2, "Contact details")
    field(d, M, y, "Street address (no P.O. boxes)", CW); y -= 38
    field(d, M, y, "City", half*0.9); field(d, M+half*0.9+16, y, "State or province", half*0.5); field(d, M+half*1.4+32, y, "ZIP or postal code", half*0.6-32+20); y -= 38
    field(d, M, y, "Email (the address used on the platform)", half); field(d, M+half+20, y, "Phone", half); y -= 44
    y = sec(d, y, 3, "Person signing (for a trust, company or retirement account)")
    field(d, M, y, "Signer's legal name", half); field(d, M+half+20, y, "Title or capacity (for example Trustee, Manager)", half); y -= 38
    field(d, M, y, "Signer's email", half); field(d, M+half+20, y, "Second signer, if required (name and title)", half); y -= 44
    y = sec(d, y, 4, "Investment")
    field(d, M, y, "Subscription amount in U.S. dollars (minimum $100,000)", half); 
    d.c.setFillColor(INK); d.c.setFont("RubikM", 12); d.c.drawString(M, y-16, "$")
    d.c.setFillColor(SLATE); d.c.setFont("PopM", 7.5); d.c.drawString(M+half+20, y, "I WILL SEND FUNDS BY")
    checks(d, M+half+20, y-16, ["Wire", "ACH"], 80, 2); y -= 40
    d.end()
    # page 2
    d.chrome(); y = H-90
    y = sec(d, y, 5, "Accredited investor status (check every one that applies)")
    y = d.text(M, y+4, "Individuals", font="PopS", size=9.5, color=NAVY) - 2
    ind = ["Income over $200,000 in each of the last two years ($300,000 together with a spouse or spousal equivalent), and I expect the same this year.",
           "Net worth over $1,000,000, alone or with a spouse or spousal equivalent, not counting my primary home.",
           "I hold a Series 7, Series 65 or Series 82 license in good standing.",
           "I am a director, executive officer or manager of the fund's Manager, or a knowledgeable employee of the fund."]
    ent = ["An entity with more than $5,000,000 in assets that was not formed to make this investment.",
           "An entity in which every owner is an accredited investor.",
           "A trust with more than $5,000,000 in assets, not formed to make this investment, directed by a sophisticated person.",
           "A bank, broker dealer, insurance company, registered investment adviser or similar regulated institution.",
           "A family office with more than $5,000,000 in assets under management, or its family client.",
           "Other accredited investor category under Rule 501(a). Describe: ______________________________"]
    def longchecks(y, items):
        for t in items:
            d.c.setStrokeColor(NAVY); d.c.setLineWidth(0.9); d.c.rect(M, y-2, 10, 10, stroke=1, fill=0)
            y = d.text(M+18, y, t, size=9.5, width=CW-18, lead=13) - 5
        return y
    y = longchecks(y, ind) - 4
    y = d.text(M, y, "Trusts, companies and other entities", font="PopS", size=9.5, color=NAVY) - 2
    y = longchecks(y, ent) - 4
    y = d.text(M, y, "The Manager may ask for proof, such as tax returns, account statements or a letter from a CPA, attorney or registered adviser.", size=9, color=SLATE, width=CW, lead=12) - 14
    y = sec(d, y, 6, "Confirmations")
    conf = ["I received and read the Private Placement Memorandum, the Operating Agreement and the Subscription Agreement in this packet.",
            "The information on this form is true, complete and matches what I entered on the platform.",
            "I will complete the identity check on the platform, and I understand the Manager may accept or reject my subscription.",
            "I will send funds only using the instructions on my investment page after my subscription is approved."]
    y = longchecks(y, conf) - 12
    third = (CW-40)/3
    field(d, M, y, "Signature", third*1.3); field(d, M+third*1.3+20, y, "Printed name", third*1.0); field(d, M+third*2.3+40, y, "Date", third*0.7); y -= 40
    d.text(M, y, "Return this form with your signed Subscription Agreement signature page and tax form.", size=9, color=SLATE, width=CW)
    d.end()

# ---------------------------------------------------------------- Exhibits A to E
# Built from the same question list the platform uses (src/lib/standard-investor-questionnaire.json,
# kyc-fields.ts, onboarding-intake-model.ts, onboard-compliance-panels.tsx) so paper and screen ask the same thing.
import json, re as _re
SQ = {q["key"]: q for q in json.load(open(REPO + "src/lib/standard-investor-questionnaire.json"))}
def sq(prefix):
    k = [k for k in SQ if k.startswith(prefix)]; assert len(k) == 1, prefix; q = SQ[k[0]]
    return _re.sub(r"Owners1\b", "Owners", q["label"]).strip(), [o if isinstance(o, str) else o.get("label") for o in q.get("options", [])]
def _ts(path, name):
    src = open(REPO + path).read(); block = src[src.index(f"export const {name}"):]; block = block[:block.index("] as const")]
    return _re.findall(r'label: "([^"]+)"', block)
SOURCE_OF_FUNDS = _ts("src/lib/onboarding-intake-model.ts", "SOURCE_OF_FUNDS")
SOURCE_OF_WEALTH = _ts("src/lib/onboarding-intake-model.ts", "SOURCE_OF_WEALTH")
QP_PROMPT = _re.search(r'qualified_purchaser: "((?:[^"\\]|\\.)*)"', open(REPO + "src/lib/onboarding-intake-model.ts").read()).group(1).replace('\\"', '"')

class Flow:
    def __init__(s, d, running): s.d = d; s.running = running; s.y = 0
    def page(s): s.d.running = s.running; s.d.chrome(); s.y = H-84
    def need(s, h):
        if s.y - h < 58: s.d.end(); s.page(); return True
        return False
    def para(s, t, size=9.5, color=INK, font="Pop", gap=4, indent=0):
        lines = simpleSplit(t, font, size, CW-indent); s.need(len(lines)*size*1.4)
        s.y = s.d.text(M+indent, s.y, t, font=font, size=size, color=color, width=CW-indent, lead=size*1.4) - gap
    def where(s, t):
        s.need(20); s.d.c.setFillColor(TEALBG); s.d.c.roundRect(M, s.y-6, CW, 18, 4, stroke=0, fill=1)
        s.d.c.setFillColor(NAVY); s.d.c.setFont("PopM", 8); s.d.c.drawString(M+8, s.y, ("ON THE PLATFORM: " + t).upper()); s.y -= 24
    def sub(s, t):
        s.need(40); s.y -= 4; s.d.c.setFillColor(NAVY); s.d.c.setFont("RubikM", 11.5); s.d.c.drawString(M, s.y, t)
        s.d.c.setStrokeColor(LINE); s.d.c.setLineWidth(0.5); s.d.c.line(M, s.y-6, W-M, s.y-6); s.y -= 22
    def fields(s, labels, cols=2):
        w = (CW - 20*(cols-1))/cols
        for i in range(0, len(labels), cols):
            s.need(40)
            for j, l in enumerate(labels[i:i+cols]): field(s.d, M + j*(w+20), s.y, l, w)
            s.y -= 38
    def q(s, n, prompt, options, cols=1, note=None, size=9.5):
        lines = simpleSplit(prompt, "PopM", size, CW-22)
        optlines = sum(len(simpleSplit(o, "Pop", 9, CW/cols-30)) for o in options)*13 // max(1, cols) + 14
        s.need(min(len(lines)*size*1.4 + optlines, 300))
        s.d.c.setFillColor(NAVY); s.d.c.setFont("RubikB", 9); s.d.c.drawString(M, s.y, f"{n}.")
        s.y = s.d.text(M+22, s.y, prompt, font="PopM", size=size, color=INK, width=CW-22, lead=size*1.4) - 3
        if note: s.y = s.d.text(M+22, s.y, note, size=8.5, color=SLATE, width=CW-22, lead=11.5) - 3
        cw = (CW-22)/cols
        for i in range(0, len(options), cols):
            row = options[i:i+cols]; hs = []
            for j, o in enumerate(row):
                x = M+22 + j*cw
                s.d.c.setStrokeColor(NAVY); s.d.c.setLineWidth(0.9); s.d.c.rect(x, s.y-2, 9, 9, stroke=1, fill=0)
                yy = s.d.text(x+15, s.y, o, size=9, width=cw-24, lead=12.5); hs.append(s.y-yy)
            s.y -= max(hs) + 3
            if i + cols < len(options): s.need(14)
        s.y -= 8
    def line(s, n, prompt):
        s.need(46); s.d.c.setFillColor(NAVY); s.d.c.setFont("RubikB", 9); s.d.c.drawString(M, s.y, f"{n}.")
        s.y = s.d.text(M+22, s.y, prompt, font="PopM", size=9.5, color=INK, width=CW-22, lead=13) - 18
        s.d.c.setStrokeColor(HexColor("#8A9AB3")); s.d.c.setLineWidth(0.7); s.d.c.line(M+22, s.y+4, W-M, s.y+4); s.y -= 16
    def band(s, letter, title, intro):
        c = s.d.c; c.setFillColor(NAVY); c.roundRect(M, s.y-40, CW, 52, 6, stroke=0, fill=1)
        c.setFillColor(TEAL); c.setFont("PopM", 8.5); c.drawString(M+16, s.y-6, f"EXHIBIT {letter}" if letter else "SUBSCRIBER INFORMATION FORM")
        c.setFillColor(white); c.setFont("RubikB", 16); c.drawString(M+16, s.y-28, title); s.y -= 60
        s.para(intro, size=9.5, color=SLATE, gap=8)

def exhibits(d):
    f = Flow(d, "Subscriber Information Form")
    yn = ["Yes", "No"]
    # A
    f.page(); f.band("A", "Subscriber information", "Exhibits A to E are the Subscriber Information Form that your Subscription Agreement signature page confirms. They ask the same questions as the platform, in the same words. Print clearly. If you also answer on the platform, your answers must match.")
    f.where("Questions step")
    n = 1
    for p in ["name_of_subscriber", "subscription_amount", "email", "phone", "subscriber_s_address_of_residence", "address_for_delivery"]:
        lab, _ = sq(p); lab = lab + (" (minimum $100,000)" if p == "subscription_amount" else ""); f.line(n, lab); n += 1
    for p, cols in [("i_agree_to_electronic", 1), ("for_persons_individuals", 2), ("which_of_the_following_irs", 1)]:
        lab, opts = sq(p); f.q(n, lab, opts, cols=cols, note="Check one." if cols == 2 else None); n += 1
    f.sub("Investor details"); f.where("Investor profile")
    f.para("Everyone", font="PopS", size=9, color=NAVY, gap=6)
    f.fields(["Street address", "City", "State / region (your state of residence)", "Postal code", "Country", "Phone"])
    f.para("Individuals, joint investors and IRAs", font="PopS", size=9, color=NAVY, gap=6)
    f.fields(["Date of birth", "Citizenship"])
    f.fields(["Joint: second holder's legal name", "Joint: second holder's date of birth", "IRA custodian", "Custodian account (last 4)"])
    f.para("Trusts", font="PopS", size=9, color=NAVY, gap=6)
    f.fields(["Date trust formed", "Trustee(s) (names)", "Grantor (name)"])
    f.para("Companies, partnerships and other entities", font="PopS", size=9, color=NAVY, gap=6)
    f.fields(["State of formation", "Date formed", "Person who controls or signs (name and title)"])
    f.para("Tax ID numbers (SSN, EIN or trust tax ID) go on your tax form only. Do not write them here.", size=8.5, color=SLATE)
    d.end()
    # B
    f.page(); f.band("B", "Accredited investor status", "Section 2(a) of the Subscription Agreement. The fund accepts accredited investors under Rule 506(b), so you certify your own status. The Manager may ask for proof, such as tax returns, account statements or a letter from a CPA, attorney or registered adviser.")
    f.where("Accreditation step")
    lab, opts = sq("please_select_the_accreditation"); f.q(1, lab, opts, note="Check the one that applies.")
    d.end()
    # C and D share a page
    f.page(); f.band("C", "Qualified purchaser status", "Section 2(a) of the Subscription Agreement. Complete only if the Manager asks you to. In general, a qualified purchaser is an individual or family company with at least $5 million in investments, or another entity with at least $25 million in investments.")
    f.where("Eligibility questions, when the fund asks")
    f.q(1, QP_PROMPT, ["Yes", "No", "I'm not sure"], cols=3)
    f.y -= 14
    f.need(200); f.band("D", "Benefit plan investors", "Section 2(s) of the Subscription Agreement. Individuals and joint investors skip this exhibit. Trusts, IRAs, retirement plans, companies and other entities answer both questions.")
    f.where("Questions step, for entities, trusts and retirement accounts")
    lab, opts = sq("is_the_subscriber_acting_on_behalf"); f.q(1, lab, opts, cols=2)
    lab, opts = sq("is_the_subscriber_a_life_insurance"); f.q(2, lab, opts, cols=2)
    d.end()
    # E
    f.page(); f.band("E", "Anti-money laundering information", "Sections 10 and 11 of the Subscription Agreement (USA PATRIOT Act and Beneficial Ownership). These are the funding bank and financial background questions on the platform. Your identity check still happens on the platform.")
    f.sub("Funding bank"); f.where("Questions step")
    lab, _ = sq("name_of_the_bank_from"); f.line(1, lab)
    lab, o = sq("is_the_funding_bank_located"); f.q(2, lab, o, cols=2)
    lab, o = sq("if_the_subscriber_answered_yes_is"); f.q(3, lab, o, cols=2, note='Answer only if you answered "Yes" to question 2.')
    lab, o = sq("is_the_jurisdiction_where"); f.q(4, lab, o, cols=2)
    lab, _ = sq("if_the_subscriber_answered_no_to"); f.need(80); d.c.setFillColor(NAVY); d.c.setFont("RubikB", 9); d.c.drawString(M, f.y, "5.")
    f.para(lab.replace("upload a copy", "attach a copy").replace("upload a certified", "attach a certified"), size=8.5, color=INK, indent=22, gap=8)
    f.sub("Financial background"); f.where("Questions step, Financial background")
    f.fields(["Country of citizenship (individuals)", "Country of residence (individuals)", "Occupation / employer (individuals)", "Nature of the entity's business (entities)"])
    f.q(6, "Where is the money for this investment coming from?", SOURCE_OF_FUNDS, cols=4)
    f.line(7, 'Please describe the source of funds (if you checked "Other")')
    f.line(8, "Country the funds are coming from")
    f.q(9, "Is anyone other than the investor providing the funds?", ["No", "Yes"], cols=2)
    f.q(10, "Is the investor, a close family member or associate a senior public official (a politically exposed person)?", ["No", "Yes"], cols=2)
    f.q(11, "Expected activity", ["This single investment", "Ongoing investments and capital calls"], cols=2)
    f.para('Questions 12 and 13 are required if you answered "Yes" to question 10 or the Manager asks for them.', size=8.5, color=SLATE)
    f.q(12, "How was the investor's overall wealth built?", SOURCE_OF_WEALTH, cols=3)
    f.line(13, "Brief description of source of wealth")
    f.sub("Owners of 25% or more (companies, partnerships and other entities)"); f.where("Investor profile")
    f.need(130); c = d.c; cols = [("Full legal name", 0.45), ("Ownership %", 0.2), ("Date of birth", 0.35)]
    x = M
    for t, wpart in cols: c.setFillColor(SLATE); c.setFont("PopM", 7.5); c.drawString(x, f.y, t.upper()); x += CW*wpart
    f.y -= 8
    top = f.y + 2
    for _ in range(4):
        f.y -= 22; c.setStrokeColor(HexColor("#8A9AB3")); c.setLineWidth(0.7); c.line(M, f.y, W-M, f.y)
    for xp in (0.45, 0.65): c.setStrokeColor(LINE); c.line(M+CW*xp-8, top-10, M+CW*xp-8, f.y)
    f.y -= 14
    f.para("If no one owns 25% or more, write \"None\" on the first line. The Manager may ask for more information about owners and controlling persons.", size=8.5, color=SLATE)
    d.end()
    # Certification
    f.page(); f.band("", "Securities law history and signature", "Section 2(b) of the Subscription Agreement, the Rule 506(d) \"Bad Actor\" questions. Answer every question. A \"Yes\" answer does not automatically disqualify you; the Manager will review it with you.")
    f.where("Questions step")
    for i, p in enumerate(["has_the_subscriber_been_convicted", "has_the_subscriber_been_subject_to_a_final", "has_the_subscriber_been_subject_to_an_order", "has_the_subscriber_been_subject_to_any_order", "has_the_subscriber_been_suspended", "has_the_subscriber_filed", "has_the_subscriber_been_subject_to_a_u_s", "has_the_subscriber_or_any"], 1):
        lab, o = sq(p); f.q(i, lab, o, cols=2, size=8.5)
    f.sub("Confirmation")
    for t in ["I received and read the Private Placement Memorandum, the Operating Agreement and the Subscription Agreement in this packet.",
              "The information in Exhibits A to E is true and complete and matches what I enter on the platform. I will tell the Manager in writing if anything changes.",
              "I will complete the identity check on the platform, and I understand the Manager may accept or reject my subscription."]:
        f.need(30); d.c.setStrokeColor(NAVY); d.c.setLineWidth(0.9); d.c.rect(M, f.y-2, 10, 10, stroke=1, fill=0)
        f.y = d.text(M+18, f.y, t, size=9.5, width=CW-18, lead=13) - 6
    f.y -= 10; f.need(60); third = (CW-40)/3
    field(d, M, f.y, "Signature", third*1.3); field(d, M+third*1.3+20, f.y, "Printed name and title", third); field(d, M+third*2.3+40, f.y, "Date", third*0.7)
    f.y -= 40; f.para("Return Exhibits A to E and this page with your signed Subscription Agreement signature page and tax form.", size=9, color=SLATE)
    d.end()

def wire(d):
    d.running = "Sending your investment"; d.chrome(); y = d.heading(H-90, "Sending your investment")
    y = d.text(M, y, "Send money only after the Manager approves your subscription. You will get an email, and your investment page will show the send funds step.", width=CW, color=SLATE)
    y -= 12; d.c.setFillColor(NAVY); d.c.setFont("RubikM", 12.5); d.c.drawString(M, y, "Wire instructions"); y -= 10
    rows = [("Beneficiary (account name)", WIRE["account_name"]), ("Bank", WIRE["bank_name"]), ("Routing number (ABA)", WIRE["routing_number"]),
            ("Account number", WIRE["account_number"]), ("Amount", "Your subscription amount, as approved"),
            ("Reference", "The reference code on your investment page. If you do not have one yet, write the investor's legal name and CORPS EREBOR.")]
    box(d, M, y, CW, 26*len(rows)+30, fill=FILL)
    yy = y - 22
    for k, v in rows:
        d.c.setFillColor(SLATE); d.c.setFont("PopM", 8.5); d.c.drawString(M+16, yy, k.upper())
        mono = k in ("Routing number (ABA)", "Account number")
        d.text(M+190, yy, v, font="RubikM" if mono else "PopM", size=11 if mono else 9.5, color=NAVY if mono else INK, width=CW-206, lead=12.5)
        yy -= 26 if len(simpleSplit(v, "PopM", 9.5, CW-206)) < 2 else 32
    y = yy - 22
    y = d.text(M, y, f"The account is held by {WIRE['account_name']}, the master company of which CORPS EREBOR is a series. This is the fund's approved account.", size=9, color=SLATE, width=CW) - 8
    y = d.heading(y, "Before you send", 13)
    for t in ["I have reviewed the wire instructions above for this fund.",
              "I confirm the amount and reference code are correct.",
              "I understand Harmonious will never email changed bank details, and I will verify any change by phone."]:
        d.c.setStrokeColor(NAVY); d.c.setLineWidth(0.9); d.c.rect(M, y-2, 10, 10, stroke=1, fill=0)
        y = d.text(M+18, y, t, size=10, width=CW-18) - 4
    y -= 6
    y = d.heading(y, "After you send", 13)
    for t in ["Record the wire on your investment page: the date, the amount and the bank you sent it from. This is how the payment is matched to you.",
              "Prefer ACH? A one-time bank debit can be set up only on your investment page, not on paper."]:
        y = bullet(d, M, y, t, CW) - 4
    y -= 10
    box(d, M, y, CW, 86, fill=NAVY, stroke=NAVY)
    d.text(M+16, y-22, "Protect yourself from wire fraud", font="RubikB", size=12.5, color=white)
    d.text(M+16, y-40, f"Call {CONTACT[0].split(',')[0]} at {CONTACT[2]} to confirm these details before your first wire. Neither Harmonious nor the fund will ever email you new or changed bank details. If anything looks different from this page or your investment page, stop and call.", size=9.5, color=PALE, width=CW-32, lead=13)
    d.end()

def divider(d, n, title, action, notes, extra=None):
    d.chrome(header=False); c = d.c
    c.setFillColor(NAVY); c.rect(0, H-330, W, 330, stroke=0, fill=1)
    c.setFillColor(TEAL); c.rect(0, H-334, W, 4, stroke=0, fill=1)
    c.drawImage(ImageReader("/tmp/ddq/logo-white.png"), M, H-80, width=120, height=120*449/1917, mask="auto")
    c.setFillColor(TEAL); c.setFont("PopM", 11); c.drawString(M, H-170, f"DOCUMENT {n}")
    c.setFillColor(white); c.setFont("RubikB", 32); c.drawString(M, H-212, title)
    c.setFont("RubikM", 14); c.setFillColor(PALE); c.drawString(M, H-240, FUND + ", " + FUND_SUB)
    w = pdfmetrics.stringWidth(action, "PopS", 11) + 28
    c.setFillColor(TEAL); c.roundRect(M, H-292, w, 28, 14, stroke=0, fill=1)
    c.setFillColor(NAVY); c.setFont("PopS", 11); c.drawString(M+14, H-282, action)
    y = H-380
    for t in notes: y = bullet(d, M, y, t, CW, size=11.5) - 8
    if extra:
        y -= 10
        for t in extra: y = d.text(M, y, t, size=9.5, color=SLATE, width=CW) - 2
    d.end()

def build_front(path, total, pg):
    d = Doc(path, total)
    toc = [("How to use this packet", "The fund at a glance, how to complete your investment, what to return", 2),
           ("Sending your investment", "Wire instructions, after approval", pg["wire"]),
           ("Private Placement Memorandum", "Read and keep", pg["ppm"]-1),
           ("Operating Agreement", "Read and keep", pg["oa"]-1),
           ("Subscription Agreement", "Sign page 16", pg["sa"]-1),
           ("Subscriber Information Form", "Exhibits A to E: fill in and sign", pg["exh"]),
           ("Tax forms", "Complete one: W-9, W-8BEN or W-8BEN-E", pg["taxdiv"])]
    cover(d, toc); glance(d); how(d); checklist(d, pg); wire(d)
    d.c.save(); return d.page

def build_divider(path, i, total, start):
    d = Doc(path, total); d.page = start-1
    k, t, f, a, notes = DOCS[i]
    extra = None
    if k == "ppm": extra = ["Version in use for new investors: approved October 23, 2026."]
    if k == "oa": extra = ["Version in use for new investors: approved October 23, 2026. Printed in black text; wording unchanged."]
    if k == "sa": extra = ["Version in use for new investors: approved November 3, 2026, with the $100,000 minimum. In this print copy the Manager's acceptance lines on page 17 are left blank for the Manager."]
    if k == "tax": extra = ["Forms are the current IRS versions: W-9 (Rev. March 2024), W-8BEN and W-8BEN-E (Rev. October 2021). Instructions are on the IRS website."]
    divider(d, i+1, t, a, notes, extra); d.c.save()

# Black text copy of the Operating Agreement (approved file uses red for fund names; wording unchanged)
from pypdf.generic import NameObject, StreamObject
_r = PdfReader(R+"Erebor_Operating_Agreement_Thomas_v9.pdf"); _w = PdfWriter(clone_from=_r)
for _p in _w.pages:
    _c = _p.get_contents(); _data = _c.get_data()
    _new = _data.replace(b"1 0 0 rg", b"0 0 0 rg").replace(b"1 0 0 RG", b"0 0 0 RG")
    _s = StreamObject(); _s.set_data(_new); _p[NameObject("/Contents")] = _w._add_object(_s)
_w.write(D+"oa_black.pdf")

def build_exhibits(path, total, start):
    d = Doc(path, total); d.page = start-1; exhibits(d); d.c.save(); return d.page-start+1
# Layout: front (5 pages) | div ppm | ppm | div oa | oa | div sa | sa | exhibits | div tax | w9 | w8ben | w8bene
FRONT = 5
n_ppm, n_oa, n_sa = pages(DOCS[0][2]), pages(DOCS[1][2]), pages(DOCS[2][2])
n_exh = build_exhibits(D+"exh.pdf", 0, 1)
n_tax = sum(pages(p) for _, p in TAX)
pg = {"wire": 5}
p = FRONT + 1
pg["ppmdiv"] = p; pg["ppm"] = p+1; p += 1 + n_ppm
pg["oadiv"] = p; pg["oa"] = p+1; p += 1 + n_oa
pg["sadiv"] = p; pg["sa"] = p+1; pg["sa_sig"] = pg["sa"] + 15; p += 1 + n_sa
pg["exh"] = p; pg["exh_end"] = p + n_exh - 1; p += n_exh
pg["taxdiv"] = p; pg["tax"] = f"{p+1} to {p+n_tax}"; pg["w9"] = p+1; pg["w8ben"] = p+1+pages(TAX[0][1]); pg["w8bene"] = pg["w8ben"]+1
total = p + n_tax
n = build_front(D+"front.pdf", total, {**pg, "ppm": pg["ppmdiv"]+1, "oa": pg["oadiv"]+1, "sa": pg["sadiv"]+1})
assert n == FRONT, n
assert build_exhibits(D+"exh.pdf", total, pg["exh"]) == n_exh
for i, key in enumerate(["ppmdiv", "oadiv", "sadiv", "taxdiv"]):
    build_divider(D+f"div{i}.pdf", i, total, pg[key])

w = PdfWriter()
def add(path, label=None, parent=None):
    start = len(w.pages); w.append(path)
    return w.add_outline_item(label, start, parent=parent) if label else None
add(D+"front.pdf"); 
w.add_outline_item("Cover", 0); w.add_outline_item("The fund at a glance", 1); w.add_outline_item("How to complete your investment", 2); w.add_outline_item("What to sign and return", 3); w.add_outline_item("Sending your investment (wire instructions)", 4)
add(D+"div0.pdf", "Document 1: Private Placement Memorandum"); add(DOCS[0][2])
add(D+"div1.pdf", "Document 2: Operating Agreement"); add(DOCS[1][2])
add(D+"div2.pdf", "Document 3: Subscription Agreement"); start_sa = len(w.pages); add(DOCS[2][2])
w.add_outline_item("Subscription Agreement signature page", start_sa+15)
ex = add(D+"exh.pdf", "Subscriber Information Form: Exhibits A to E")
add(D+"div3.pdf", "Document 4: Tax forms")
for name, path in TAX: add(path, f"Form {name}")
w.add_metadata({"/Title": f"{FUND} investor onboarding packet", "/Author": "Harmonious", "/Subject": "Investor onboarding packet"})
os.makedirs("/mnt/documents/investor-onboarding/erebor", exist_ok=True)
out = "/mnt/documents/investor-onboarding/erebor/CORPS-EREBOR-Investor-Onboarding-Packet_v2.pdf"
w.write(out); print(out, len(w.pages), "expected", total, pg)
