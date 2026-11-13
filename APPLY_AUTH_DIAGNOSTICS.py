#!/usr/bin/env python3
"""Fail-closed, idempotent overlay patch for the ResNexus worker.
No Supabase/Stripe/calendar mutations. Runs against the checked source anchors.
"""
from __future__ import annotations

import hashlib
import pathlib
import sys

ROOT = pathlib.Path(__file__).resolve().parent
TARGET = ROOT / 'resnexus-worker' / 'src' / 'resnexus.mjs'
NEW_MODULE = ROOT / 'resnexus-worker' / 'src' / 'auth-observation.mjs'

PATCHES = [
    (
        'import { submitResNexusLoginForm } from "./login-form-v2.mjs";',
        'import { submitResNexusLoginForm } from "./login-form-v2.mjs";\n'
        'import { observeResNexusLogin, inspectResNexusLoginState } from "./auth-observation.mjs";',
    ),
    (
        '''async function waitForAuthTransition(page, previousUrl) {
  // A response from ResNexus may take more than 1.5s; wait for the login form
  // to disappear OR the URL to change, with a bounded 6-second fallback.
  await Promise.race([
    page
      .waitForURL((url) => url.toString() !== previousUrl, {
        timeout: 8_000,
      })
      .catch(() => null),
    page
      .locator('input[type="password"]')
      .first()
      .waitFor({ state: "hidden", timeout: 8_000 })
      .catch(() => null),
    page.waitForTimeout(6_000),
  ]);

  await page
    .waitForLoadState("domcontentloaded", {
      timeout: 8_000,
    })
    .catch(() => null);

  await page.waitForTimeout(500);
}''',
        '''async function waitForAuthTransition(page, previousUrl) {
  // Do not declare a login unsuccessful just because an AJAX submit or
  // redirect takes longer than the old six-second race. Never re-submit.
  const deadline = Date.now() + 16_000;
  while (Date.now() < deadline) {
    if (page.url() !== previousUrl) break;
    const passwordVisible = await page
      .locator('input[type="password"]:visible')
      .count()
      .then((count) => count > 0)
      .catch(() => false);
    if (!passwordVisible) break;
    await page.waitForTimeout(400);
  }

  await page
    .waitForLoadState("domcontentloaded", { timeout: 8_000 })
    .catch(() => null);
  await page.waitForTimeout(1_000);
}''',
    ),
    (
        '''async function fillLogin(page, login, password) {
  const result = await submitResNexusLoginForm({
    page, login, password, waitForTransition: waitForAuthTransition,
  });
  if (!result.submitted) {
    throw new NeedsAttentionError(
      "LOGIN_FORM_CHANGED",
      "The ResNexus login form could not be submitted safely. The worker did not guess which field or button to use.",
      { stage: "pre_submit", observation: result.observation },
    );
  }
}''',
        '''async function fillLogin(page, login, password) {
  const result = await submitResNexusLoginForm({
    page, login, password, waitForTransition: waitForAuthTransition,
  });
  if (!result.submitted) {
    throw new NeedsAttentionError(
      "LOGIN_FORM_CHANGED",
      "The ResNexus login form could not be submitted safely. The worker did not guess which field or button to use.",
      { stage: "pre_submit", observation: result.observation },
    );
  }
  return result;
}''',
    ),
    (
        '''}) {
  const page = await context.newPage();

  try {
    await page.goto(CALENDAR_URL,''',
        '''}) {
  const page = await context.newPage();
  let loginObservation = null;
  let loginSubmission = null;

  try {
    await page.goto(CALENDAR_URL,''',
    ),
    (
        '''      await fillLogin(page, login, password);
    }

    let challenge = await detectChallenge(page);''',
        '''      // Observe only categorical network facts; never any request
      // body, header, cookie, query, URL or account content.
      const observer = observeResNexusLogin(page);
      try {
        loginSubmission = await fillLogin(page, login, password);
      } catch (error) {
        if (error instanceof NeedsAttentionError) {
          error.diagnostic = {
            ...error.diagnostic,
            submissionNetwork: observer.snapshot(),
          };
        }
        throw error;
      } finally {
        loginObservation = observer.snapshot();
        observer.stop();
      }
    }

    let challenge = await detectChallenge(page);''',
    ),
    (
        '''    if (challenge) {
      throw new NeedsAttentionError(challenge.code, challenge.message);
    }

    if (await isLoginPage(page)) {''',
        '''    if (challenge) {
      throw new NeedsAttentionError(challenge.code, challenge.message, {
        stage: "challenge",
        observation: "provider_requested_human_verification",
        submissionNetwork: loginObservation,
      });
    }

    if (await isLoginPage(page)) {''',
    ),
    (
        '''      const diagnostic = {
        stage: "post_login",
        observation: explicitlyRejected
          ? "explicit_credential_validation_error"
          : "login_form_visible_without_credential_validation",
      };''',
        '''      const diagnostic = {
        stage: "post_login",
        observation: explicitlyRejected
          ? "explicit_credential_validation_error"
          : "login_form_visible_without_credential_validation",
        formSubmission: loginSubmission?.observation || "not_submitted_by_worker",
        submissionNetwork: loginObservation,
        visiblePageSignals: await inspectResNexusLoginState(page),
      };''',
    ),
    (
        '''    if (await isLoginPage(page)) {
      throw new NeedsAttentionError(
        "LOGIN_REQUIRED",
        "ResNexus returned to the login page after sign-in.",
      );
    }

    return page;''',
        '''    if (await isLoginPage(page)) {
      throw new NeedsAttentionError(
        "LOGIN_REQUIRED",
        "ResNexus returned to the login page after sign-in.",
        {
          stage: "calendar_redirect",
          observation: "provider_returned_login_form",
          submissionNetwork: loginObservation,
          visiblePageSignals: await inspectResNexusLoginState(page),
        },
      );
    }

    return page;''',
    ),
]


def patch(source: str) -> tuple[str, int]:
    changed = 0
    for old, new in PATCHES:
        old_count = source.count(old)
        new_count = source.count(new)
        if new_count == 1:
            # Already applied; the new import intentionally contains the old line.
            pass
        elif old_count == 1:
            source = source.replace(old, new, 1)
            changed += 1
        else:
            raise ValueError(f'Unexpected source shape at patch {changed + 1}: old={old_count} new={new_count}. Nothing was written.')
    return source, changed


def main():
    if not TARGET.is_file():
        sys.exit(f'Missing {TARGET}. Extract ZIP into the ROOT of the Find A Place repository, then run it again.')
    if not NEW_MODULE.is_file():
        sys.exit(f'Missing {NEW_MODULE}. Extract the complete ZIP.')
    current = TARGET.read_text(encoding='utf-8')
    try:
        updated, changed = patch(current)
    except ValueError as e:
        sys.exit(f'SAFE STOP: {e}')

    if changed:
        # Nothing is written until all anchors validate.
        TARGET.write_text(updated, encoding='utf-8')
    print(f'ResNexus auth diagnostics patched: {changed} new changes; {len(PATCHES) - changed} already present')
    print(f'worker source sha256: {hashlib.sha256(updated.encode()).hexdigest()}')
    print('Run: cd resnexus-worker && npm run check && node --test tests/auth-observation.test.mjs')
    print('Then push to main. Railway will rebuild and deploy the worker from GitHub.')

if __name__ == '__main__':
    main()
