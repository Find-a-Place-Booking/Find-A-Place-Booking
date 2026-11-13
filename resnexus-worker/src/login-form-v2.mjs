/**
 * ResNexus login form selection. Select inputs and submit controls from the
 * SAME visible form so unrelated sitewide/header submit buttons cannot be hit.
 * Never log or return either the username or password.
 */
export async function submitResNexusLoginForm({ page, login, password, waitForTransition }) {
  const passwords = page.locator('input[type="password"]:visible');
  const passwordCount = await passwords.count();
  if (passwordCount !== 1) {
    return { submitted: false, observation: "password_field_missing_or_ambiguous" };
  }
  const passwordInput = passwords.first();
  const parentForm = passwordInput.locator('xpath=ancestor::form[1]');
  if ((await parentForm.count()) !== 1) {
    return { submitted: false, observation: "login_form_missing_or_ambiguous" };
  }

  const loginCandidates = parentForm.locator([
    'input[autocomplete="username"]:visible',
    'input[type="email"]:visible',
    'input[name*="email" i]:visible',
    'input[name*="username" i]:visible',
    'input[name*="user" i]:visible',
    'input[name*="login" i]:visible',
    'input[placeholder*="email" i]:visible',
    'input[placeholder*="user" i]:visible',
    'input[placeholder*="login" i]:visible',
  ].join(', '));

  // No global "first email" fallback: a newsletter field elsewhere on the
  // page must never receive host credentials.
  if ((await loginCandidates.count()) !== 1) {
    return { submitted: false, observation: "login_identifier_missing_or_ambiguous" };
  }
  const loginInput = loginCandidates.first();
  await loginInput.fill(login);
  await passwordInput.fill(password);

  const before = page.url();
  const submits = parentForm.locator(
    'button[type="submit"]:visible, input[type="submit"]:visible, ' +
    'button:not([type]):visible:has-text("Sign in"), ' +
    'button:not([type]):visible:has-text("Log in"), ' +
    'button:not([type]):visible:has-text("Login")',
  );
  const submitCount = await submits.count();
  if (submitCount > 1) {
    return { submitted: false, observation: "submit_control_ambiguous" };
  }
  if (submitCount === 1) {
    await submits.first().click();
  } else {
    // Enter submits the form attached to the password field, not the first
    // unrelated button elsewhere on the page.
    await passwordInput.press("Enter");
  }
  await waitForTransition(page, before);
  return { submitted: true, observation: "login_form_submitted" };
}
