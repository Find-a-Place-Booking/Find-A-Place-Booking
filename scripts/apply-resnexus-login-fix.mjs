import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const rel = "resnexus-worker/src/resnexus.mjs";
const target = path.join(root, rel);

if (!fs.existsSync(target)) {
  throw new Error(`Missing ${rel}. Run this from the Find A Place Booking project root.`);
}

let content = fs.readFileSync(target, "utf8");

const oldLogin = `async function fillLogin(page, login, password) {
  const loginInput = page
    .locator(
      'input[type="email"], input[name*="email" i], input[name*="user" i], input[placeholder*="email" i]',
    )
    .first();
  const passwordInput = page.locator('input[type="password"]').first();

  if (
    !(await loginInput.isVisible().catch(() => false)) ||
    !(await passwordInput.isVisible().catch(() => false))
  ) {
    throw new NeedsAttentionError(
      "LOGIN_FORM_CHANGED",
      "The ResNexus login page changed and the worker could not safely identify the login fields.",
    );
  }

  await loginInput.fill(login);
  await passwordInput.fill(password);

  const submit = page
    .locator(
      'button[type="submit"], input[type="submit"], button:has-text("Login"), button:has-text("Sign in")',
    )
    .first();

  if (!(await submit.isVisible().catch(() => false))) {
    throw new NeedsAttentionError(
      "LOGIN_FORM_CHANGED",
      "The ResNexus login page changed and the worker could not safely identify the sign-in button.",
    );
  }

  await submit.click();
  await page.waitForLoadState("domcontentloaded").catch(() => null);
  await page.waitForTimeout(700);
}`;

const newLogin = `async function waitForAuthTransition(page, previousUrl) {
  await Promise.race([
    page
      .waitForURL((url) => url.toString() !== previousUrl, {
        timeout: 8_000,
      })
      .catch(() => null),
    page.waitForTimeout(1_500),
  ]);

  await page
    .waitForLoadState("domcontentloaded", {
      timeout: 8_000,
    })
    .catch(() => null);

  await page.waitForTimeout(700);
}

async function fillLogin(page, login, password) {
  const loginInput = page
    .locator(
      [
        'input[type="email"]',
        'input[autocomplete="username"]',
        'input[name*="email" i]',
        'input[name*="user" i]',
        'input[name*="login" i]',
        'input[placeholder*="email" i]',
        'input[placeholder*="user" i]',
        'input[placeholder*="login" i]',
      ].join(", "),
    )
    .first();

  const passwordInput = page.locator('input[type="password"]').first();

  if (
    !(await loginInput.isVisible().catch(() => false)) ||
    !(await passwordInput.isVisible().catch(() => false))
  ) {
    throw new NeedsAttentionError(
      "LOGIN_FORM_CHANGED",
      "The ResNexus login page changed and the worker could not safely identify the login fields.",
    );
  }

  await loginInput.fill(login);
  await passwordInput.fill(password);

  const previousUrl = page.url();
  const submit = page
    .locator(
      [
        'button[type="submit"]',
        'input[type="submit"]',
        'button[name*="login" i]',
        'input[name*="login" i]',
        'button[id*="login" i]',
        'input[id*="login" i]',
        'button:has-text("Login")',
        'button:has-text("Log in")',
        'button:has-text("Sign in")',
        'input[value*="Login" i]',
        'input[value*="Log in" i]',
        'input[value*="Sign in" i]',
      ].join(", "),
    )
    .first();

  if (await submit.isVisible().catch(() => false)) {
    await submit.click();
  } else {
    // Some ResNexus login layouts submit the form without exposing the visual
    // control as a normal button/input. Enter on the password field is the
    // standard browser form submission and avoids guessing at unrelated UI.
    await passwordInput.press("Enter");
  }

  await waitForAuthTransition(page, previousUrl);
}`;

const oldChallenge = `async function submitChallengeIfPossible(page, challengeCode) {
  if (!challengeCode) return false;

  const input = page
    .locator(
      'input[autocomplete="one-time-code"], input[name*="code" i], input[id*="code" i]',
    )
    .first();

  if (!(await input.isVisible().catch(() => false))) return false;

  await input.fill(challengeCode);

  const submit = page
    .locator(
      'button[type="submit"], input[type="submit"], button:has-text("Verify"), button:has-text("Continue")',
    )
    .first();

  if (!(await submit.isVisible().catch(() => false))) return false;

  await submit.click();
  await page.waitForLoadState("domcontentloaded").catch(() => null);
  await page.waitForTimeout(700);

  return true;
}`;

const newChallenge = `async function submitChallengeIfPossible(page, challengeCode) {
  if (!challengeCode) return false;

  const input = page
    .locator(
      'input[autocomplete="one-time-code"], input[name*="code" i], input[id*="code" i]',
    )
    .first();

  if (!(await input.isVisible().catch(() => false))) return false;

  await input.fill(challengeCode);

  const previousUrl = page.url();
  const submit = page
    .locator(
      [
        'button[type="submit"]',
        'input[type="submit"]',
        'button[name*="verify" i]',
        'input[name*="verify" i]',
        'button:has-text("Verify")',
        'button:has-text("Continue")',
        'button:has-text("Submit")',
      ].join(", "),
    )
    .first();

  if (await submit.isVisible().catch(() => false)) {
    await submit.click();
  } else {
    await input.press("Enter");
  }

  await waitForAuthTransition(page, previousUrl);
  return true;
}`;

if (content.includes(newLogin) && content.includes(newChallenge)) {
  console.log("ResNexus login fix is already applied.");
  process.exit(0);
}

if (!content.includes(oldLogin)) {
  throw new Error(
    "Could not find the expected fillLogin block. The worker file has changed; do not force the patch.",
  );
}
content = content.replace(oldLogin, newLogin);

if (!content.includes(oldChallenge)) {
  throw new Error(
    "Could not find the expected verification-code block. The worker file has changed; do not force the patch.",
  );
}
content = content.replace(oldChallenge, newChallenge);

fs.writeFileSync(target, content, "utf8");
console.log(`Patched ${rel}`);
