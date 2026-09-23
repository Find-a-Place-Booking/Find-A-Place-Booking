import { LegalDocument } from "@/components/LegalDocument";
import { copyBlock, loadManagedCopy } from "@/lib/public/managed-copy";
import { getCurrentPolicyVersions } from "@/lib/policies/current";

const defaults = {
  "policy.privacy.intro": { eyebrow: "Privacy", title: "Privacy & Identity Verification Notice", body: "Find A Place uses the information necessary to operate listings, bookings, payments, guest-host communication, cancellation requests, fraud prevention and support." },
  "policy.privacy.booking": { title: "Booking information", body: "Booking records may include the guest's name, email address, phone number, stay dates, party size, selected options, reservation messages, cancellation requests and responses, payment status and the policy versions accepted for the reservation." },
  "policy.privacy.email": { title: "Email verification", body: "Find A Place may send a short-lived verification code to the booking email. Verification codes are stored as one-way hashes rather than readable codes." },
  "policy.privacy.identity": { title: "Identity verification", body: "Stripe Identity processes government identification and selfie verification when required for a booking. Find A Place stores the Stripe verification session reference, verification status and timestamp needed to operate the reservation. Find A Place does not intentionally store copies of the guest's identity-document images or selfie in its own application database." },
  "policy.privacy.sharing": { title: "Information shared between guests and hosts", body: "Hosts receive reservation information needed to operate the stay, including the guest's name, booking email, phone number, party details and verification status. Guests may receive the host organization's booking contact email and phone number. Messages and cancellation requests sent through Find A Place are stored with the reservation so the parties and authorized support staff can review the booking record." },
  "policy.privacy.payments": { title: "Payment providers", body: "Guest charges are processed by supported payment providers on the host's connected account. Find A Place stores processor references and payment status needed to operate the reservation but does not store raw card or bank credentials." },
  "policy.privacy.providers": { title: "Service providers", body: "Find A Place uses third-party providers for infrastructure, payments, identity verification, email delivery, fraud prevention and related operational services. Those providers process information under their own service terms and privacy obligations." },
  "policy.privacy.retention": { title: "Retention and legal requests", body: "Reservation, message and financial records may be retained as reasonably necessary for accounting, disputes, fraud prevention, tax, support and legal obligations. Find A Place may disclose information when legally required or reasonably necessary to protect users, properties or the platform." },
};

export default async function PrivacyPage() {
  const [content, versions] = await Promise.all([loadManagedCopy(defaults), getCurrentPolicyVersions()]);
  const get = (key: keyof typeof defaults) => copyBlock(content, key); const intro = get("policy.privacy.intro");
  return <LegalDocument eyebrow={intro.eyebrow || "Privacy"} title={intro.title} version={versions.privacyNotice.version} effectiveAt={versions.privacyNotice.effectiveAt}><p>{intro.body}</p>{(["policy.privacy.booking", "policy.privacy.email", "policy.privacy.identity", "policy.privacy.sharing", "policy.privacy.payments", "policy.privacy.providers", "policy.privacy.retention"] as const).map((key) => { const block = get(key); return <section key={key}><h2>{block.title}</h2><p>{block.body}</p></section>; })}</LegalDocument>;
}
