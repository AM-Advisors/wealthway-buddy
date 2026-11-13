import json
from reportlab.pdfgen import canvas
from reportlab.lib.pagesizes import letter
from reportlab.lib.colors import HexColor, white
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.lib.utils import simpleSplit, ImageReader
F = "/tmp/ddq/fonts/"
for n, f in [("RubikB", "Rubik-Bold.ttf"), ("RubikM", "Rubik-Medium.ttf"), ("Pop", "Poppins-Regular.ttf"), ("PopM", "Poppins-Medium.ttf"), ("PopL", "Poppins-Light.ttf"), ("PopSB", "Poppins-SemiBold.ttf")]:
    pdfmetrics.registerFont(TTFont(n, F + f))
NAVY, TEAL, INK, SLATE, LINE, FILL, TEALBG = [HexColor(x) for x in ("#142647", "#5DC6D1", "#221F20", "#415B81", "#D5DCE6", "#F6F8FB", "#E8F6F8")]
D = json.load(open("/tmp/ddq/content.json"))
W, H = letter; M = 54; CW = W - 2 * M
TOP = H - 74; BOTTOM = 50

class Doc:
    def __init__(s, path, total, real):
        s.c = canvas.Canvas(path, pagesize=letter); s.page = 0; s.total = total; s.real = real
        s.c.setTitle(D["title"]); s.c.setAuthor("Harmonious"); s.c.setSubject("Due diligence questionnaire for portfolio companies")
    def field(s, **k):
        if s.real: s.c.acroForm.textfield(borderColor=LINE, fillColor=FILL, textColor=INK, fontName="Helvetica", fontSize=9, borderWidth=0.75, forceBorder=True, **k)
    def check(s, **k):
        if s.real: s.c.acroForm.checkbox(buttonStyle="check", borderColor=SLATE, fillColor=white, textColor=NAVY, borderWidth=0.75, size=9, forceBorder=True, **k)
    def chrome(s):
        c = s.c; s.page += 1
        if s.page == 1: return
        c.drawImage(ImageReader("/tmp/ddq/logo-navy.png"), M, H - 48, width=96, height=96 * 449 / 1917, mask="auto")
        c.setFont("Pop", 8); c.setFillColor(SLATE); c.drawRightString(W - M, H - 42, D["title"])
        c.setStrokeColor(TEAL); c.setLineWidth(1.2); c.line(M, H - 56, W - M, H - 56)
        c.setFont("Pop", 7.5); c.setFillColor(SLATE)
        c.drawString(M, 34, "Harmonious · harmonious.co")
        c.drawRightString(W - M, 34, f"Page {s.page} of {s.total}")
    def new(s):
        s.c.showPage(); s.chrome(); s.y = TOP

def txt(c, lines, x, y, font, size, lead, color):
    c.setFont(font, size); c.setFillColor(color)
    for l in lines: c.drawString(x, y, l); y -= lead
    return y

def build(path, total, real):
    d = Doc(path, total, real); c = d.c
    # Cover
    d.chrome()
    c.setFillColor(NAVY); c.rect(0, H - 285, W, 285, stroke=0, fill=1)
    c.drawImage(ImageReader("/tmp/ddq/logo-white.png"), M, H - 84, width=150, height=150 * 449 / 1917, mask="auto")
    c.setFillColor(TEAL); c.setFont("PopM", 10); c.drawString(M, H - 140, "DUE DILIGENCE")
    c.setFillColor(white); c.setFont("RubikB", 30); c.drawString(M, H - 176, "Portfolio Company"); c.drawString(M, H - 212, "Due Diligence Questionnaire")
    c.setFont("PopL", 11); c.setFillColor(HexColor("#C9D6E6"))
    y = txt(c, simpleSplit(f"{len(D['sections'])} sections · {sum(len(x['questions']) for x in D['sections'])} questions · for companies at every stage, from pre-seed to growth.", "PopL", 11, CW), M, H - 246, "PopL", 11, 15, HexColor("#C9D6E6"))
    c.setFillColor(TEAL); c.rect(0, H - 289, W, 4, stroke=0, fill=1)
    y = H - 324
    c.setFont("RubikB", 13); c.setFillColor(NAVY); c.drawString(M, y, "How to complete this questionnaire"); y -= 20
    for i, t in enumerate(D["instructions"]):
        lines = simpleSplit(t, "Pop", 9.5, CW - 18)
        c.setFillColor(TEAL); c.circle(M + 4, y + 3, 2.4, stroke=0, fill=1)
        y = txt(c, lines, M + 16, y, "Pop", 9.5, 13.5, INK) - 5
    y -= 4
    for label, desc, bg, fg in [("All stages", "Every company answers.", TEALBG, NAVY), ("Growth", "Series B or later, or companies with meaningful revenue.", NAVY, white)]:
        pill(c, M, y - 2, label, bg, fg); c.setFont("Pop", 9); c.setFillColor(SLATE); c.drawString(M + 78, y + 1, desc); y -= 20
    y -= 8
    c.setFont("RubikB", 13); c.setFillColor(NAVY); c.drawString(M, y, "Company information"); y -= 10
    colw = (CW - 28) / 3
    for i, label in enumerate(D["company"]):
        col = i % 3; row = i // 3
        x = M + col * (colw + 14); yy = y - row * 38
        c.setFont("PopM", 7.5); c.setFillColor(SLATE)
        c.drawString(x, yy - 10, label if len(label) < 60 else "Current stage")
        d.field(name=f"company_{i+1}", tooltip=label, x=x, y=yy - 34, width=colw, height=20)
    # Sections
    d.new()
    for si, sec in enumerate(D["sections"], 1):
        intro = simpleSplit(sec["intro"], "Pop", 9, CW)
        first = qheight(sec["questions"][0])
        if d.y - (44 + 13 * len(intro) + first) < BOTTOM: d.new()
        elif d.y < TOP: d.y -= 14
        c.setFillColor(TEAL); c.rect(M, d.y - 22, 4, 26, stroke=0, fill=1)
        c.setFillColor(NAVY); c.setFont("RubikB", 15); c.drawString(M + 14, d.y - 14, f"{si}. {sec['title']}")
        d.y -= 34
        d.y = txt(c, intro, M, d.y, "Pop", 9, 13, SLATE) - 8
        for qi, q in enumerate(sec["questions"], 1):
            h = qheight(q)
            if d.y - h < BOTTOM: d.new()
            num = f"{si}.{qi}"
            c.setFont("RubikM", 10); c.setFillColor(NAVY); c.drawString(M, d.y - 10, num)
            lines = simpleSplit(q["q"], "Pop", 9.5, QW)
            yy = txt(c, lines, M + 34, d.y - 10, "Pop", 9.5, 13.5, INK)
            st = q["stage"]
            pill(c, W - M - 62, d.y - 14, "All stages" if st == "All" else "Growth", TEALBG if st == "All" else NAVY, NAVY if st == "All" else white)
            if q["docs"]:
                c.setFont("PopM", 8); c.setFillColor(SLATE); c.drawString(M + 34, yy - 1, "Please provide: ")
                off = pdfmetrics.stringWidth("Please provide: ", "PopM", 8)
                c.setFont("Pop", 8); c.drawString(M + 34 + off, yy - 1, q["docs"])
                d.check(name=f"attached_{si}_{qi}", tooltip=f"{num} document attached", x=W - M - 62, y=yy - 3)
                c.setFont("Pop", 7.5); c.setFillColor(SLATE); c.drawString(W - M - 49, yy - 1, "Attached")
                yy -= 12
            d.field(name=f"q_{si}_{qi}", tooltip=f"{num} {q['q'][:80]}", x=M + 34, y=yy - 2 - FH, width=CW - 34, height=FH, fieldFlags="multiline")
            d.y = yy - FH - 16
    # Certification
    if d.y - 230 < BOTTOM: d.new()
    else: d.y -= 14
    c.setFillColor(TEAL); c.rect(M, d.y - 22, 4, 26, stroke=0, fill=1)
    c.setFillColor(NAVY); c.setFont("RubikB", 15); c.drawString(M + 14, d.y - 14, "Certification"); d.y -= 36
    d.y = txt(c, simpleSplit(D["cert"], "Pop", 9.5, CW), M, d.y, "Pop", 9.5, 14, INK) - 10
    colw = (CW - 16) / 2
    for i, label in enumerate(D["certFields"]):
        x = M + (i % 2) * (colw + 16); yy = d.y - (i // 2) * 46
        c.setFont("PopM", 7.5); c.setFillColor(SLATE); c.drawString(x, yy - 10, label)
        d.field(name=f"cert_{label.lower()}", tooltip=label, x=x, y=yy - 38, width=colw, height=24)
    c.showPage(); c.save(); return d.page

QW = CW - 34 - 74; FH = 40
def qheight(q):
    return 10 + 13.5 * len(simpleSplit(q["q"], "Pop", 9.5, QW)) + (12 if q["docs"] else 0) + FH + 18

def pill(c, x, y, label, bg, fg):
    w = 62; c.setFillColor(bg); c.roundRect(x, y - 1, w, 14, 7, stroke=0, fill=1)
    c.setFillColor(fg); c.setFont("PopM", 7.5); c.drawCentredString(x + w / 2, y + 3, label)

n = build("/tmp/ddq/count.pdf", 0, False)
build("/tmp/ddq/out/Harmonious-Portfolio-Company-DDQ.pdf", n, True)
print("pages", n)
