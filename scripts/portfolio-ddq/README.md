# Portfolio company due diligence questionnaire

`content.py` is the single source of the questions. The three generators build the Word, fillable PDF and Excel files that ship in `public/downloads/` and appear on the fund Documents tab. They expect the Harmonious logo PNGs and brand fonts in `/tmp/ddq/`; edit `content.py`, regenerate all three, and replace the files in `public/downloads/` together so the formats never disagree.
