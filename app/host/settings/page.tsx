import Link from "next/link";

import { DashboardShell } from "@/components/DashboardShell";
import { getHostAccountProfile, initialsForHost } from "@/lib/host/profile";
import {
  removeHostAvatar,
  removeHostGalleryImage,
  uploadHostAvatar,
  uploadHostGallery,
} from "./actions";

export default async function SettingsPage({
  searchParams,
}: {
  searchParams: Promise<{
    avatarSaved?: string;
    avatarRemoved?: string;
    avatarError?: string;
    gallerySaved?: string;
    galleryRemoved?: string;
    galleryError?: string;
  }>;
}) {
  const [profile, params] = await Promise.all([
    getHostAccountProfile(),
    searchParams,
  ]);
  const initials = initialsForHost(profile);

  return (
    <DashboardShell active="Settings" title="Settings">
      {params.avatarSaved ? (
        <div className="admin-message success">Profile photo updated.</div>
      ) : null}
      {params.avatarRemoved ? (
        <div className="admin-message success">Profile photo removed.</div>
      ) : null}
      {params.avatarError ? (
        <div className="admin-message error">
          {decodeURIComponent(params.avatarError)}
        </div>
      ) : null}
      {params.gallerySaved ? (
        <div className="admin-message success">Host photos updated.</div>
      ) : null}
      {params.galleryRemoved ? (
        <div className="admin-message success">Host photo removed.</div>
      ) : null}
      {params.galleryError ? (
        <div className="admin-message error">
          {decodeURIComponent(params.galleryError)}
        </div>
      ) : null}

      <div className="dash-two settings-primary-grid">
        <section className="panel">
          <p className="eyebrow dark">Host profile</p>
          <h2>Primary account photo</h2>

          <div className="host-profile-photo-row">
            <div
              className={`host-profile-photo ${
                profile.avatarUrl ? "has-image" : ""
              }`}
            >
              {profile.avatarUrl ? (
                <img src={profile.avatarUrl} alt="Current host profile" />
              ) : (
                <span>{initials}</span>
              )}
            </div>

            <div>
              <strong>
                {profile.fullName || profile.primaryContactName || "Host account"}
              </strong>
              <span>
                This remains the primary host/account image. Additional host
                photos can be added below.
              </span>
            </div>
          </div>

          <form className="host-avatar-form" action={uploadHostAvatar}>
            <label>
              <span>Choose profile photo</span>
              <input
                type="file"
                name="avatar"
                accept="image/jpeg,image/png,image/webp"
                required
              />
            </label>
            <button className="button button-small" type="submit">
              Upload photo
            </button>
          </form>

          {profile.avatarUrl ? (
            <form action={removeHostAvatar}>
              <button className="text-danger-button" type="submit">
                Remove current photo
              </button>
            </form>
          ) : null}

          <small className="settings-helper">
            JPG, PNG or WebP · maximum 5MB.
          </small>
        </section>

        <section className="panel">
          <p className="eyebrow dark">Business profile</p>
          <h2>{profile.organizationName || "Host account setup"}</h2>

          <div className="setting-row">
            <span>Primary contact</span>
            <strong>
              {profile.primaryContactName || profile.fullName || "Not set"}
            </strong>
          </div>

          <div className="setting-row">
            <span>Business location</span>
            <strong>{profile.businessLocation || "Not set"}</strong>
          </div>

          <div className="setting-row">
            <span>Support email</span>
            <strong>{profile.supportEmail || profile.email || "Not set"}</strong>
          </div>

          <Link
            className="button button-small button-quiet"
            href="/host/onboarding"
          >
            Review profile
          </Link>
        </section>
      </div>

      <section className="panel">
        <div className="panel-head">
          <div>
            <p className="eyebrow dark">Host photos</p>
            <h2>Add more than one host/profile image.</h2>
          </div>
          <span className="status-pill status-muted">
            {profile.gallery.length}/6
          </span>
        </div>

        {profile.gallery.length ? (
          <div className="home-property-grid">
            {profile.gallery.map((image) => (
              <div className="panel" key={image.id}>
                {image.signedUrl ? (
                  <img
                    src={image.signedUrl}
                    alt={image.originalName || "Host photo"}
                  />
                ) : null}
                <form action={removeHostGalleryImage}>
                  <input type="hidden" name="image_id" value={image.id} />
                  <button className="text-danger-button" type="submit">
                    Remove
                  </button>
                </form>
              </div>
            ))}
          </div>
        ) : (
          <p className="muted">No additional host photos yet.</p>
        )}

        {profile.gallery.length < 6 ? (
          <form className="settings-form" action={uploadHostGallery}>
            <label>
              <span>Add host photos</span>
              <input
                type="file"
                name="gallery"
                accept="image/jpeg,image/png,image/webp"
                multiple
                required
              />
            </label>
            <button className="button button-small" type="submit">
              Upload photos
            </button>
          </form>
        ) : null}
      </section>

      <div className="dash-two">
        <section className="panel plan-panel">
          <p className="eyebrow dark">Commission tier</p>
          <h2>Assigned when the host is approved</h2>
          <strong className="plan-price">5–7%</strong>
          <p>
            Existing Find A Place partner properties use 5%. Other hosts use 7%.
          </p>
          <small>
            The commission base is nightly lodging after host discounts and
            excludes legitimate cleaning/pet fees, taxes, refundable deposits
            and optional add-ons.
          </small>
        </section>

        <section className="panel">
          <p className="eyebrow dark">Account identity</p>
          <h2>Signed-in host</h2>

          <div className="setting-row">
            <span>Email</span>
            <strong>{profile.email || "Not set"}</strong>
          </div>

          <div className="setting-row">
            <span>Phone</span>
            <strong>{profile.phone || "Not set"}</strong>
          </div>
        </section>
      </div>
    </DashboardShell>
  );
}
