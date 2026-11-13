import json, sys
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
D = json.load(open("/tmp/sig/content.json")); SUPPORT = D["support"]
W, H = letter; M = 54; CW = W - 2 * M; TOP = H - 72; BOTTOM = 56
BODY, LEAD = 10.5, 15

def build(g, path, total):
    c = canvas.Canvas(path, pagesize=letter); st = {"page": 0, "y": 0}
    who = "Client" if g["audience"] == "client" else "Investor"
    c.setTitle(f"{g['title']}: {who.lower()} guide"); c.setAuthor("Harmonious")
    def chrome():
        st["page"] += 1
        c.setFont("Pop", 7.5); c.setFillColor(SLATE)
        c.drawString(M, 32, f"Harmonious · {who} sign-in guide · Help: {SUPPORT}")
        c.drawRightString(W - M, 32, f"Page {st['page']} of {total}")
        if st["page"] > 1:
            c.drawImage(ImageReader("/tmp/ddq/logo-navy.png"), M, H - 46, width=90, height=90 * 449 / 1917, mask="auto")
            c.setFont("Pop", 8); c.drawRightString(W - M, H - 40, f"{who} sign-in guide")
            c.setStrokeColor(TEAL); c.setLineWidth(1.2); c.line(M, H - 54, W - M, H - 54)
        st["y"] = TOP
    def new(): c.showPage(); chrome()
    def need(h):
        if st["y"] - h < BOTTOM: new()
    def text(lines, x, font, size, lead, color):
        c.setFont(font, size); c.setFillColor(color)
        for l in lines: c.drawString(x, st["y"], l); st["y"] -= lead
    chrome()
    # Cover band
    bh = 250; c.setFillColor(NAVY); c.rect(0, H - bh, W, bh, stroke=0, fill=1)
    c.setFillColor(TEAL); c.rect(0, H - bh - 4, W, 4, stroke=0, fill=1)
    c.drawImage(ImageReader("/tmp/ddq/logo-white.png"), M, H - 78, width=140, height=140 * 449 / 1917, mask="auto")
    c.setFillColor(TEAL); c.setFont("PopM", 10); c.drawString(M, H - 122, g["eyebrow"].upper())
    c.setFillColor(white); c.setFont("RubikB", 30); c.drawString(M, H - 158, g["title"])
    st["y"] = H - 186
    text(simpleSplit(g["intro"], "PopL", 11, CW), M, "PopL", 11, 15.5, HexColor("#D3DEEB"))
    # Address box
    st["y"] = H - bh - 34
    c.setFillColor(TEALBG); c.roundRect(M, st["y"] - 30, CW, 44, 8, stroke=0, fill=1)
    c.setFillColor(SLATE); c.setFont("PopM", 8.5); c.drawString(M + 16, st["y"] - 1, "YOUR SIGN-IN PAGE")
    c.setFillColor(NAVY); c.setFont("RubikB", 15); c.drawString(M + 16, st["y"] - 21, g["signInAddress"])
    c.setFont("Pop", 9); c.setFillColor(SLATE); c.drawRightString(W - M - 16, st["y"] - 19, "Keep your phone nearby for your code")
    st["y"] -= 62

    def sh(s):
        return 56 + sum(len(simpleSplit(p, "Pop", BODY, CW - 36)) * LEAD + 6 for p in s["paragraphs"]) + 30
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
    def step(n, s):
        tx = M + 36; tw = CW - 36
        paras = [simpleSplit(p, "Pop", BODY, tw) for p in s["paragraphs"]]
        h = 24 + sum(len(p) * LEAD + 6 for p in paras) + 30
        need(h)
        c.setFillColor(NAVY); c.circle(M + 12, st["y"] - 8, 12, stroke=0, fill=1)
        c.setFillColor(white); c.setFont("RubikB", 11); c.drawCentredString(M + 12, st["y"] - 12, str(n))
        c.setFillColor(NAVY); c.setFont("RubikM", 13); c.drawString(tx, st["y"] - 13, s["title"]); st["y"] -= 32
        for p in paras: text(p, tx, "Pop", BODY, LEAD, INK); st["y"] -= 6
        c.setFont("PopM", 7.5); c.setFillColor(SLATE); c.drawString(tx, st["y"], "ON SCREEN"); st["y"] -= 14
        chips(s["labels"], tx, tw); st["y"] -= 4
    heading("Your first time", sh(g["firstTime"][0]))
    for i, s in enumerate(g["firstTime"], 1): step(i, s)
    heading("Signing in next time", sh(g["nextTime"][0]))
    for i, s in enumerate(g["nextTime"], 1): step(i, s)
    heading("If something goes wrong", 80)
    for q in g["questions"]:
        ans = [simpleSplit(a, "Pop", BODY - 0.5, CW - 14) for a in q["a"]]
        need(22 + sum(len(a) * 14.5 + 4 for a in ans) + 10)
        c.setFillColor(NAVY); c.setFont("RubikM", 11.5); c.drawString(M, st["y"], q["q"]); st["y"] -= 17
        c.setStrokeColor(TEAL); c.setLineWidth(2); top = st["y"] + 10
        for a in ans: text(a, M + 14, "Pop", BODY - 0.5, 14.5, INK); st["y"] -= 4
        c.line(M + 3, top, M + 3, st["y"] + 12); st["y"] -= 12
    help_lines = [simpleSplit(h, "Pop", BODY, CW - 32) for h in g["help"]]
    hh = 40 + sum(len(l) * LEAD for l in help_lines) + 24
    need(hh + 10); st["y"] -= 4
    c.setFillColor(NAVY); c.roundRect(M, st["y"] - hh, CW, hh, 10, stroke=0, fill=1)
    st["y"] -= 26; c.setFillColor(white); c.setFont("RubikB", 14); c.drawString(M + 16, st["y"], "Still stuck?"); st["y"] -= 20
    for l in help_lines: text(l, M + 16, "Pop", BODY, LEAD, HexColor("#D3DEEB"))
    c.setFillColor(TEAL); c.setFont("PopM", 11); c.drawString(M + 16, st["y"] - 2, SUPPORT)
    c.showPage(); c.save(); return st["page"]

for a, name in [("client", "Harmonious-Client-Sign-In-Guide.pdf"), ("investor", "Harmonious-Investor-Sign-In-Guide.pdf")]:
    g = D["guides"][a]; n = build(g, "/tmp/sig/count.pdf", 0); build(g, f"/tmp/sig/{name}", n); print(name, n)
