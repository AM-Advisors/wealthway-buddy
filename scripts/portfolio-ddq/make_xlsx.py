import json
from openpyxl import Workbook
from openpyxl.styles import Font, PatternFill, Alignment, Border, Side
from openpyxl.worksheet.datavalidation import DataValidation
from openpyxl.formatting.rule import FormulaRule
from openpyxl.drawing.image import Image as XImg
D = json.load(open("/tmp/ddq/content.json"))
NAVY, TEAL, INK, SLATE, LINE, FILL, TEALBG = "142647", "5DC6D1", "221F20", "415B81", "D5DCE6", "F6F8FB", "E8F6F8"
F = lambda **k: Font(name="Arial", size=k.pop("size", 10), color=k.pop("color", INK), **k)
fill = lambda c: PatternFill("solid", start_color=c)
thin = Side(style="thin", color=LINE); BOX = Border(left=thin, right=thin, top=thin, bottom=thin)
wrap = Alignment(wrap_text=True, vertical="top")
wb = Workbook()

ws = wb.active; ws.title = "Instructions"
ws.sheet_view.showGridLines = False
ws.column_dimensions["A"].width = 3; ws.column_dimensions["B"].width = 100
ws.page_setup.fitToWidth = 1; ws.page_setup.fitToHeight = 0; ws.sheet_properties.pageSetUpPr.fitToPage = True
img = XImg("/tmp/ddq/logo-navy.png"); img.width, img.height = 190, int(190 * 449 / 1917); ws.add_image(img, "B2")
ws.row_dimensions[2].height = 40
ws["B4"] = "DUE DILIGENCE"; ws["B4"].font = F(size=9, bold=True, color=TEAL)
ws["B5"] = D["title"]; ws["B5"].font = F(size=20, bold=True, color=NAVY); ws.row_dimensions[5].height = 30
n = sum(len(s["questions"]) for s in D["sections"])
ws["B6"] = f"{len(D['sections'])} sections · {n} questions · for companies at every stage, from pre-seed to growth."; ws["B6"].font = F(color=SLATE)
ws["B8"] = "How to complete this workbook"; ws["B8"].font = F(size=12, bold=True, color=NAVY)
steps = ["Fill in the Company Information tab first.",
 "On the Questionnaire tab, type each answer in the Response column and choose a Document status where a document is requested.",
 *D["instructions"],
 "The Progress tab updates automatically as you answer. The Document Checklist tab lists every requested document in one place."]
r = 9
for t in steps:
    ws.cell(r, 2, "•  " + t).font = F(); ws.cell(r, 2).alignment = Alignment(wrap_text=True, vertical="top"); r += 1
r += 1
ws.cell(r, 2, "Stage markers").font = F(size=12, bold=True, color=NAVY); r += 1
ws.cell(r, 2, "All stages: every company answers.").font = F(); r += 1
ws.cell(r, 2, "Growth: Series B or later, or companies with meaningful revenue. Earlier companies answer if it applies or write N/A.").font = F(); ws.cell(r, 2).alignment = Alignment(wrap_text=True); r += 2
ws.cell(r, 2, "Harmonious · harmonious.co").font = F(size=8, color=SLATE)

ci = wb.create_sheet("Company Information"); ci.sheet_view.showGridLines = False
ci.column_dimensions["A"].width = 44; ci.column_dimensions["B"].width = 60
ci["A1"] = "Company information"; ci["A1"].font = F(size=14, bold=True, color=NAVY); ci.row_dimensions[1].height = 24
for i, l in enumerate(D["company"], 3):
    a = ci.cell(i, 1, l); a.font = F(bold=True, color=SLATE, size=9); a.fill = fill(FILL); a.border = BOX; a.alignment = Alignment(vertical="center", wrap_text=True)
    b = ci.cell(i, 2); b.border = BOX; b.alignment = Alignment(vertical="center", wrap_text=True); ci.row_dimensions[i].height = 22
stage_dv = DataValidation(type="list", formula1='"Pre-seed,Seed,Series A,Series B,Series C or later,Growth"', allow_blank=True)
ci.add_data_validation(stage_dv); stage_dv.add("B7")
cr = 3 + len(D["company"]) + 1
ci.cell(cr, 1, "Certification").font = F(size=12, bold=True, color=NAVY)
ci.cell(cr + 1, 1, D["cert"]).font = F(size=9); ci.merge_cells(start_row=cr + 1, start_column=1, end_row=cr + 1, end_column=2)
ci.cell(cr + 1, 1).alignment = Alignment(wrap_text=True, vertical="top"); ci.row_dimensions[cr + 1].height = 54
for j, l in enumerate(D["certFields"], cr + 2):
    a = ci.cell(j, 1, l); a.font = F(bold=True, color=SLATE, size=9); a.fill = fill(FILL); a.border = BOX
    ci.cell(j, 2).border = BOX; ci.row_dimensions[j].height = 22

q = wb.create_sheet("Questionnaire")
hdr = ["Section", "No.", "Question", "Stage", "Documents requested", "Response", "Document status", "File name or data room location", "Notes for the fund"]
widths = [24, 6, 60, 11, 30, 60, 16, 30, 30]
for c, (h, w) in enumerate(zip(hdr, widths), 1):
    x = q.cell(1, c, h); x.font = F(bold=True, color="FFFFFF", size=10); x.fill = fill(NAVY); x.alignment = Alignment(vertical="center", wrap_text=True); x.border = BOX
    q.column_dimensions[x.column_letter].width = w
q.row_dimensions[1].height = 30
r = 2
for si, s in enumerate(D["sections"], 1):
    for qi, item in enumerate(s["questions"], 1):
        vals = [f"{si}. {s['title']}", f"{si}.{qi}", item["q"], "All stages" if item["stage"] == "All" else "Growth", item["docs"] or "", None, None if item["docs"] else "Not requested", None, None]
        for c, v in enumerate(vals, 1):
            x = q.cell(r, c, v); x.font = F(size=9, color=SLATE if c in (1, 4, 5) else INK, bold=(c == 2)); x.alignment = wrap; x.border = BOX
            if c in (6, 7, 8, 9): x.fill = fill(FILL)
        q.cell(r, 2).font = F(size=9, bold=True, color=NAVY)
        if item["stage"] == "All": q.cell(r, 4).fill = fill(TEALBG)
        else: q.cell(r, 4).fill = fill(NAVY); q.cell(r, 4).font = F(size=9, bold=True, color="FFFFFF")
        q.row_dimensions[r].height = max(30, 13 * (len(item["q"]) // 70 + 1) + 6)
        r += 1
last = r - 1
dv = DataValidation(type="list", formula1='"Attached,In data room,To follow,Not applicable,Not requested"', allow_blank=True)
q.add_data_validation(dv); dv.add(f"G2:G{last}")
q.freeze_panes = "D2"; q.auto_filter.ref = f"A1:I{last}"
q.conditional_formatting.add(f"F2:F{last}", FormulaRule(formula=["LEN(TRIM(F2))>0"], fill=fill("E9F7EC")))
q.print_title_rows = "1:1"; q.page_setup.orientation = "landscape"; q.page_setup.fitToWidth = 1; q.page_setup.fitToHeight = 0; q.sheet_properties.pageSetUpPr.fitToPage = True

dc = wb.create_sheet("Document Checklist")
dh = ["No.", "Section", "Document requested", "Stage", "Status (from Questionnaire)"]
for c, (h, w) in enumerate(zip(dh, [7, 30, 48, 11, 26]), 1):
    x = dc.cell(1, c, h); x.font = F(bold=True, color="FFFFFF"); x.fill = fill(NAVY); x.border = BOX; x.alignment = Alignment(vertical="center", wrap_text=True)
    dc.column_dimensions[x.column_letter].width = w
dr = 2
for qr in range(2, last + 1):
    if q.cell(qr, 5).value:
        dc.cell(dr, 1, f"=Questionnaire!B{qr}"); dc.cell(dr, 2, f"=Questionnaire!A{qr}"); dc.cell(dr, 3, f"=Questionnaire!E{qr}"); dc.cell(dr, 4, f"=Questionnaire!D{qr}")
        dc.cell(dr, 5, f'=IF(Questionnaire!G{qr}="","Not yet provided",Questionnaire!G{qr})')
        for c in range(1, 6):
            x = dc.cell(dr, c); x.font = F(size=9, color="008000" if c < 5 else INK); x.border = BOX; x.alignment = wrap
        dr += 1
dlast = dr - 1
dc.freeze_panes = "A2"; dc.auto_filter.ref = f"A1:E{dlast}"
dc.conditional_formatting.add(f"E2:E{dlast}", FormulaRule(formula=['E2="Not yet provided"'], fill=fill("FFF4E5")))

pg = wb.create_sheet("Progress", 1); pg.sheet_view.showGridLines = False
ph = ["Section", "Questions", "All-stage questions", "Answered", "All-stage answered", "% answered", "Documents requested", "Documents provided"]
for c, (h, w) in enumerate(zip(ph, [42, 11, 13, 11, 13, 12, 13, 13]), 1):
    x = pg.cell(1, c, h); x.font = F(bold=True, color="FFFFFF"); x.fill = fill(NAVY); x.border = BOX; x.alignment = Alignment(vertical="center", wrap_text=True)
    pg.column_dimensions[x.column_letter].width = w
pg.row_dimensions[1].height = 30
QR = f"Questionnaire!$A$2:$A${last}"; ST = f"Questionnaire!$D$2:$D${last}"; RS = f"Questionnaire!$F$2:$F${last}"; DQ = f"Questionnaire!$E$2:$E${last}"; DS = f"Questionnaire!$G$2:$G${last}"
for i, s in enumerate(D["sections"], 2):
    pg.cell(i, 1, f"{i-1}. {s['title']}")
    pg.cell(i, 2, f'=COUNTIF({QR},A{i})')
    pg.cell(i, 3, f'=COUNTIFS({QR},A{i},{ST},"All stages")')
    pg.cell(i, 4, f'=COUNTIFS({QR},A{i},{RS},"?*")')
    pg.cell(i, 5, f'=COUNTIFS({QR},A{i},{ST},"All stages",{RS},"?*")')
    pg.cell(i, 6, f'=IF(B{i}=0,0,D{i}/B{i})')
    pg.cell(i, 7, f'=COUNTIFS({QR},A{i},{DQ},"?*")')
    pg.cell(i, 8, f'=COUNTIFS({QR},A{i},{DS},"Attached")+COUNTIFS({QR},A{i},{DS},"In data room")+COUNTIFS({QR},A{i},{DS},"Not applicable")')
tr = len(D["sections"]) + 2
pg.cell(tr, 1, "Total")
for c, L in zip(range(2, 9), "BCDEFGH"):
    pg.cell(tr, c, f"=IF(B{tr}=0,0,D{tr}/B{tr})" if L == "F" else f"=SUM({L}2:{L}{tr-1})")
for rr in range(2, tr + 1):
    for c in range(1, 9):
        x = pg.cell(rr, c); x.border = BOX; x.font = F(size=9, bold=(rr == tr), color=NAVY if rr == tr else INK)
        if c == 6: x.number_format = "0.0%"
        if rr == tr: x.fill = fill(TEALBG)
from openpyxl.workbook.properties import CalcProperties
for sh in (ci, pg, dc):
    sh.page_setup.fitToWidth = 1; sh.page_setup.fitToHeight = 0; sh.sheet_properties.pageSetUpPr.fitToPage = True
pg.page_setup.orientation = "landscape"
wb.calculation = CalcProperties(fullCalcOnLoad=True)
wb.save("/tmp/ddq/out/Harmonious-Portfolio-Company-DDQ.xlsx")
print(last - 1, "questions", dlast - 1, "documents")
