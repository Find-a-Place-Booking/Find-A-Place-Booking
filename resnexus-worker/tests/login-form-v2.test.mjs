import test from 'node:test';
import assert from 'node:assert/strict';
import { submitResNexusLoginForm } from '../src/login-form-v2.mjs';

class Locator {
  constructor(kind, actions, config) { this.kind = kind; this.actions = actions; this.config = config; }
  async count() { return this.config[this.kind] ?? 1; }
  first() { return this; }
  locator(selector) {
    const next = selector.startsWith('xpath=') ? 'form' :
      selector.startsWith('input[autocomplete') ? 'username' : 'submit';
    this.actions.push(['locate', this.kind, next]);
    return new Locator(next, this.actions, this.config);
  }
  async fill(v) { this.actions.push(['fill', this.kind, v]); }
  async click() { this.actions.push(['click', this.kind]); }
  async press(k) { this.actions.push(['press', this.kind, k]); }
}
function pageFactory(config = {}) {
  const actions = [];
  const page = {
    url() { return 'https://resnexus.com/login'; },
    locator(sel) {
      assert.match(sel, /input\[type="password"\]/);
      actions.push(['locate', 'page', 'password']);
      return new Locator('password', actions, config);
    },
  };
  return { page, actions };
}

test('scopes fields and submit to password input parent form, never header', async () => {
  const {page,actions} = pageFactory();
  const result = await submitResNexusLoginForm({ page, login:'example@example.com',password:'dummy',waitForTransition: async()=>actions.push(['wait']) });
  assert.deepEqual(result,{submitted:true,observation:'login_form_submitted'});
  assert.ok(actions.some(a=>a.join(':')==='locate:password:form'));
  assert.ok(actions.some(a=>a.join(':')==='locate:form:username'));
  assert.ok(actions.some(a=>a.join(':')==='locate:form:submit'));
  assert.ok(actions.some(a=>a.join(':')==='click:submit'));
  assert.ok(actions.some(a=>a.join(':')==='wait'));
});

test('rejects ambiguous password inputs without submitting', async () => {
  const {page,actions} = pageFactory({password:2});
  const result= await submitResNexusLoginForm({ page,login:'test',password:'test',waitForTransition:async()=>{} });
  assert.equal(result.observation,'password_field_missing_or_ambiguous');
  assert.ok(!actions.some(x=>x[0]==='click'));
});

test('rejects multiple login candidates rather than guessing', async () => {
  const {page,actions} = pageFactory({username:2});
  const result= await submitResNexusLoginForm({ page,login:'test',password:'test',waitForTransition:async()=>{} });
  assert.equal(result.observation,'login_identifier_missing_or_ambiguous');
  assert.ok(!actions.some(x=>x[0]==='fill'));
});

test('uses Enter in the correct form if no submit button is present', async () => {
  const {page,actions} = pageFactory({submit:0});
  const result= await submitResNexusLoginForm({ page,login:'test',password:'test',waitForTransition:async()=>{} });
  assert.ok(result.submitted);
  assert.ok(actions.some(a=>a.join(':')==='press:password:Enter'));
});

test('rejects ambiguous submit controls rather than clicking the wrong one', async () => {
  const {page,actions} = pageFactory({submit:2});
  const result= await submitResNexusLoginForm({page,login:'test',password:'test',waitForTransition:async()=>{}});
  assert.equal(result.observation,'submit_control_ambiguous');
  assert.ok(!actions.some(x=>x[0]==='click'));
});
