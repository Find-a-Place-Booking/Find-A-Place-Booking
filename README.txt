Find A Place Booking - direct primary-photo social preview fix

This replaces the two social image handlers from the previous attempts.

Behavior:
1. Look up the published listing by slug.
2. Use image_paths[0] -- the listing's real primary/first photo.
3. Create a 1200x630 transformed signed URL.
4. Redirect Facebook/social crawlers directly to that property image.
5. If transformation cannot be signed, redirect to the ORIGINAL primary property photo.
6. Only use the Find A Place logo if the property has no stored image or both signed-URL attempts fail.

Why this version:
The previous implementation downloaded the private property image through the
Find A Place server before serving it to Facebook. Lil' Rustic has a valid primary
photo (~8.2 MB), so the logo result proved that middle download/render path was
failing. This version removes that middle step.

The route is no-store and the Next opengraph metadata route changes with the
deployment, which helps force Facebook to fetch the corrected image.

No booking/calendar/payment/property-photo data is changed.
