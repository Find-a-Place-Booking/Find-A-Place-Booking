import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { observeResNexusLogin, inspectResNexusLoginState, _test } from '../src/auth-observation.mjs';

function request(url, method = 'POST', nav = false) {
  return { url: () => url, method: () => method, isNavigationRequest: () => nav };
}

test('observes response classes and redirects without retaining URLs or secrets', () => {
  const page = new EventEmitter();
  const diag = observeResNexusLogin(page);
  const url = 'https://resnexus.com/authenticate?password=PRIVATE&email=PRIVATE';
  const post = request(url);
  page.emit('request', post);
  page.emit('response', {request: () => post, status: () => 403 });
  const nav = request(url, 'GET', true);
  page.emit('request', nav);
  page.emit('response', {request: () => nav, status: () => 302 });
  page.emit('pageerror', Error('PRIVATE'));
  const d = diag.snapshot();
  assert.equal(d.observedServerSubmission, true);
  assert.equal(d.lastSubmitResponse, '403');
  assert.equal(d.lastNavigationResponse, '3xx');
  assert.equal(d.javascriptErrors, 1);
  assert.doesNotMatch(JSON.stringify(d), /PRIVATE|resnexus.com|password|email/i);
  diag.stop();
  page.emit('request', post);
  assert.deepEqual(diag.snapshot(), d);
});

test('ignores external requests and counts failed provider requests only', () => {
  const page = new EventEmitter();
  const diag = observeResNexusLogin(page);
  page.emit('request', request('https://example.com/auth?password=PRIVATE'));
  page.emit('requestfailed', request('https://evilresnexus.com/auth'));
  page.emit('requestfailed', request('https://resnexus.com/auth'));
  assert.equal(diag.snapshot().nonGetRequests, 0);
  assert.equal(diag.snapshot().networkFailures, 1);
  diag.stop();
});

test('classifies generic error, rate limit, lockout and code challenges without raw text', () => {
  const page = {
    locator(sel) {
      if (sel === 'body') return { innerText: async () => 'Too many attempts. A verification code was sent to john@example.com.' };
      return { count: async () => sel.includes('input:invalid') ? 2 : 1 };
    }
  };
  return inspectResNexusLoginState(page).then((state) => {
    assert.equal(state.rateLimited, true);
    assert.equal(state.verificationHint, true);
    assert.equal(state.invalidFieldCount, 2);
    assert.doesNotMatch(JSON.stringify(state), /john|example.com|code was sent/);
  });
});

test('does not equate generic failure to password rejection', () => {
  const result = _test.classifyText('Unable to sign in. Please try again.');
  assert.equal(result.genericLoginError, true);
  assert.equal(result.accountLocked, false);
  assert.equal(result.passwordReset, false);
});

test('never classifies a non-HTTPS lookalike as a provider request', () => {
  const page = new EventEmitter();
  const diag = observeResNexusLogin(page);
  page.emit('request', request('http://resnexus.com/login'));
  page.emit('request', request('https://resnexus.com.evil.com/login'));
  assert.equal(diag.snapshot().nonGetRequests, 0);
  diag.stop();
});
