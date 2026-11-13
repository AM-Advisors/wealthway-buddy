# Adding an investor guide PDF

Content lives in src/lib/add-investor-guide-content.ts. From the project root run `mkdir -p /tmp/aig && bun scripts/add-investor-guide/export.ts`, then `python3 scripts/add-investor-guide/make_pdf.py` (needs the brand fonts and logo PNGs in /tmp/ddq) and copy the PDF into public/downloads.
