Find A Place Booking — Unified Host Photo Section

FULL REPLACEMENT FILES:
- components/PropertyEditor.tsx
- app/host/properties/[slug]/page.tsx

NO DATABASE MIGRATION.
NO IMAGE CSS OR IMAGE DIMENSIONS CHANGED.
NO STORAGE PATH OR UPLOAD SIZE CHANGES.

WHAT CHANGED
The host property page previously had two separate photo areas:
1) Section 6 inside PropertyEditor for upload/remove.
2) A second PrimaryPhotoSelector panel below the editor for ordering/primary.

This overlay combines both jobs into Section 6 — Photos.

THE ONE PHOTO SECTION NOW HANDLES
- Upload up to 25 photos.
- Existing photo previews.
- Remove photos.
- Drag-and-drop ordering on desktop.
- Earlier/later controls for phones and tablets.
- Make primary.
- Clear primary-photo label.
- Immediate persistence of ordering through the existing reorder_property_images RPC.
- Existing published-listing protection requiring at least one photo remains intact.

The separate PrimaryPhotoSelector render is removed from the host property page.
The component file itself is not deleted, so nothing else importing it would break.
It is simply no longer rendered on this page.

IMPORTANT
This intentionally preserves the existing property image grid/CSS and therefore does
not change host image dimensions, guest image dimensions, crop behavior, object-fit,
file-size limits, photo count limits, or storage behavior.
