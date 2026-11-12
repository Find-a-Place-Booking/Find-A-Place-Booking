import Link from "next/link";
import styles from "@/components/AppInstallLinks.module.css";

export default function AppsPage() {
  return (
    <main className="shell" style={{ paddingBlock: "clamp(32px,6vw,64px)", maxWidth: 900 }}>
      <Link href="/" style={{ display: "inline-block", marginBottom: 22, fontWeight: 700, color: "#345843" }}>← Find A Place</Link>
      <p className="eyebrow dark">Find A Place on your phone</p>
      <h1 style={{ marginTop: 0 }}>Two free apps. One easy booking conversation.</h1>
      <p style={{ maxWidth: 650, color: "#5e6a61", lineHeight: 1.65 }}>
        Both apps work from your phone's home screen with no app store or subscription required.
        Guests and hosts have separate tools, but can message each other about confirmed trips.
        Open the app you need and choose Install or Add to Home Screen.
      </p>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(min(100%,300px),1fr))", gap: 18, marginTop: 30 }}>
        <section className="panel" style={{ padding: 24 }}>
          <p className="eyebrow dark">Travelers · Always free</p>
          <h2>Guest app</h2>
          <p>Find stays, save favorites, access trip details, and message the host of your booking.</p>
          <Link className={styles.hostAppAction} href="/apps/guest" style={{ marginTop: 20 }}>Open free Guest app →</Link>
        </section>
        <section className="panel" style={{ padding: 24 }}>
          <p className="eyebrow dark">Owners &amp; managers · Always free</p>
          <h2>Host app</h2>
          <p>Manage your own properties, bookings, rates, calendars and guest messages. A host login and active owner/manager membership are required, but no payment.</p>
          <Link className={styles.hostAppAction} href="/host/mobile" style={{ marginTop: 20 }}>Open free Host app →</Link>
        </section>
      </div>
    </main>
  );
}
