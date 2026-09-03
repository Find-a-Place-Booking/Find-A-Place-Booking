"use client";

import Link from "next/link";
import { useState } from "react";
import { Brand } from "./Brand";

const primaryLinks = [
  ["Find a stay", "/stays"],
  ["Destinations", "/#regions"],
  ["For hosts", "/hosts"],
  ["Why Find A Place", "/#story"]
];

export function Header({ light = false }: { light?: boolean }) {
  const [menuOpen, setMenuOpen] = useState(false);
  const closeMenu = () => setMenuOpen(false);

  return (
    <header className={`site-header ${light ? "header-light" : ""}`}>
      <div className="shell header-inner">
        <Brand />
        <nav className="main-nav" aria-label="Main navigation">
          {primaryLinks.map(([label, href]) => <Link key={label} href={href}>{label}</Link>)}
        </nav>
        <div className="header-actions">
          <Link className="text-link" href="/trip">My trip</Link>
          <Link className="text-link" href="/host">Host sign in</Link>
          <Link className="button button-small button-outline header-list-property" href="/host/onboarding">List your property</Link>
          <button
            className="mobile-menu-toggle"
            type="button"
            aria-label={menuOpen ? "Close menu" : "Open menu"}
            aria-expanded={menuOpen}
            onClick={() => setMenuOpen((value) => !value)}
          >
            <span />
            <span />
            <span />
          </button>
        </div>
      </div>
      {menuOpen && (
        <div className="mobile-menu-shell">
          <nav className="shell mobile-menu" aria-label="Mobile navigation">
            {primaryLinks.map(([label, href]) => <Link key={label} href={href} onClick={closeMenu}>{label}<span>→</span></Link>)}
            <div className="mobile-menu-secondary">
              <Link href="/trip" onClick={closeMenu}>My trip</Link>
              <Link href="/host" onClick={closeMenu}>Host sign in</Link>
            </div>
            <Link className="button button-full" href="/host/onboarding" onClick={closeMenu}>List your property</Link>
          </nav>
        </div>
      )}
    </header>
  );
}
