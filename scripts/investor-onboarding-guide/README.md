# Investor onboarding guide

Builds `Harmonious-Investor-Onboarding-Guide.pdf`, the printable guide that walks an
investor through completing their investment on Harmonious (invitation, account,
details, verification, tax form, signing, funding, approval).

## Regenerate

```bash
python3 scripts/investor-onboarding-guide/export.py
python3 scripts/investor-onboarding-guide/make_pdf.py /tmp/iog/content.json
cp /tmp/iog/Harmonious-Investor-Onboarding-Guide.pdf public/downloads/
```

Content lives in `content.py`. The layout script is shared with the fund manager
guides; fonts and logos come from `/tmp/ddq` (see `scripts/portfolio-ddq`).

Copy rules: plain words, no stand-alone dashes, American spelling, no outside
platform names, support address support@harmonious.co.
