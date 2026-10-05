import type { HostAccountProfile } from "@/lib/host/profile";

import {
  removeOnboardingHostAvatar,
  saveOnboardingPublicHostProfile,
  uploadOnboardingHostAvatar,
} from "@/app/host/onboarding/public-profile-actions";

function initials(profile: HostAccountProfile) {
  const source =
    profile.publicHostName ||
    profile.organizationName ||
    profile.fullName ||
    "Host";
  const parts = source.trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return "H";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase();
}

export function OnboardingPublicHostProfile({
  profile,
}: {
  profile: HostAccountProfile;
}) {
  return (
    <section className="panel" style={{ marginBottom: 18 }}>
      <div className="panel-head">
        <div>
          <p className="eyebrow dark">Public host profile</p>
          <h2>This is what travelers can see about the host.</h2>
        </div>
        <span className="status-pill status-muted">Public</span>
      </div>

      <p className="muted">
        Your public host page uses this same host account information. There is
        no separate profile to build later. Your primary contact, email, phone,
        property street address, Stripe information and other private account
        details are never shown on the public host page.
      </p>

      <div className="host-profile-photo-row" style={{ marginTop: 16 }}>
        <div
          className={`host-profile-photo ${profile.avatarUrl ? "has-image" : ""}`}
        >
          {profile.avatarUrl ? (
            <img src={profile.avatarUrl} alt="Current public host profile" />
          ) : (
            <span>{initials(profile)}</span>
          )}
        </div>

        <div>
          <strong>
            {profile.publicHostName ||
              profile.organizationName ||
              "Host profile"}
          </strong>
          <span>
            This photo is used on your public host page and the Hosted by
            section of your stays.
          </span>
        </div>
      </div>

      <form
        className="host-avatar-form"
        action={uploadOnboardingHostAvatar}
        style={{ marginTop: 14 }}
      >
        <label>
          <span>Public profile photo</span>
          <input
            type="file"
            name="avatar"
            accept="image/jpeg,image/png,image/webp"
            required
          />
        </label>
        <button className="button button-small button-quiet" type="submit">
          {profile.avatarUrl ? "Replace photo" : "Upload photo"}
        </button>
      </form>

      {profile.avatarUrl ? (
        <form action={removeOnboardingHostAvatar}>
          <button className="text-danger-button" type="submit">
            Remove profile photo
          </button>
        </form>
      ) : null}

      <form
        className="settings-form"
        action={saveOnboardingPublicHostProfile}
        style={{ marginTop: 18 }}
      >
        <label>
          <span>Public host / business name</span>
          <input
            name="public_host_name"
            maxLength={120}
            defaultValue={
              profile.publicHostName || profile.organizationName || ""
            }
            placeholder="Example: Fancy Hill Cabins"
            required
          />
          <small>
            This is the name shown on the public host page. It does not expose
            the private account contact.
          </small>
        </label>

        <label>
          <span>About the host</span>
          <textarea
            name="public_host_bio"
            rows={5}
            maxLength={800}
            defaultValue={profile.publicHostBio || ""}
            placeholder="Tell guests a little about the host, the business, and the kind of stays you manage."
          />
          <small>
            Only write what you want guests to see publicly. Do not add a phone
            number, email address or street address here.
          </small>
        </label>

        <button className="button button-small" type="submit">
          Save public host profile
        </button>
      </form>
    </section>
  );
}
