# Turnstile checkout logging patch

Adds searchable Vercel runtime logging for Cloudflare Turnstile without logging tokens, secrets, guest PII, or IP addresses.

Search Vercel runtime logs for:

    [checkout security]

You will see events such as:
- Turnstile verified
- Turnstile verification rejected
- Turnstile token missing or invalid
- Turnstile Siteverify request failed
- Turnstile Siteverify returned HTTP error
- Turnstile client event { event: "expired" }
- Turnstile client event { event: "error" }

The server rejection log includes Cloudflare error codes, returned action, hostname, expected hostname, and challenge timestamp when Cloudflare provides them.
