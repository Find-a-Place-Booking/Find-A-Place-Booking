"use client";

import { useState } from "react";

import {
  publishPropertyListing,
  setPropertyMarketplaceVisibility,
} from "@/app/host/properties/actions";

import styles from "./PropertyPublicationControl.module.css";

type Mode = "publish" | "enable";

export function PropertyPublicationControl({
  mode,
  propertyId,
  slug,
  returnTo = "detail",
  missingCancellation,
  disabled = false,
}: {
  mode: Mode;
  propertyId: string;
  slug: string;
  returnTo?: "detail" | "list";
  missingCancellation: boolean;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);

  const action =
    mode === "publish"
      ? publishPropertyListing
      : setPropertyMarketplaceVisibility;

  const label =
    mode === "publish" ? "Publish listing →" : "Enable listing →";

  if (!missingCancellation) {
    return (
      <form action={action}>
        <input type="hidden" name="propertyId" value={propertyId} />
        <input type="hidden" name="slug" value={slug} />
        {mode === "enable" ? (
          <>
            <input type="hidden" name="returnTo" value={returnTo} />
            <input type="hidden" name="intent" value="ENABLE" />
          </>
        ) : null}
        <button className="button" type="submit" disabled={disabled}>
          {label}
        </button>
      </form>
    );
  }

  return (
    <div className={styles.wrap}>
      <button
        className={`button ${styles.warningButton}`}
        type="button"
        disabled={disabled}
        onClick={() => setOpen(true)}
      >
        {label}
      </button>

      {open ? (
        <div
          className={styles.backdrop}
          role="presentation"
          onMouseDown={(event) => {
            if (event.currentTarget === event.target) {
              setOpen(false);
            }
          }}
        >
          <div
            className={styles.modal}
            role="dialog"
            aria-modal="true"
            aria-labelledby="missing-cancellation-title"
          >
            <p className="eyebrow dark">Cancellation policy warning</p>
            <h2 id="missing-cancellation-title">
              No cancellation/refund policy is set.
            </h2>
            <p>
              Guests will not have host-specific cancellation or refund terms
              for this property. You can go back and add them now, or continue
              and publish the listing without a policy.
            </p>

            <div className={styles.notice}>
              Publishing without specific cancellation/refund terms is allowed,
              but the guest checkout will clearly show that the host has not
              supplied them.
            </div>

            <div className={styles.actions}>
              <button
                className="button button-quiet"
                type="button"
                onClick={() => setOpen(false)}
              >
                Go back
              </button>

              <form action={action}>
                <input type="hidden" name="propertyId" value={propertyId} />
                <input type="hidden" name="slug" value={slug} />
                <input
                  type="hidden"
                  name="allowMissingCancellation"
                  value="true"
                />
                {mode === "enable" ? (
                  <>
                    <input
                      type="hidden"
                      name="returnTo"
                      value={returnTo}
                    />
                    <input type="hidden" name="intent" value="ENABLE" />
                  </>
                ) : null}

                <button className="button" type="submit">
                  {mode === "publish"
                    ? "Publish without policy"
                    : "Enable without policy"}
                </button>
              </form>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
