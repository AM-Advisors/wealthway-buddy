# Branded sign-in emails from Harmonious

## Problem
Sign-in emails (confirm signup, password reset, invites, magic links, email change, security codes) still use the default sender `no-reply@auth.lovable.cloud`, named "Harmonious-Platform-V3", with a plain black-and-white layout. Your own sending domain `notify.harmonious.co` is already verified, but no branded sign-in templates exist yet, so these emails fall back to the default.

## What changes
- All six sign-in emails send from **Harmonious <noreply@notify.harmonious.co>** (sender name "Harmonious", not "Harmonious-Platform-V3").
- Each email uses Harmonious branding: logo, navy #142647 heading/button, teal #5DC6D1 accent, ink #221F20 text, white background, Rubik headings and Poppins body with safe fallbacks.
- Copy is rewritten in Harmonious voice, e.g. "Confirm your email to finish setting up your Harmonious account" with a navy "Confirm email" button; no "app!" wording, no mention of Lovable.
- Subjects: "Confirm your Harmonious account", "Reset your Harmonious password", "You're invited to Harmonious", "Your Harmonious sign-in link", "Confirm your new email address", "Your Harmonious verification code".
- Footer: "Harmonious · harmonious.co" plus the "didn't request this" line.

## After it ships
- Takes effect once published. Then send yourself a test signup or password reset and check that the sender is notify.harmonious.co.
- More → Emails shows delivery for each email.

## Technical details
- Run the auth email template scaffold, which creates `src/routes/lovable/email/auth/webhook.ts` and six templates in `src/lib/email-templates/`. Set `SITE_NAME = "Harmonious"` and leave the scaffolded sender, API and domain constants unchanged.
- Style the templates with inline brand constants that match the existing transactional templates (for example `sale-signed.tsx`), and reuse the existing hosted logo URL from those templates.
- Make sure the root/start middleware passes `/lovable/*` through without redirects.
- Fix the memory note: the verified sender is notify.harmonious.co, not notify.onboarding.harmonious.co.
