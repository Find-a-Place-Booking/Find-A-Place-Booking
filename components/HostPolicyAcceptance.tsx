import Link from "next/link";

import { acceptHostPolicies } from "@/app/host/onboarding/policy-actions";

function acceptedDate(value: string | null) {
  if (!value) return null;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed.toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export function HostPolicyAcceptance({
  organizationId,
  accepted,
  acceptedAt,
  versions,
  error,
}: {
  organizationId: string;
  accepted: boolean;
  acceptedAt: string | null;
  versions: {
    hostAgreement: string;
    cancellationPolicy: string;
    privacyNotice: string;
  };
  error?: string | null;
}) {
  return (
    <details
      className="panel portal-accordion"
      open={!accepted || Boolean(error)}
    >
      <summary className="portal-accordion-summary">
        <div>
          <p className="eyebrow dark">Platform agreements</p>
          <h2>Find A Place host policies</h2>
        </div>
        <span
          className={`status-pill ${accepted ? "" : "status-muted"}`}
        >
          {accepted ? "Accepted" : "Required"}
        </span>
      </summary>

      <div className="portal-accordion-body">
        <p className="muted">
          This is separate from confirming that you have authority to
          list the property. The account owner or manager accepts these
          once, and the section stays collapsed afterward unless the
          policies change.
        </p>

        {error ? (
          <div className="onboarding-save-state error" role="alert">
            <span>!</span>
            <div>
              <strong>Policy acceptance not saved</strong>
              <small>{error}</small>
            </div>
          </div>
        ) : null}

        {accepted ? (
          <>
            <div className="inline-note">
              <strong>Current policies accepted</strong>
              <span>
                {acceptedDate(acceptedAt)
                  ? `Accepted ${acceptedDate(acceptedAt)}. `
                  : ""}
                A new acceptance will be required only when one of these
                policy versions changes.
              </span>
            </div>
            <small className="settings-helper">
              <Link href="/host-agreement" target="_blank">
                Host Agreement
              </Link>
              {" · "}
              <Link href="/cancellation-policy" target="_blank">
                Cancellation Policy
              </Link>
              {" · "}
              <Link href="/privacy" target="_blank">
                Privacy Notice
              </Link>
            </small>
          </>
        ) : (
          <form action={acceptHostPolicies} className="settings-form">
            <input
              type="hidden"
              name="organizationId"
              value={organizationId}
            />
            <label className="checkline review-confirm">
              <input
                type="checkbox"
                name="acceptPolicies"
                value="yes"
                required
              />
              <span>
                I have read and agree to the current Find A Place Host
                Agreement, Cancellation Policy and Privacy Notice.
              </span>
            </label>

            <div className="inline-note">
              <strong>Policies you are accepting</strong>
              <span>
                <Link href="/host-agreement" target="_blank">
                  Host Agreement
                </Link>{" "}
                ({versions.hostAgreement}) ·{" "}
                <Link href="/cancellation-policy" target="_blank">
                  Cancellation Policy
                </Link>{" "}
                ({versions.cancellationPolicy}) ·{" "}
                <Link href="/privacy" target="_blank">
                  Privacy Notice
                </Link>{" "}
                ({versions.privacyNotice})
              </span>
            </div>

            <button className="button" type="submit">
              Accept host policies
            </button>
          </form>
        )}
      </div>
    </details>
  );
}
