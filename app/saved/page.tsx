import type { Metadata } from "next";

import { Footer } from "@/components/Footer";
import { Header } from "@/components/Header";
import { SavedStaysClient } from "@/components/SavedStaysClient";

export const metadata: Metadata = {
  title: "Saved Stays",
  description:
    "Keep the Find A Place stays you want to compare and come back to.",
  alternates: { canonical: "/saved" },
  robots: { index: false, follow: true },
};

export default function SavedStaysPage() {
  return (
    <>
      <Header />
      <main className="results-main">
        <section className="shell results-summary-band">
          <div className="results-head">
            <div>
              <p className="eyebrow dark">Your shortlist</p>
              <h1>Saved stays</h1>
              <p>
                Keep the places that caught your eye, compare them, and come
                back when you are ready to book.
              </p>
            </div>
          </div>
        </section>

        <section className="shell" style={{ paddingBottom: 80 }}>
          <SavedStaysClient />
        </section>
      </main>
      <Footer />
    </>
  );
}
