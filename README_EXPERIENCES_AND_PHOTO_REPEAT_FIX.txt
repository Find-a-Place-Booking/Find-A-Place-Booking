Find A Place Booking — Nearby Experiences Reuse + Guest Photo Repeat Fix

FULL REPLACEMENT FILES:
- components/PropertyGallery.tsx
- components/NearbyExperiencesManager.tsx

NO DATABASE MIGRATION.
NO CSS FILES CHANGED.
NO IMAGE DIMENSIONS, GALLERY HEIGHTS, OBJECT-FIT RULES, THUMBNAIL SIZES,
OR UPLOAD LIMITS WERE CHANGED.

PHOTO FIX
The guest gallery previously used the primary photo as a fallback for missing
photo #2 and photo #3. Listings with only one or two real photos therefore
looked like they contained repeated photos.

The replacement:
- uses only real unique image URLs,
- keeps the existing three-slot gallery layout,
- leaves missing slots as the existing placeholders,
- keeps the existing image sizes/layout/CSS untouched,
- makes the lightbox/count use only real unique photos.

The live database was checked before building this overlay. Renea's stored
property image files are distinct; the visible repetition was the gallery
fallback behavior, not duplicate database image rows. The same issue also
affected other published listings with fewer than three images, so this is a
global guest-view fix.

EXPERIENCES REUSE
Adds a reuse panel to the existing Nearby Experiences editor:
- Apply to selected listings
- Apply to all other listings in the same host organization
- Existing target experiences are preserved
- Matching names are skipped
- 12-experience target limit is respected
- Images are reused without requiring another upload
- Saved source state is copied, so unsaved edits on screen are not copied

The copied nearby-image storage path can be referenced by more than one
property. The manager now checks whether an image is still referenced before
removing the stored file when an experience is deleted or its image is
replaced. This prevents a copied experience image from breaking on another
listing.

Miles/drive time are copied exactly from the source. The UI tells the host to
use this across listings at the same property/location.
