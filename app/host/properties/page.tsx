import Link from "next/link";

import {
  createPropertyFromOnboarding,
  setPropertyMarketplaceVisibility,
} from "@/app/host/properties/actions";
import { DashboardShell } from "@/components/DashboardShell";
import {
  getHostProperties,
  getPropertyCreationState,
} from "@/lib/host/properties";

import styles from "./properties.module.css";

function money(cents: number | null) {
  if (cents == null) return "Rate not set";
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(cents / 100);
}

function statusLabel(status: string) {
  if (status === "PAUSED") return "Disabled";
  return status
    .replaceAll("_", " ")
    .toLowerCase()
    .replace(/\b\w/g, (value) => value.toUpperCase());
}

export default async function PropertiesPage({
  searchParams,
}: {
  searchParams: Promise<{
    error?: string;
    marketplace?: string;
    marketplace_error?: string;
  }>;
}) {
  const [query, properties, creation] = await Promise.all([
    searchParams,
    getHostProperties(),
    getPropertyCreationState(),
  ]);

  const readyDraft = creation.readyDraft;
  const canCreateFromDraft = Boolean(
    readyDraft && !readyDraft.created_property_id,
  );

  return (
    <DashboardShell active="Properties" title="Properties">
      <div className="dash-toolbar">
        <div>
          <p>
            Manage your listings and control which published properties are
            currently visible in the Find A Place marketplace.
          </p>
        </div>
        <div className="property-toolbar-actions">
          <Link
            className="button button-small button-quiet"
            href="/host/onboarding"
          >
            Host setup
          </Link>
          <Link
            className="button button-small"
            href="/host/properties/new"
          >
            + Add property
          </Link>
        </div>
      </div>

      {query.error ? (
        <div className={`admin-message error ${styles.notice}`}>
          We couldn&apos;t create the property. Please try again, or contact
          Find A Place if the problem continues.
        </div>
      ) : null}

      {query.marketplace === "disabled" ? (
        <div className={`admin-message success ${styles.notice}`}>
          <strong>Listing disabled.</strong> It has been removed from the
          public marketplace. Existing reservations and calendar records were
          left intact.
        </div>
      ) : null}

      {query.marketplace === "enabled" ? (
        <div className={`admin-message success ${styles.notice}`}>
          <strong>Listing enabled.</strong> It is public in the marketplace
          again.
        </div>
      ) : null}

      {query.marketplace_error ? (
        <div className={`admin-message error ${styles.notice}`}>
          {query.marketplace_error}
        </div>
      ) : null}

      {canCreateFromDraft ? (
        <section className="property-draft-import">
          <div>
            <p className="eyebrow dark">Saved setup</p>
            <h2>
              Create your first property from the details you already entered.
            </h2>
            <p>
              We can carry over the property name, location, capacity,
              amenities, policies, rates, fees and calendar preference from
              your host setup so you do not have to enter them twice.
            </p>
          </div>
          <form action={createPropertyFromOnboarding}>
            <input
              type="hidden"
              name="organizationId"
              value={readyDraft!.organization_id}
            />
            <button className="button" type="submit">
              Create property from saved setup →
            </button>
          </form>
        </section>
      ) : null}

      <section className="panel real-property-table">
        {properties.length ? (
          <div className={styles.list}>
            {properties.map((property) => {
              const isLive = property.status === "PUBLISHED";
              const isPaused = property.status === "PAUSED";

              return (
                <div className={styles.row} key={property.id}>
                  <Link
                    href={`/host/properties/${property.slug}`}
                    className={styles.identity}
                  >
                    <div className={styles.thumb}>
                      {property.coverImageUrl ? (
                        <img
                          src={property.coverImageUrl}
                          alt={`${property.name} cover`}
                        />
                      ) : (
                        <span>
                          {property.imageCount
                            ? `${property.imageCount} photo${
                                property.imageCount === 1 ? "" : "s"
                              }`
                            : "No photos"}
                        </span>
                      )}
                    </div>

                    <div className={styles.copy}>
                      <strong>{property.name}</strong>
                      <span>
                        {[
                          property.propertyType,
                          property.publicArea ||
                            [property.city, property.state]
                              .filter(Boolean)
                              .join(", "),
                        ]
                          .filter(Boolean)
                          .join(" · ") || "Location not complete"}
                      </span>
                      <small
                        className={
                          isLive
                            ? styles.live
                            : isPaused
                              ? styles.paused
                              : undefined
                        }
                      >
                        {isLive
                          ? "Enabled · live in marketplace"
                          : isPaused
                            ? "Disabled · hidden from marketplace"
                            : "Not published yet"}
                      </small>
                    </div>
                  </Link>

                  <div className={styles.stat}>
                    <small>Status</small>
                    <strong>{statusLabel(property.status)}</strong>
                  </div>

                  <div className={styles.stat}>
                    <small>Capacity</small>
                    <strong>
                      {property.maxGuests
                        ? `${property.maxGuests} guests`
                        : "Not set"}
                    </strong>
                  </div>

                  <div className={`${styles.stat} ${styles.rate}`}>
                    <small>Weeknight</small>
                    <strong>{money(property.weeknightCents)}</strong>
                  </div>

                  <div className={styles.actions}>
                    {isLive || isPaused ? (
                      <form action={setPropertyMarketplaceVisibility}>
                        <input
                          type="hidden"
                          name="propertyId"
                          value={property.id}
                        />
                        <input
                          type="hidden"
                          name="slug"
                          value={property.slug}
                        />
                        <input type="hidden" name="returnTo" value="list" />
                        <input
                          type="hidden"
                          name="intent"
                          value={isLive ? "DISABLE" : "ENABLE"}
                        />
                        <button
                          className={`${styles.toggle} ${
                            isLive ? styles.disable : ""
                          }`}
                          type="submit"
                        >
                          {isLive ? "Disable listing" : "Enable listing"}
                        </button>
                      </form>
                    ) : null}

                    <Link
                      className={styles.edit}
                      href={`/host/properties/${property.slug}`}
                    >
                      Edit property
                    </Link>
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="panel-empty panel-empty-large">
            <strong>No properties yet.</strong>
            <span>
              {canCreateFromDraft
                ? "Use your saved setup above to create the first property."
                : "Add a property to start building your listing."}
            </span>
            <Link
              className="button button-small"
              href="/host/properties/new"
            >
              Add a property
            </Link>
          </div>
        )}
      </section>
    </DashboardShell>
  );
}
