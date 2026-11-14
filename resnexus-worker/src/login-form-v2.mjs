/**
 * Find A Place / ResNexus — form-scoped browser login.
 *
 * The ResNexus back-office can use JavaScript-driven controls rather than a
 * native submit button. Select ONE real login action associated with the
 * visible credential form. Never submit twice, spoof a request, or bypass MFA.
 *
 * Never emit usernames, passwords, HTML, URLs, cookies, or raw field values.
 */
const PASSWORD_SELECTOR = 'input[type="password"]:visible';
const LOGIN_SELECTOR = [
  'input[autocomplete="username"]:visible',
  'input[type="email"]:visible',
  'input[name*="email" i]:visible',
  'input[name*="username" i]:visible',
  'input[name*="user" i]:visible',
  'input[name*="login" i]:visible',
  'input[placeholder*="email" i]:visible',
  'input[placeholder*="user" i]:visible',
  'input[placeholder*="login" i]:visible',
].join(', ');
const ACTION_SELECTOR = [
  'button:visible',
  'input[type="submit"]:visible',
  'input[type="button"]:visible',
  'input[type="image"]:visible',
  'a[role="button"]:visible',
  'a[onclick]:visible',
  'a[href^="javascript:"]:visible',
  '[role="button"]:visible',
].join(', ');

// The locator is ALWAYS scoped to the credential form or its immediate parent.
// This function reads only static *control* descriptors, never input values
// other than the caption/value of a submit or button control.
async function describeControls(locator) {
  return locator.evaluateAll((nodes) => nodes.map((node) => {
    const tag = node.tagName.toLowerCase();
    const type = (
      node.getAttribute('type') || (tag === 'button' ? 'submit' : '')
    ).toLowerCase();
    const caption = tag === 'input'
      ? (node.getAttribute('value') || node.getAttribute('alt') || '')
      : (node.innerText || node.textContent || '');
    const hint = [
      caption,
      node.getAttribute('aria-label'),
      node.getAttribute('title'),
      node.getAttribute('name'),
      node.getAttribute('id'),
      node.getAttribute('data-action'),
      tag === 'button' ? node.getAttribute('class') : '',
    ].filter(Boolean).join(' ').replace(/\s+/g, ' ').trim().toLowerCase().slice(0, 180);
    const disabled = node.matches(':disabled') || node.getAttribute('aria-disabled') === 'true';
    return { type, hint, disabled };
  }));
}

const POSITIVE = /(?:\b(?:log[ -]?in|login|sign[ -]?in|signin|authenticate)\b|\b(?:btn|button|submit|cmd)[-_]?(?:login|signin)\b)/i;
const NEGATIVE = /forgot|reset|register|sign[ -]?up|signup|create[ -]?account|google|facebook|apple|microsoft|sso|cancel|back|contact|support/i;

function actionChoice(controls, { explicitOnly = false } = {}) {
  const labelled = controls.map((control, index) => ({ control, index }))
    .filter(({ control }) => POSITIVE.test(control.hint) && !NEGATIVE.test(control.hint));
  if (labelled.length > 1) return { error: 'multiple_login_controls' };
  if (labelled.length === 1) {
    if (labelled[0].control.disabled) return { error: 'login_control_disabled' };
    return { index: labelled[0].index, method: 'named_login_control' };
  }
  if (explicitOnly) return { index: null, method: 'none' };

  const enabled = controls.map((control, index) => ({ control, index }))
    .filter(({ control }) => !control.disabled && !NEGATIVE.test(control.hint));
  const submits = enabled.filter(({ control }) => control.type === 'submit' || control.type === 'image');
  if (submits.length === 1) return { index: submits[0].index, method: 'single_form_submit' };
  if (submits.length > 1) return { error: 'multiple_submit_controls' };
  if (enabled.length === 1) return { index: enabled[0].index, method: 'single_form_action' };
  if (controls.length > 0) return { error: 'ambiguous_or_disabled_controls' };
  return { index: null, method: 'keyboard_enter' };
}

export async function submitResNexusLoginForm({ page, login, password, waitForTransition }) {
  const passwords = page.locator(PASSWORD_SELECTOR);
  if (await passwords.count() !== 1) {
    return { submitted: false, observation: 'password_field_missing_or_ambiguous' };
  }
  const passwordInput = passwords.first();
  const form = passwordInput.locator('xpath=ancestor::form[1]');
  if (await form.count() !== 1) {
    return { submitted: false, observation: 'login_form_missing_or_ambiguous' };
  }
  const logins = form.locator(LOGIN_SELECTOR);
  if (await logins.count() !== 1) {
    return { submitted: false, observation: 'login_identifier_missing_or_ambiguous' };
  }

  // Playwright fill emits input/change events. Blurring the password input
  // allows script-driven forms to enable their login control before clicking.
  await logins.first().fill(login);
  await passwordInput.fill(password);
  await passwordInput.press('Tab');
  await page.waitForTimeout(250);

  const formControls = form.locator(ACTION_SELECTOR);
  const described = await describeControls(formControls);
  let choice = actionChoice(described);
  if (choice.error) return { submitted: false, observation: choice.error };
  let chosenLocator = formControls;

  // The ONLY permitted outside-form fallback is a uniquely named login action
  // in the form's immediate wrapper. Never search a site-wide header or page.
  if (choice.index === null) {
    const wrapper = form.locator('xpath=..');
    if (await wrapper.count() === 1) {
      const nearbyActions = wrapper.locator(ACTION_SELECTOR);
      const nearby = await describeControls(nearbyActions);
      const named = actionChoice(nearby, { explicitOnly: true });
      if (named.error) return { submitted: false, observation: `nearby_${named.error}` };
      if (named.index !== null) {
        choice = { index: named.index, method: 'nearby_named_login_control' };
        chosenLocator = nearbyActions;
      }
    }
  }

  const previousUrl = page.url();
  if (choice.index === null) {
    // Only used when there is no other form/nearby login action. One attempt.
    await passwordInput.press('Enter');
  } else {
    const action = chosenLocator.nth(choice.index);
    if (!(await action.isEnabled())) {
      return { submitted: false, observation: 'login_control_disabled' };
    }
    await action.click();
  }

  // Exactly one attempted submission per call. The caller verifies that an
  // authenticated calendar page has actually loaded before accepting it.
  await waitForTransition(page, previousUrl);
  return {
    submitted: true,
    // Existing worker persists this observation in its safe run diagnostic.
    observation: `login_form_submitted_via_${choice.method}`,
    method: choice.method,
  };
}

export const _test = { actionChoice };
