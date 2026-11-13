import json, os, sys
from reportlab.pdfgen import canvas
from reportlab.lib.pagesizes import letter
from reportlab.lib.colors import HexColor, white
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.lib.utils import simpleSplit, ImageReader
F = "/tmp/ddq/fonts/"
for n, f in [("RubikB", "Rubik-Bold.ttf"), ("RubikM", "Rubik-Medium.ttf"), ("Pop", "Poppins-Regular.ttf"), ("PopM", "Poppins-Medium.ttf"), ("PopL", "Poppins-Light.ttf")]:
    pdfmetrics.registerFont(TTFont(n, F + f))
NAVY, TEAL, INK, SLATE, LINE, FILL, TEALBG = [HexColor(x) for x in ("#142647", "#5DC6D1", "#221F20", "#415B81", "#D5DCE6", "#F6F8FB", "#E8F6F8")]
SRC = sys.argv[1] if len(sys.argv) > 1 else "/tmp/aig/content.json"; OUT = os.path.dirname(SRC)
D = json.load(open(SRC)); SUPPORT = D["support"]; G = None
W, H = letter; M = 54; CW = W - 2 * M; TOP = H - 72; BOTTOM = 56
BODY, LEAD = 10.5, 15

def build(path, total, short):
    c = canvas.Canvas(path, pagesize=letter); st = {"page": 0, "y": 0}
    c.setTitle(G["title"]); c.setAuthor("Harmonious"); c.setSubject("Fund manager guide")
    def chrome():
        st["page"] += 1
        c.setFont("Pop", 7.5); c.setFillColor(SLATE)
        c.drawString(M, 32, f"Harmonious · {short} · Help: {SUPPORT}")
        c.drawRightString(W - M, 32, f"Page {st['page']} of {total}")
        if st["page"] > 1:
            c.drawImage(ImageReader("/tmp/ddq/logo-navy.png"), M, H - 46, width=90, height=90 * 449 / 1917, mask="auto")
            c.setFont("Pop", 8); c.drawRightString(W - M, H - 40, f"{G.get('running', 'Fund manager guide')} · {short}")
            c.setStrokeColor(TEAL); c.setLineWidth(1.2); c.line(M, H - 54, W - M, H - 54)
        st["y"] = TOP
    def new(): c.showPage(); chrome()
    def need(h):
        if st["y"] - h < BOTTOM: new()
    def text(lines, x, font, size, lead, color):
        c.setFont(font, size); c.setFillColor(color)
        for l in lines: c.drawString(x, st["y"], l); st["y"] -= lead
    chrome()
    intro = simpleSplit(G["intro"], "PopL", 11, CW)
    bh = max(228, int(176 + len(intro) * 15.5 + 14)); c.setFillColor(NAVY); c.rect(0, H - bh, W, bh, stroke=0, fill=1)
    c.setFillColor(TEAL); c.rect(0, H - bh - 4, W, 4, stroke=0, fill=1)
    c.drawImage(ImageReader("/tmp/ddq/logo-white.png"), M, H - 78, width=140, height=140 * 449 / 1917, mask="auto")
    c.setFillColor(TEAL); c.setFont("PopM", 10); c.drawString(M, H - 118, G["eyebrow"].upper())
    c.setFillColor(white); c.setFont("RubikB", 28); c.drawString(M, H - 152, G["title"])
    st["y"] = H - 176
    text(intro, M, "PopL", 11, 15.5, HexColor("#D3DEEB"))
    st["y"] = H - bh - 28
    c.setFillColor(TEALBG); c.roundRect(M, st["y"] - 30, CW, 44, 8, stroke=0, fill=1)
    c.setFillColor(SLATE); c.setFont("PopM", 8.5); c.drawString(M + 16, st["y"] - 1, "WHERE TO FIND IT")
    c.setFillColor(NAVY); c.setFont("RubikB", 15); c.drawString(M + 16, st["y"] - 21, G["where"])
    c.setFont("Pop", 9); c.setFillColor(SLATE); c.drawRightString(W - M - 16, st["y"] - 19, "Sign in at app.harmonious.co/client-login")
    st["y"] -= 58

    def heading(t, after=40):
        need(38 + after); c.setFillColor(TEAL); c.rect(M, st["y"] - 20, 4, 24, stroke=0, fill=1)
        c.setFillColor(NAVY); c.setFont("RubikB", 16); c.drawString(M + 14, st["y"] - 13, t); st["y"] -= 38
    def chips(labels, x, maxw):
        cx = x; cy = st["y"]
        for l in labels:
            w = pdfmetrics.stringWidth(l, "PopM", 8.5) + 16
            if cx + w > x + maxw: cx = x; cy -= 20
            c.setFillColor(FILL); c.setStrokeColor(LINE); c.setLineWidth(0.6); c.roundRect(cx, cy - 5, w, 16, 4, stroke=1, fill=1)
            c.setFillColor(NAVY); c.setFont("PopM", 8.5); c.drawString(cx + 8, cy, l); cx += w + 6
        st["y"] = cy - 22
    def chip_rows(labels, maxw):
        if not labels: return 0
        rows, cx = 1, 0
        for l in labels:
            w = pdfmetrics.stringWidth(l, "PopM", 8.5) + 22
            if cx + w > maxw and cx > 0: rows += 1; cx = 0
            cx += w
        return rows
    def step_h(s):
        tw = CW - 36
        return 32 + sum(len(simpleSplit(p, "Pop", BODY, tw)) * LEAD + 6 for p in s["paragraphs"]) + (14 + chip_rows(s["labels"], tw) * 20 if s["labels"] else -6) + 6
    def step(n, s):
        tx = M + 36; tw = CW - 36
        paras = [simpleSplit(p, "Pop", BODY, tw) for p in s["paragraphs"]]
        need(step_h(s))
        c.setFillColor(NAVY); c.circle(M + 12, st["y"] - 8, 12, stroke=0, fill=1)
        c.setFillColor(white); c.setFont("RubikB", 11); c.drawCentredString(M + 12, st["y"] - 12, str(n))
        c.setFillColor(NAVY); c.setFont("RubikM", 13); c.drawString(tx, st["y"] - 13, s["title"]); st["y"] -= 32
        for p in paras: text(p, tx, "Pop", BODY, LEAD, INK); st["y"] -= 6
        if s["labels"]:
            c.setFont("PopM", 7.5); c.setFillColor(SLATE); c.drawString(tx, st["y"], "ON SCREEN"); st["y"] -= 14
            chips(s["labels"], tx, tw)
        st["y"] -= 4

    # Before you start
    lines = [simpleSplit(b, "Pop", BODY, CW - 50) for b in G["before"]]
    bh2 = 36 + sum(len(l) * LEAD + 3 for l in lines) + 8
    need(bh2)
    c.setFillColor(FILL); c.setStrokeColor(LINE); c.setLineWidth(0.6); c.roundRect(M, st["y"] - bh2, CW, bh2, 8, stroke=1, fill=1)
    st["y"] -= 22; c.setFillColor(NAVY); c.setFont("RubikM", 12.5); c.drawString(M + 16, st["y"], "Before you start, have ready"); st["y"] -= 20
    for l in lines:
        c.setFillColor(TEAL); c.circle(M + 22, st["y"] + 3, 2.6, stroke=0, fill=1)
        text(l, M + 32, "Pop", BODY, LEAD, INK); st["y"] -= 3
    st["y"] -= 18

    for grp in G["groups"]:
        heading(grp["heading"], step_h(grp["steps"][0]))
        for i, s in enumerate(grp["steps"], 1): step(i, s)

    def opt_h(o):
        return 22 + len(simpleSplit(o["body"], "Pop", BODY, CW - 28)) * LEAD + 12 + chip_rows(o["labels"], CW - 28) * 20 + 10
    heading(G["cards"]["heading"], 30 + opt_h(G["cards"]["items"][0]))
    text([G["cards"]["intro"]], M, "Pop", BODY, LEAD, SLATE); st["y"] -= 8
    for o in G["cards"]["items"]:
        h = opt_h(o); need(h + 8)
        c.setFillColor(white); c.setStrokeColor(LINE); c.setLineWidth(0.8); c.roundRect(M, st["y"] - h, CW, h, 8, stroke=1, fill=1)
        top = st["y"]; st["y"] -= 18
        c.setFillColor(NAVY); c.setFont("RubikM", 12); c.drawString(M + 14, st["y"], o["title"]); st["y"] -= 17
        text(simpleSplit(o["body"], "Pop", BODY, CW - 28), M + 14, "Pop", BODY, LEAD, INK); st["y"] -= 6
        if o["labels"]: chips(o["labels"], M + 14, CW - 28)
        st["y"] = top - h - 10

    st["y"] -= 6
    heading("If something goes wrong", 80)
    for q in G["questions"]:
        qlines = simpleSplit(q["q"], "RubikM", 11.5, CW)
        ans = [simpleSplit(a, "Pop", BODY - 0.5, CW - 14) for a in q["a"]]
        need(len(qlines) * 15 + 4 + sum(len(a) * 14.5 + 4 for a in ans) + 12)
        text(qlines, M, "RubikM", 11.5, 15, NAVY); st["y"] -= 2
        c.setStrokeColor(TEAL); c.setLineWidth(2); top = st["y"] + 10
        for a in ans: text(a, M + 14, "Pop", BODY - 0.5, 14.5, INK); st["y"] -= 4
        c.line(M + 3, top, M + 3, st["y"] + 12); st["y"] -= 12
    help_lines = [simpleSplit(h, "Pop", BODY, CW - 32) for h in G["help"]]
    hh = 40 + sum(len(l) * LEAD for l in help_lines) + 24
    need(hh + 10); st["y"] -= 4
    c.setFillColor(NAVY); c.roundRect(M, st["y"] - hh, CW, hh, 10, stroke=0, fill=1)
    st["y"] -= 26; c.setFillColor(white); c.setFont("RubikB", 14); c.drawString(M + 16, st["y"], "Still stuck?"); st["y"] -= 20
    for l in help_lines: text(l, M + 16, "Pop", BODY, LEAD, HexColor("#D3DEEB"))
    c.setFillColor(TEAL); c.setFont("PopM", 11); c.drawString(M + 16, st["y"] - 2, SUPPORT)
    c.showPage(); c.save(); return st["page"]

OUTPUTS = D.get("outputs") or [["individual", "Harmonious-Add-an-Investor-Guide.pdf", "Adding an investor"], ["entity", "Harmonious-Add-a-Fund-or-Family-Office-Guide.pdf", "Adding a fund or family office"]]
for key, name, short in OUTPUTS:
    G = D["guides"][key]
    n = build(f"{OUT}/count.pdf", 0, short); build(f"{OUT}/{name}", n, short); print(name, n)
