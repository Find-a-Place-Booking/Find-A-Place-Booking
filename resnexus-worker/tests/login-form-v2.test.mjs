import test from 'node:test';
import assert from 'node:assert/strict';
import { _test, submitResNexusLoginForm } from '../src/login-form-v2.mjs';

const pick = _test.actionChoice;
const control = (type, hint, disabled = false) => ({ type, hint, disabled });

test('prefers the named JavaScript login button over an unrelated generic submit', () => {
  assert.deepEqual(pick([control('submit','Continue'),control('button','Login')]), {
    index:1, method:'named_login_control',
  });
});
test('recognizes a JavaScript anchor with a Login label', () => {
  assert.deepEqual(pick([control('','Log in')]), {index:0,method:'named_login_control'});
});
test('recognizes element IDs such as btnLogin (hint normalized by caller)', () => {
  assert.deepEqual(pick([control('button','btnLogin')]), {index:0,method:'named_login_control'});
});
test('uses single native submit if no named login exists', () => {
  assert.deepEqual(pick([control('submit','Continue')]), {index:0,method:'single_form_submit'});
});
test('does not pick disabled named login or fall back to enter', () => {
  assert.equal(pick([control('button','Log in',true)]).error,'login_control_disabled');
});
test('does not pick a social login, reset password, sign up, or header control', () => {
  assert.equal(pick([control('button','Sign in with Google'),control('button','Forgot password')]).error,'ambiguous_or_disabled_controls');
});
test('does not choose among two possible named login actions', () => {
  assert.equal(pick([control('button','Login'),control('submit','Sign in')]).error,'multiple_login_controls');
});
test('does not guess between two submit actions', () => {
  assert.equal(pick([control('submit','Continue'),control('submit','Next')]).error,'multiple_submit_controls');
});
test('requires explicit login label for the nearby wrapper fallback', () => {
  assert.deepEqual(pick([control('button','Continue')],{explicitOnly:true}), {index:null,method:'none'});
  assert.deepEqual(pick([control('button','Login')],{explicitOnly:true}), {index:0,method:'named_login_control'});
});

test('one click only on a JS login control, never submits twice', async () => {
  const actions=[];
  const controls = {
    evaluateAll:async()=>[control('button','Log in'),control('button','Forgot password')],
    nth:(index)=>({ isEnabled:async()=>true, click:async()=>actions.push(`clicked:${index}`) }),
  };
  const form = { count:async()=>1, locator:(selector)=>selector.includes('button:visible') ? controls : {count:async()=>1,first:()=>({fill:async()=>actions.push('filled-login')})} };
  const password = { locator:()=>form, fill:async()=>actions.push('filled-password'), press:async(k)=>actions.push(`key:${k}`) };
  const page = {url:()=>'/login', waitForTimeout:async()=>{}, locator:()=>({ count:async()=>1, first:()=>password })};
  const output=await submitResNexusLoginForm({page,login:'fake@example.com',password:'fake-password',waitForTransition:async()=>actions.push('wait')});
  assert.equal(output.submitted,true);
  assert.equal(output.method,'named_login_control');
  assert.equal(output.observation,'login_form_submitted_via_named_login_control');
  assert.deepEqual(actions,['filled-login','filled-password','key:Tab','clicked:0','wait']);
  assert.ok(!JSON.stringify(output).includes('fake-password'));
});

test('does not click any control if form has ambiguous buttons',async()=>{
  let clicked=0;
  const controls={evaluateAll:async()=>[control('submit','Login'),control('button','Sign in')],nth:()=>({click:async()=>clicked++})};
  const form={count:async()=>1,locator:(s)=>s.includes('button:visible')?controls:{count:async()=>1,first:()=>({fill:async()=>{}})}};
  const pass={locator:()=>form,fill:async()=>{},press:async()=>{}};
  const page={url:()=>'/login',waitForTimeout:async()=>{},locator:()=>({count:async()=>1,first:()=>pass})};
  const output=await submitResNexusLoginForm({page,login:'fake',password:'fake',waitForTransition:async()=>{}});
  assert.equal(output.submitted,false);
  assert.equal(output.observation,'multiple_login_controls');
  assert.equal(clicked,0);
});


test('nearby named login action is used only within the form wrapper', async () => {
  const actions=[];
  const formControls={ evaluateAll:async()=>[], nth:()=>{throw new Error('no controls inside form')} };
  const wrapperControls={evaluateAll:async()=>[control('button','Login')],
    nth:()=>({isEnabled:async()=>true,click:async()=>actions.push('wrapper-login-click')})};
  const wrapper={count:async()=>1,locator:()=>wrapperControls};
  const form={count:async()=>1,locator:(selector)=>selector==='xpath=..'?wrapper:
    selector.includes('button:visible')?formControls:{count:async()=>1,first:()=>({fill:async()=>{}})}};
  const password={locator:()=>form,fill:async()=>{},press:async key=>actions.push(`key:${key}`)};
  const page={url:()=>'/login',waitForTimeout:async()=>{},locator:()=>({count:async()=>1,first:()=>password})};
  const result=await submitResNexusLoginForm({page,login:'fake',password:'fake',waitForTransition:async()=>{}});
  assert.equal(result.method,'nearby_named_login_control');
  assert.deepEqual(actions,['key:Tab','wrapper-login-click']);
});

test('keyboard Enter fallback happens only if there are no form or nearby login controls', async () => {
  const actions=[];
  const controls={evaluateAll:async()=>[]};
  const wrapper={count:async()=>1,locator:()=>controls};
  const form={count:async()=>1,locator:(selector)=>selector==='xpath=..'?wrapper:
    selector.includes('button:visible')?controls:{count:async()=>1,first:()=>({fill:async()=>{}})}};
  const password={locator:()=>form,fill:async()=>{},press:async key=>actions.push(key)};
  const page={url:()=>'/login',waitForTimeout:async()=>{},locator:()=>({count:async()=>1,first:()=>password})};
  const result=await submitResNexusLoginForm({page,login:'fake',password:'fake',waitForTransition:async()=>{}});
  assert.equal(result.method,'keyboard_enter');
  assert.deepEqual(actions,['Tab','Enter']);
});

test('password field must be unambiguous before any login is filled',async()=>{
  let anyFill=false;
  const page={locator:()=>({count:async()=>2,first:()=>({fill:async()=>{anyFill=true}})})};
  const result=await submitResNexusLoginForm({page,login:'fake',password:'fake',waitForTransition:async()=>{}});
  assert.equal(result.submitted,false);
  assert.equal(result.observation,'password_field_missing_or_ambiguous');
  assert.equal(anyFill,false);
});
