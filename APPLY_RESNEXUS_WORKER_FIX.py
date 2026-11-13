#!/usr/bin/env python3
"""Guarded one-time overlay for the existing FAP ResNexus worker.

Never changes credentials, Supabase data, booking blocks, or mappings.
Aborts if current files don't match expected source anchors.
"""
from pathlib import Path
import sys

ROOT = Path(__file__).resolve().parent
WORKER = ROOT / 'resnexus-worker' / 'src' / 'resnexus.mjs'
INDEX = ROOT / 'resnexus-worker' / 'src' / 'index.mjs'
FORM = ROOT / 'resnexus-worker' / 'src' / 'login-form-v2.mjs'
HOST_ACTIONS = ROOT / 'app' / 'host' / 'integrations' / 'resnexus' / 'actions.ts'

if not (WORKER.is_file() and INDEX.is_file() and FORM.is_file() and HOST_ACTIONS.is_file()):
    sys.exit('ERROR: Extract this overlay into the repository ROOT, then run the updater again.')

r = WORKER.read_text(encoding='utf-8')
i = INDEX.read_text(encoding='utf-8')
h = HOST_ACTIONS.read_text(encoding='utf-8')

if 'submitResNexusLoginForm' in r:
    print('Already patched; no existing worker code changed.')
    sys.exit(0)


def exactly_once(source: str, old: str, name: str) -> None:
    count = source.count(old)
    if count != 1:
        sys.exit(f'ERROR: Source changed. Expected {name} once, found {count}. No files modified.')

import_old = 'import { hasExplicitCredentialRejection } from "./login-diagnostics.mjs";'
import_new = (import_old + '\nimport { submitResNexusLoginForm } from "./login-form-v2.mjs";')
exactly_once(r, import_old, 'login diagnostics import')

begin = 'async function fillLogin(page, login, password) {'
end = 'async function submitChallengeIfPossible(page, challengeCode) {'
exactly_once(r, begin, 'fillLogin start')
exactly_once(r, end, 'challenge helper start')
start_index = r.index(begin)
end_index = r.index(end)
if start_index >= end_index or 'await waitForAuthTransition(page, previousUrl);' not in r[start_index:end_index]:
    sys.exit('ERROR: Login helper contents do not match expected version. No files modified.')

fill_new = '''async function fillLogin(page, login, password) {
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
}

'''

ensure_old = '''    if (await isLoginPage(page)) {
      await fillLogin(page, login, password);
    }

    let challenge = await detectChallenge(page);'''
ensure_new = '''    if (await isLoginPage(page)) {
      // A rejected or expired browser session can leave stale cookies. Re-open
      // the real login URL with a clean cookie jar before the one login attempt.
      // Preserve session cookies when a host has an active verification code.
      if (!challengeCode) {
        await context.clearCookies();
        await page.goto(LOGIN_URL, {
          waitUntil: "domcontentloaded",
          timeout: 30_000,
        });
      }
      await fillLogin(page, login, password);
    }

    let challenge = await detectChallenge(page);'''
exactly_once(r, ensure_old, 'post-calendar login block')

# Save cookies ONLY when a human verification challenge needs a resumable flow.
# On a plain rejected login, the provider's failed browser state is not useful.
index_old = '''    // Verification challenges can depend on cookies created during the failed
    // sign-in attempt. Preserve that session so a host-entered code can resume
    // the same challenge instead of restarting login from scratch.
    if (!sessionCiphertext) {
      try {
        sessionCiphertext = encryptCredential(
          JSON.stringify(await context.storageState()),
        );
      } catch {
        sessionCiphertext = null;
      }
    }'''
index_new = '''    // Persist failed-login browser state ONLY for a resumable verification
    // challenge. Never repackage an invalid-login cookie jar as a good session.
    const challengeInProgress =
      error instanceof NeedsAttentionError &&
      (error.code === "VERIFICATION_CODE_REQUIRED" ||
       error.code === "CAPTCHA_REQUIRED");
    if (challengeInProgress && !sessionCiphertext) {
      try {
        sessionCiphertext = encryptCredential(
          JSON.stringify(await context.storageState()),
        );
      } catch {
        sessionCiphertext = null;
      }
    }'''
exactly_once(i, index_old, 'failed browser session persistence block')

mark_old = '    await markFailure(account, error, sessionCiphertext);'
mark_new = '''    await markFailure(account, error, sessionCiphertext);

    // The failure RPC preserves existing sessions via COALESCE. Explicitly
    // discard a rejected-login cookie jar after recording the failure, while
    // guarding against a concurrent host reconnect/credential replacement.
    if (error instanceof NeedsAttentionError && error.code === "CREDENTIALS_REJECTED") {
      const { error: discardError } = await supabase
        .from("resnexus_browser_accounts")
        .update({ session_ciphertext: null })
        .eq("id", account.browser_account_id)
        .eq("organization_id", account.organization_id)
        .eq("status", "NEEDS_ATTENTION")
        .eq("attention_code", "CREDENTIALS_REJECTED");
      if (discardError) console.warn("[resnexus worker] unable to discard rejected browser session");
    }'''
exactly_once(i, mark_old, 'failure completion call')

# The host action previously trim()ed passwords, which can invalidate genuine
# passwords containing leading/trailing spaces. Preserve exact user input.
host_old = '  const password = field(formData, "password", 4096);'
host_new = '  const password = String(formData.get("password") ?? "").slice(0, 4096);'
exactly_once(h, host_old, 'host password input')

# All checks above finished before ANY source write.
new_r = r.replace(import_old, import_new, 1)
rs = new_r.index(begin)
re = new_r.index(end)
new_r = new_r[:rs] + fill_new + new_r[re:]
new_r = new_r.replace(ensure_old, ensure_new, 1)
new_i = i.replace(index_old, index_new, 1).replace(mark_old, mark_new, 1)
new_h = h.replace(host_old, host_new, 1)

if 'await context.clearCookies()' not in new_r or 'challengeInProgress' not in new_i or 'discardError' not in new_i or 'formData.get("password")' not in new_h:
    sys.exit('ERROR: Patch validation failed. No files modified.')

for path in (WORKER, INDEX, HOST_ACTIONS):
    backup = path.with_name(path.name + '.before-resnexus-v2.bak')
    if backup.exists():
        sys.exit(f'ERROR: Previous backup already exists ({backup.name}). No files modified.')

for path, original in ((WORKER, r), (INDEX, i), (HOST_ACTIONS, h)):
    path.with_name(path.name + '.before-resnexus-v2.bak').write_text(original, encoding='utf-8')
WORKER.write_text(new_r, encoding='utf-8')
INDEX.write_text(new_i, encoding='utf-8')
HOST_ACTIONS.write_text(new_h, encoding='utf-8')
print('Patched worker login safely. Existing source backups retained.')
print('Next: npm run check -w resnexus-worker (or cd resnexus-worker && npm run check).')
