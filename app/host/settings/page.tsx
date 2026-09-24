import Link from "next/link";

import { DashboardShell } from "@/components/DashboardShell";
import financeStyles from "@/components/HostFinancePanels.module.css";
import { getHostAccountProfile, initialsForHost } from "@/lib/host/profile";
import { createClient } from "@/lib/supabase/server";
import {
  removeHostAvatar,
  removeHostGalleryImage,
  saveHostPublicProfile,
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
    profileSaved?: string;
    profileError?: string;
  }>;
}) {
  const [profile, params] = await Promise.all([
    getHostAccountProfile(),
    searchParams,
  ]);
  const initials = initialsForHost(profile);

  const supabase = await createClient();
  const { data: commissionOrganization } = profile.organizationId
    ? await supabase
        .from("organizations")
        .select("partner_status,commission_tier")
        .eq("id", profile.organizationId)
        .maybeSingle()
    : { data: null };

  const isPartner =
    commissionOrganization?.commission_tier === "PARTNER_5" &&
    commissionOrganization?.partner_status === "VERIFIED";
  const commissionRate = isPartner ? 5 : 7;
  const commissionAssigned = Boolean(profile.organizationId);

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
      {params.profileSaved ? (
        <div className="admin-message success">Public host profile updated.</div>
      ) : null}
      {params.profileError ? (
        <div className="admin-message error">
          {decodeURIComponent(params.profileError)}
        </div>
      ) : null}

      <div className="dash-two settings-primary-grid">
        <section className="panel">
          <p className="eyebrow dark">Host profile</p>
          <h2>Primary account photo</h2>

          <div className="host-profile-photo-row">
            <div
              className={`host-profile-photo ${profile.avatarUrl ? "has-image" : ""}`}
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
                This photo now appears with your host profile on public listings
                and confirmed guest trip pages.
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

          <small className="settings-helper">JPG, PNG or WebP · maximum 3MB.</small>
        </section>

        <section className="panel">
          <p className="eyebrow dark">Business profile</p>
          <h2>{profile.organizationName || "Host account setup"}</h2>

          <div className="setting-row">
            <span>Primary contact</span>
            <strong>{profile.primaryContactName || profile.fullName || "Not set"}</strong>
          </div>

          <div className="setting-row">
            <span>Business location</span>
            <strong>{profile.businessLocation || "Not set"}</strong>
          </div>

          <div className="setting-row">
            <span>Support email</span>
            <strong>{profile.supportEmail || profile.email || "Not set"}</strong>
          </div>

          <Link className="button button-small button-quiet" href="/host/onboarding">
            Review profile
          </Link>
        </section>
      </div>

      <section className="panel">
        <div className="panel-head">
          <div>
            <p className="eyebrow dark">Public host profile</p>
            <h2>Tell guests a little about who is hosting.</h2>
          </div>
        </div>
        <p className="muted">
          This short description appears in the Hosted by section of your listing
          and on confirmed guest trip pages. Do not put private information here.
        </p>
        <form className="settings-form" action={saveHostPublicProfile}>
          <label>
            <span>Public host / business name</span>
            <input
              name="public_host_name"
              maxLength={120}
              defaultValue={profile.publicHostName || profile.organizationName || ""}
              placeholder="Example: Pine Hollow Stays"
            />
            <small>This is the name guests see. It can be different from the organization name on your account.</small>
          </label>
          <label>
            <span>Host description</span>
            <textarea
              name="public_host_bio"
              rows={5}
              maxLength={800}
              defaultValue={profile.publicHostBio || ""}
              placeholder="Example: Pine Hollow Stays is a locally owned cabin business focused on simple, comfortable stays near the Ouachitas. We manage our properties directly and are easy to reach before and during your trip."
            />
          </label>
          <button className="button button-small" type="submit">
            Save public host profile
          </button>
        </form>
      </section>

      <section className="panel">
        <div className="panel-head">
          <div>
            <p className="eyebrow dark">Host photos</p>
            <h2>Add more than one host/profile image.</h2>
          </div>
          <span className="status-pill status-muted">{profile.gallery.length}/6</span>
        </div>

        {profile.gallery.length ? (
          <div className="home-property-grid">
            {profile.gallery.map((image) => (
              <div className="panel" key={image.id}>
                {image.signedUrl ? (
                  <img src={image.signedUrl} alt={image.originalName || "Host photo"} />
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
              <span>Add one host photo</span>
              <input
                type="file"
                name="gallery"
                accept="image/jpeg,image/png,image/webp"
                required
              />
            </label>
            <button className="button button-small" type="submit">
              Upload photo
            </button>
            <small className="settings-helper">
              Add photos one at a time · JPG, PNG or WebP · maximum 3MB.
            </small>
          </form>
        ) : null}
      </section>

      <div className="dash-two">
        <section className={`panel plan-panel ${financeStyles.commissionPanel}`}>
          <p className="eyebrow dark">Commission tier</p>
          <h2>Your assigned Find A Place rate</h2>
          <strong className="plan-price">
            {commissionAssigned ? `${commissionRate}%` : "Pending"}
          </strong>
          <p>
            {commissionAssigned
              ? isPartner
                ? "Verified Find A Place partner rate."
                : "Standard Find A Place host rate."
              : "Your commission rate will appear here after the host account is created."}
          </p>
          <small>
            The commission base is nightly lodging after host discounts and
            excludes legitimate cleaning/pet fees, taxes, refundable deposits and
            optional add-ons.
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
