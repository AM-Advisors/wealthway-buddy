# Make the website readable in dark mode

## What will change
- Fix the dark-theme text on the website’s permanently dark navy-to-black banners. Their text currently uses the theme’s `primary-foreground`, which becomes near-black in dark mode even though the banner stays dark. Give these banners a stable light-text role so headings, descriptions, and outline links remain readable in either theme.
- Check the shared website header, footer, buttons, service sections, and public pages for the same dark-on-dark problem. Keep the existing Harmonious branding and light-mode appearance; adjust only colors that lose contrast in dark mode. Ensure the navy logo switches to a legible variant against a dark header.
- Leave portal permissions, data, workflows, and copy unchanged.

## Verification
- Review the home page and representative public pages at desktop and mobile sizes in both light and dark modes, including open navigation menus, dark banners, calls to action, and footer. Check text and control contrast and fix any remaining unreadable combinations.

## Technical approach
- Use semantic theme tokens or explicit dark-mode variants in the website presentation code; do not change the global `primary-foreground` token because it is correctly dark text on the dark theme’s teal primary buttons and surfaces.
