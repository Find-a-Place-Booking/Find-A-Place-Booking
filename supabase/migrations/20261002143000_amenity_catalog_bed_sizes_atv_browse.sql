-- Amenity catalog parity + requested browse amenities.
--
-- The host UI already exposed several amenity labels that were not present in
-- amenity_catalog. Because save_property_listing and onboarding persist
-- amenities by matching the selected label against amenity_catalog, those
-- missing rows could silently disappear on save.
--
-- This migration brings the DB catalog into parity with the UI and adds the
-- new jetted spa tub, outdoor shower, ATV access and bed-size options.

insert into public.amenity_catalog (code, label, category, active) values
  ('pool', 'Pool', 'Popular', true),
  ('jetted-spa-tub', 'Jetted spa tub', 'Popular', true),

  ('king-bed', 'King bed', 'Sleeping arrangements', true),
  ('queen-bed', 'Queen bed', 'Sleeping arrangements', true),
  ('full-double-bed', 'Full / double bed', 'Sleeping arrangements', true),
  ('twin-bed', 'Twin bed', 'Sleeping arrangements', true),
  ('bunk-beds', 'Bunk beds', 'Sleeping arrangements', true),
  ('sofa-bed', 'Sofa bed', 'Sleeping arrangements', true),

  ('outdoor-shower', 'Outdoor shower', 'Outdoor & location', true),
  ('atv-access', 'ATV access', 'Outdoor & location', true),
  ('private-pool', 'Private pool', 'Outdoor & location', true),
  ('shared-pool', 'Shared pool', 'Outdoor & location', true),
  ('private-dock', 'Private dock', 'Outdoor & location', true),
  ('shared-dock', 'Shared dock', 'Outdoor & location', true),
  ('boat-slip', 'Boat slip', 'Outdoor & location', true),
  ('beach-access', 'Beach access', 'Outdoor & location', true),
  ('fishing-access', 'Fishing access', 'Outdoor & location', true),
  ('boat-ramp-nearby', 'Boat ramp nearby', 'Outdoor & location', true),
  ('kayaks-provided', 'Kayaks provided', 'Outdoor & location', true),
  ('canoes-provided', 'Canoes provided', 'Outdoor & location', true),
  ('paddleboards-provided', 'Paddleboards provided', 'Outdoor & location', true),
  ('lake-view', 'Lake view', 'Outdoor & location', true),
  ('river-view', 'River view', 'Outdoor & location', true)
on conflict (code) do update
set
  label = excluded.label,
  category = excluded.category,
  active = true;
