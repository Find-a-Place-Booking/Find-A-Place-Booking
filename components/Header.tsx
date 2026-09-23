"use client";

import Link from "next/link";
import { createPortal } from "react-dom";
import { useEffect, useId, useState } from "react";

import { Brand } from "./Brand";
import mobileStyles from "./HeaderMobileMenu.module.css";

const primaryLinks = [
  ["Find a stay", "/stays"],
  ["Explore", "/#regions"],
  ["For hosts", "/hosts"],
  ["About Find A Place", "/about"],
];

export function Header({ light = false }: { light?: boolean }) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const menuId = useId();
  const closeMenu = () => setMenuOpen(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!menuOpen) return;

    document.body.classList.add("public-mobile-menu-open");

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") closeMenu();
    };

    const onResize = () => {
      if (window.innerWidth > 1000) closeMenu();
    };

    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("resize", onResize);

    return () => {
      document.body.classList.remove("public-mobile-menu-open");
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("resize", onResize);
    };
  }, [menuOpen]);

  const mobileMenu =
    mounted && menuOpen
      ? createPortal(
          <div className="mobile-menu-shell" data-open="true">
            <button
              className="mobile-menu-backdrop"
              type="button"
              aria-label="Close menu"
              onClick={closeMenu}
            />
            <nav
              id={menuId}
              className={`mobile-menu ${mobileStyles.mobileMenuWidth}`}
              aria-label="Mobile navigation"
            >
              <div className="mobile-menu-heading">
                <span>Menu</span>
                <button
                  type="button"
                  className="mobile-menu-close"
                  onClick={closeMenu}
                  aria-label="Close menu"
                >
                  ×
                </button>
              </div>

              <div className="mobile-menu-primary">
                {primaryLinks.map(([label, href]) => (
                  <Link key={label} href={href} onClick={closeMenu}>
                    {label}
                    <span>→</span>
                  </Link>
                ))}
              </div>

              <div className="mobile-menu-secondary">
                <Link href="/trip" onClick={closeMenu}>
                  My trip
                </Link>
                <Link
                  href="/host/sign-in"
                  prefetch={false}
                  onClick={closeMenu}
                >
                  Host sign in
                </Link>
              </div>

              <Link
                className="button button-full"
                href="/host/sign-up?next=%2Fhost%2Fonboarding"
                prefetch={false}
                onClick={closeMenu}
              >
                List your property
              </Link>
            </nav>
          </div>,
          document.body,
        )
      : null;

  return (
    <>
      <header className={`site-header ${light ? "header-light" : ""}`}>
        <div className="shell header-inner">
          <Brand />

          <nav className="main-nav" aria-label="Main navigation">
            {primaryLinks.map(([label, href]) => (
              <Link key={label} href={href}>
                {label}
              </Link>
            ))}
          </nav>

          <div className="header-actions">
            <Link className="text-link" href="/trip">
              My trip
            </Link>

            <Link
              className="text-link"
              href="/host/sign-in"
              prefetch={false}
            >
              Host sign in
            </Link>

            <Link
              className="button button-small button-outline header-list-property"
              href="/host/sign-up?next=%2Fhost%2Fonboarding"
              prefetch={false}
            >
              List your property
            </Link>

            <button
              className={`mobile-menu-toggle ${menuOpen ? "is-open" : ""}`}
              type="button"
              aria-label={menuOpen ? "Close menu" : "Open menu"}
              aria-expanded={menuOpen}
              aria-controls={menuId}
              onClick={() =>
                setMenuOpen((value) => !value)
              }
            >
              <span />
              <span />
              <span />
            </button>
          </div>
        </div>
      </header>

      {mobileMenu}
    </>
  );
}
