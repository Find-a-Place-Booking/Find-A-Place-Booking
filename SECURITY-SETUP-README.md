# Find A Place — Account Security Overlay

## What's in the overlay

Complete replacement files: `app/auth/actions.ts`, host signup/sign-in pages, admin sign-in page, password-reset page, plus a new `components/AuthCaptcha.tsx` component.

This supplies Cloudflare Turnstile tokens to Supabase Auth for email/password signup, host login, admin login and password recovery. It deliberately does not alter host bookings, Stripe, or calendar code.

## CRITICAL: Supabase must enforce CAPTCHA on its Auth API

A website-only challenge does **not** stop scripts from calling Supabase `/auth/v1/signup` directly with your public API key. To close that route, enable **CAPTCHA at the Supabase Auth provider**. Merely deploying this overlay is NOT sufficient.

Deployment sequence:

1. Confirm `NEXT_PUBLIC_TURNSTILE_SITE_KEY` exists in Vercel's environment and is allowed for your live and preview domains in Cloudflare Turnstile. Booking currently uses this same site key.
2. Extract this ZIP over your repository. Commit and deploy. Confirm the security widget renders on **host signup**, **host sign-in**, **admin sign-in**, and **password reset**. Do not enable Supabase CAPTCHA until those routes are deployed.
3. Go to Supabase Dashboard → **Authentication → Bot and Abuse Protection** (or Auth > Protection). Enable CAPTCHA, choose **Cloudflare Turnstile**, paste the corresponding **Turnstile Secret Key** privately into Supabase's settings, and Save. It must correspond to the public site key used by the new AuthCaptcha component. Do NOT add this key to GitHub or public variables.
4. Confirm a legitimate host can complete signup, verify email, sign in, and initiate password recovery. Confirm an authorized admin can sign in. Use preview/staging for tests where possible; avoid creating production fake users.
5. Confirm a direct signup to the Supabase Auth API **without `captcha_token` is rejected**. You do not need to provide user credentials or keys to anyone to perform this test.
6. Keep **Confirm email** enabled; review Auth rate limits and CAPTCHA traffic in Supabase, and consider admin/host MFA after testing.

Official docs: https://supabase.com/docs/guides/auth/auth-captcha

## Why this matters

On October 24, 2026 an automated probe account was created and verified directly through Supabase Auth. Logs showed scripted reads of protected REST tables and several rejected writes to organization/admin resources. The sensitive table reads generally returned empty arrays (`[]`), and row-level security protected cross-account access. The account was revoked and deleted from the live database.

Never copy the leaked probe email/IP into a global IP-block rule: the traffic originated from multiple addresses, and malicious scripts can rotate them. Enable the provider-level CAPTCHA instead.

## Rollback

Reverting the frontend overlay while Supabase CAPTCHA is enabled will break normal signups/signins/password resets. To roll back, first coordinate the Supabase CAPTCHA setting and deploy the previous code. Keep email confirmation and rate limits enabled.
