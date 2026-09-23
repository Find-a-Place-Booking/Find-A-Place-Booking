Find A Place Booking - host hero fall video overlay

Built against main commit: 9fd39e2bd5d1b070950c21edbfecd5794767186a

Overlay these files at the project root:
  app/hosts/page.tsx
  app/hosts/hosts.module.css
  public/media/find-a-place-host-fall-loop.mp4
  public/media/find-a-place-host-fall-poster.jpg

What changes:
- Adds the fall cabin/lake video behind the existing /hosts hero section.
- Keeps all existing host page copy, links, 7% commission card, and lower-page sections unchanged.
- Uses a page-scoped CSS module; app/globals.css is NOT touched.
- Uses the poster image while the video loads.
- Mobile receives a stronger overlay and adjusted crop for readability.

No other project files are included.
