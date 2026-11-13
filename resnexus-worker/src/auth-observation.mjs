/**
 * ResNexus authentication diagnostic telemetry (privacy-safe).
 *
 * This module NEVER records URLs, query strings, form bodies, headers,
 * cookies, usernames, passwords, HTML, or raw error text. It retains only
 * whitelisted categorical signals and bounded counters during one attempt.
 */

function providerRequest(request) {
  try {
    const parsed = new URL(request.url());
    return parsed.protocol === 'https:' &&
      (parsed.hostname === 'resnexus.com' || parsed.hostname.endsWith('.resnexus.com'));
  } catch {
    return false;
  }
}

function getMethod(request) {
  try { return String(request.method()).toUpperCase(); } catch { return ''; }
}

function statusCategory(code) {
  if (code === 401 || code === 403 || code === 429) return String(code);
  if (code >= 200 && code < 600) return `${Math.floor(code / 100)}xx`;
  return 'other';
}

/** Observe a single login submit, then call stop(). No network content is read. */
export function observeResNexusLogin(page) {
  const state = {
    nonGetRequests: 0,
    nonGetResponses: 0,
    documentNavigations: 0,
    networkFailures: 0,
    javascriptErrors: 0,
    lastSubmitResponse: 'none',
    lastNavigationResponse: 'none',
  };
  const onRequest = (request) => {
    if (!providerRequest(request)) return;
    if (!['GET', 'HEAD', 'OPTIONS'].includes(getMethod(request))) {
      state.nonGetRequests = Math.min(20, state.nonGetRequests + 1);
    }
  };
  const onResponse = (response) => {
    try {
      const request = response.request();
      if (!providerRequest(request)) return;
      if (!['GET', 'HEAD', 'OPTIONS'].includes(getMethod(request))) {
        state.nonGetResponses = Math.min(20, state.nonGetResponses + 1);
        state.lastSubmitResponse = statusCategory(response.status());
      }
      if (request.isNavigationRequest()) {
        state.documentNavigations = Math.min(20, state.documentNavigations + 1);
        state.lastNavigationResponse = statusCategory(response.status());
      }
    } catch {
      // No raw network diagnostics may escape.
    }
  };
  const onRequestFailed = (request) => {
    if (providerRequest(request)) state.networkFailures = Math.min(20, state.networkFailures + 1);
  };
  const onPageError = () => { state.javascriptErrors = Math.min(20, state.javascriptErrors + 1); };

  page.on('request', onRequest);
  page.on('response', onResponse);
  page.on('requestfailed', onRequestFailed);
  page.on('pageerror', onPageError);
  return {
    snapshot() {
      return { ...state, observedServerSubmission: state.nonGetRequests > 0 };
    },
    stop() {
      page.off('request', onRequest);
      page.off('response', onResponse);
      page.off('requestfailed', onRequestFailed);
      page.off('pageerror', onPageError);
    },
  };
}

function classifyText(text) {
  const s = String(text || '').toLowerCase();
  return {
    accountLocked: /\b(?:account|login|user)\s+(?:is\s+)?(?:temporarily\s+)?locked\b|\blocked\s+out\b/.test(s),
    rateLimited: /too many (?:attempts|login|sign-in)|try again (?:in|after)\s+\d|temporarily blocked/.test(s),
    passwordReset: /password (?:has\s+)?expired|(?:reset|change) your password/.test(s),
    accessDenied: /access denied|access is denied|unusual (?:sign[ -]?in|activity)|not authorized/.test(s),
    verificationHint: /(?:one[ -]?time|verification|security|authentication) code|two[ -]?factor|2fa/.test(s),
    genericLoginError: /unable to log in|unable to sign in|sign-in failed|login failed|please try again|something went wrong/.test(s),
  };
}

/** Classify signals on a page; never return raw text or credential values. */
export async function inspectResNexusLoginState(page) {
  const text = await page.locator('body').innerText().catch(() => '');
  const signals = classifyText(text);
  const invalidFields = await page.locator('input:invalid:visible').count().catch(() => 0);
  const alertLocator = page.locator(
    '[role="alert"]:visible, [aria-live="assertive"]:visible, ' +
    '.validation-summary-errors:visible, .field-validation-error:visible, ' +
    '.alert-danger:visible, .login-error:visible, .error-message:visible'
  );
  const visibleAlerts = await alertLocator.count().catch(() => 0);
  return {
    ...signals,
    invalidFieldCount: Math.min(20, Math.max(0, invalidFields)),
    visibleAlertCount: Math.min(20, Math.max(0, visibleAlerts)),
  };
}

// Only for tests; takes synthetic non-secret strings.
export const _test = { classifyText, statusCategory };
