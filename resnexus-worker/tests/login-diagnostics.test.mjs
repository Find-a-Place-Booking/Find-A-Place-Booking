import test from 'node:test';
import assert from 'node:assert/strict';
import { isExplicitCredentialRejection, hasExplicitCredentialRejection } from '../src/login-diagnostics.mjs';

const examples = [
  ['Invalid username or password', true],
  ['The username or password is incorrect', true],
  ['Incorrect credentials', true],
  ['Your email is invalid', true],
  ['Sorry, invalid login details', true],
  ['Your session failed to load', false],
  ['Invalid booking reference', false],
  ['Payment failed', false],
  ['Username and password required', false],
  ['The login page failed to respond', false],
  ['Please enter a verification code', false],
  ['Account locked, please contact support', false],
  ['Sign in to ResNexus', false],
];
for (const [message, expected] of examples) {
  test(`specific credential error check: ${message}`, () => {
    assert.equal(isExplicitCredentialRejection(message), expected);
  });
}

function mockPage({alerts=[],body=''}) {
  return { locator: (selector) => selector === 'body'
      ? {innerText: async()=>body}
      : {count:async()=>alerts.length,nth:(i)=>({isVisible:async()=>alerts[i].visible,innerText:async()=>alerts[i].text})}
  };
}

test('a visible credential error identifies rejection', async () => {
  assert.equal(await hasExplicitCredentialRejection(mockPage({alerts:[{visible:true,text:'Invalid username or password'}]})),true);
});
test('nonvisible errors do not trigger rejection', async () => {
  assert.equal(await hasExplicitCredentialRejection(mockPage({alerts:[{visible:false,text:'Invalid username or password'}]})),false);
});
test('generic failure in page copy does not trigger rejection', async () => {
  assert.equal(await hasExplicitCredentialRejection(mockPage({body:'Invalid booking reference\nReservations failed to load\nLog in'})),false);
});
test('short inline text can identify a real credential error', async () => {
  assert.equal(await hasExplicitCredentialRejection(mockPage({body:'Welcome\nUsername or password is incorrect\nTry again'})),true);
});
