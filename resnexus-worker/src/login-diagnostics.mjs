/**
 * Find A Place Booking — ResNexus login validation.
 *
 * A word such as "failed" or "invalid" somewhere on a page is NOT proof
 * that a host's credentials were rejected. Only classify the result as a
 * credential rejection for a message explicitly referring to credentials,
 * username, email, password or login. Never return or log page content.
 */
function normalize(value) {
  return String(value || "").replace(/\s+/g, " ").trim().toLowerCase();
}

export function isExplicitCredentialRejection(message) {
  const text = normalize(message);
  return (
    /\b(?:invalid|incorrect|wrong|unrecognized)\s+(?:user\s?name|email(?: address)?|password|login|credentials)\b/.test(text) ||
    /\b(?:user\s?name|email(?: address)?|password|login|credentials)\s+(?:is|are|was|were)\s+(?:invalid|incorrect|wrong)\b/.test(text) ||
    /\b(?:user\s?name|email(?: address)?|password|login)\s+(?:or|and|\/)\s+(?:user\s?name|email(?: address)?|password|login)\s+(?:(?:is|are|was|were)\s+)?(?:invalid|incorrect|wrong)\b/.test(text)
  );
}

export async function hasExplicitCredentialRejection(page) {
  const errors = page.locator(
    '[role="alert"], [aria-live="assertive"], .validation-summary-errors, ' +
      '.field-validation-error, .alert-danger, .login-error, .error-message, ' +
      '[data-valmsg-for]',
  );

  const count = Math.min(await errors.count().catch(() => 0), 12);
  for (let index = 0; index < count; index++) {
    const item = errors.nth(index);
    if (!(await item.isVisible().catch(() => false))) continue;
    if (isExplicitCredentialRejection(await item.innerText().catch(() => ""))) {
      return true;
    }
  }

  // Older login forms may render the error without an alert element.
  // Check short individual lines, not broad body-text substring matches.
  const body = await page.locator("body").innerText().catch(() => "");
  return body.split(/\r?\n/).some((line) =>
    line.length <= 240 && isExplicitCredentialRejection(line),
  );
}
