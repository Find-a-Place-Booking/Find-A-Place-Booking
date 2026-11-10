import Link from "next/link";
import styles from "@/components/AppInstallLinks.module.css";

export default function AppsPage() {
  return (
    <main className="shell" style={{ paddingBlock: "clamp(32px,6vw,64px)", maxWidth: 900 }}>
      <Link href="/" style={{ display: "inline-block", marginBottom: 22, fontWeight: 700, color: "#345843" }}>← Find A Place</Link>
      <p className="eyebrow dark">Find A Place on your phone</p>
      <h1 style={{ marginTop: 0 }}>The stays you love, one tap away.</h1>
      <p style={{ maxWidth: 650, color: "#5e6a61", lineHeight: 1.65 }}>Both apps work from your phone's home screen. Open the right one below, then use its install button or your browser's Add to Home Screen option. No app store required.</p>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(min(100%,300px),1fr))", gap: 18, marginTop: 30 }}>
        <section className="panel" style={{ padding: 24 }}>
          <p className="eyebrow dark">For travelers · Free</p>
          <h2>Guest app</h2>
          <p>Discover stays, save favorites, and keep trip details and messages handy while you travel.</p>
          <Link className={styles.hostAppAction} href="/apps/guest" style={{ marginTop: 20 }}>Open guest app →</Link>
        </section>
        <section className="panel" style={{ padding: 24 }}>
          <p className="eyebrow dark">For property owners &amp; managers</p>
          <h2>Host app</h2>
          <p>Manage bookings, calendars, prices and guest messages on the go. Included for verified partners; other hosts can start a trial or subscribe.</p>
          <Link className={styles.hostAppAction} href="/host/mobile" style={{ marginTop: 20 }}>Get host app →</Link>
        </section>
      </div>
    </main>
  );
}
