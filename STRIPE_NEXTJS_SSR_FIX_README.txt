FIND A PLACE — NEXT.JS / STRIPE CONNECT SSR FIX

The Stripe endpoint is healthy. Your logs show repeated:
POST /api/stripe/connect/account-session 200

The real errors were caused by initializing ConnectJS during Next.js server
pre-rendering:

- ConnectJS won't load when rendering code in the server
- ERR_INVALID_URL for /api/stripe/connect/account-session

Why:
The previous component called loadConnectAndInitialize() from useMemo/render.
Next.js can pre-render Client Components on the server. That made ConnectJS run
in Node, where the relative /api/... URL is invalid.

Fix:
1. Import Stripe's side-effect-free loader:
   @stripe/connect-js/pure
2. Do NOT initialize Connect during render/useMemo.
3. Initialize it only when the host clicks Connect Stripe (browser event).
4. Use an absolute account-session URL based on window.location.origin.

The local HTTP warning is expected in sandbox:
"You may test your integration over HTTP. However, live integrations must use HTTPS."

That warning is not an error. Production/Vercel must use HTTPS.

Apply this file over the project root:
components/payments/EmbeddedStripeOnboarding.tsx

No Stripe settings, Supabase migrations, or payment-model changes are included.

Then:
Ctrl+C
npm run typecheck
npm run build
npm run dev
