import styles from "./StripeConnectGuide.module.css";

const steps = [
  {
    title: "Choose how you want to connect",
    body:
      "If you already use Stripe, choose your existing Stripe login. If you are new to Stripe, create your Stripe account during setup.",
  },
  {
    title: "Let Stripe verify the right details",
    body:
      "Stripe may ask for business information, identity details, and a payout bank account. If Stripe already has eligible verified information, it may reuse some of it.",
  },
  {
    title: "Finish the secure Stripe flow",
    body:
      "After the setup is complete, Find A Place can route guest booking charges directly to your connected host payment account.",
  },
  {
    title: "Come back later if you need to manage it",
    body:
      "Once connected, you can reopen Stripe from your host Payments & taxes page to review supported account details or satisfy any new Stripe requirements.",
  },
];

export function StripeConnectGuide() {
  return (
    <div className={styles.shell}>
      <div className={styles.lead}>
        <strong>Quick overview</strong>
        <p>
          Find A Place uses Stripe Connect so guest booking money can be tied to
          your host payment account while Stripe handles the secure payment-account
          setup and payout information.
        </p>
      </div>

      <div className={styles.stepGrid}>
        {steps.map((step, index) => (
          <article className={styles.stepCard} key={step.title}>
            <span className={styles.stepNumber}>0{index + 1}</span>
            <div>
              <h4>{step.title}</h4>
              <p>{step.body}</p>
            </div>
          </article>
        ))}
      </div>

      <div className={styles.noteRow}>
        <div className={styles.noteCard}>
          <strong>Using an existing Stripe login?</strong>
          <p>
            This does not merge your unrelated Stripe activity into Find A Place.
            It creates or connects the Stripe relationship needed for your host bookings.
          </p>
        </div>
        <div className={styles.noteCard}>
          <strong>Good to know</strong>
          <p>
            Find A Place never stores your raw bank-account details, identity
            documents or Stripe password.
          </p>
        </div>
      </div>
    </div>
  );
}
