import styles from "./StripeConnectGuide.module.css";

export function StripeConnectGuide() {
  return (
    <div className={styles.wrap}>
      <div className={styles.existingNote}>
        <strong>Already have Stripe? You&apos;re not starting over.</strong>
        <p>
          Find A Place uses Stripe Connect so guest booking payments can be tied
          to your host payment account. Use the Stripe login you already have.
          Stripe may reuse business or identity details it has already verified,
          but it can still ask you to confirm a few items, your payout bank
          account, and Stripe&apos;s terms for this connection.
        </p>
        <p>
          This does not replace your unrelated Stripe activity or move it into
          Find A Place. It creates the Stripe connection Find A Place needs for
          your bookings.
        </p>
      </div>

      <details className={styles.guide}>
        <summary>
          <span>How Stripe setup works</span>
          <small>View the step-by-step guide</small>
        </summary>

        <div className={styles.guideBody}>
          <div className={styles.guideIntro}>
            <strong>Most hosts finish this in a few steps.</strong>
            <p>
              Stripe handles the secure identity, business, and bank-account
              verification. Find A Place only receives the connection status it
              needs to know whether your host account can accept bookings.
            </p>
          </div>

          <ol className={styles.steps}>
            <li>
              <span>1</span>
              <div>
                <strong>Start the Stripe connection</strong>
                <p>
                  Choose the option above that fits you. Stripe opens securely
                  inside Find A Place.
                </p>
              </div>
            </li>
            <li>
              <span>2</span>
              <div>
                <strong>Use your normal Stripe login if you already have one</strong>
                <p>
                  Existing Stripe users can sign in with the same login they
                  normally use. New users can create what they need in the same
                  Stripe flow.
                </p>
              </div>
            </li>
            <li>
              <span>3</span>
              <div>
                <strong>Review your business information</strong>
                <p>
                  Stripe may prefill details it already knows. Check that the
                  legal name, business information, and contact details are
                  correct.
                </p>
              </div>
            </li>
            <li>
              <span>4</span>
              <div>
                <strong>Confirm the business owner or representative</strong>
                <p>
                  Stripe may ask for identity information because it must verify
                  the person or business receiving guest payments.
                </p>
              </div>
            </li>
            <li>
              <span>5</span>
              <div>
                <strong>Confirm your payout bank account</strong>
                <p>
                  This is the bank account Stripe will use for eligible deposits
                  from your host Stripe balance.
                </p>
              </div>
            </li>
            <li>
              <span>6</span>
              <div>
                <strong>Accept Stripe&apos;s terms and finish</strong>
                <p>
                  Stripe may ask you to reconfirm information even if you have
                  used Stripe before. Finish any items Stripe marks as required.
                </p>
              </div>
            </li>
            <li>
              <span>7</span>
              <div>
                <strong>Return to Find A Place</strong>
                <p>
                  When Stripe finishes verification, the Payments &amp; taxes page
                  will show that your Stripe account is ready.
                </p>
              </div>
            </li>
          </ol>

          <div className={styles.needsBox}>
            <strong>What you may need</strong>
            <ul>
              <li>Your existing Stripe login, if you already use Stripe</li>
              <li>Legal name or business name</li>
              <li>Business address and phone number</li>
              <li>EIN or SSN, depending on how your business is set up</li>
              <li>Owner or business-representative information</li>
              <li>Bank account for Stripe deposits</li>
            </ul>
          </div>

          <div className={styles.faq}>
            <strong>Common questions</strong>

            <details>
              <summary>Will this replace my existing Stripe account?</summary>
              <p>
                No. This establishes the Stripe Connect relationship Find A
                Place needs for host bookings. Your unrelated Stripe activity
                stays separate.
              </p>
            </details>

            <details>
              <summary>Why does Stripe already know some of my information?</summary>
              <p>
                Stripe can reuse certain eligible verified details during
                networked onboarding. You still need to review the information
                and may need to confirm it for this Find A Place connection.
              </p>
            </details>

            <details>
              <summary>Why is Stripe asking me to verify something again?</summary>
              <p>
                Verification requirements can depend on the payment capabilities
                being enabled and Stripe&apos;s current compliance requirements.
                Previously verified information can reduce the work, but it does
                not always remove every confirmation step.
              </p>
            </details>

            <details>
              <summary>Do I need my own website to finish Stripe setup?</summary>
              <p>
                No. When available, Find A Place supplies Stripe with your public
                Find A Place listing URL. If a listing is not published yet,
                Find A Place supplies a lodging/business description instead.
                Do not enter an unrelated website just to continue.
              </p>
            </details>

            <details>
              <summary>Does Find A Place see my bank login or Stripe password?</summary>
              <p>
                No. Stripe handles the secure onboarding. Find A Place does not
                store your raw bank-account details, identity documents, or
                Stripe password.
              </p>
            </details>
          </div>
        </div>
      </details>
    </div>
  );
}
