-- Safe, additive catalog update. Run once before deploying lib/property/catalog.ts.
-- No existing selections, properties or reservations are changed.
INSERT INTO public.amenity_catalog (code, label, category, active)
VALUES
 ('sauna','Sauna','Popular',true),
 ('crib','Crib','Sleeping arrangements',true),
 ('electric-kettle','Electric kettle','Kitchen & dining',true),
 ('air-fryer','Air fryer','Kitchen & dining',true),
 ('slow-cooker','Slow cooker','Kitchen & dining',true),
 ('coffee-grinder','Coffee grinder','Kitchen & dining',true),
 ('blackout-curtains','Blackout curtains','Comfort & entertainment',true),
 ('board-games','Board games','Comfort & entertainment',true),
 ('books','Books','Comfort & entertainment',true),
 ('streaming-services','Streaming services','Comfort & entertainment',true),
 ('wood-burning-stove','Wood-burning stove','Comfort & entertainment',true),
 ('hammock','Hammock','Outdoor & location',true),
 ('screened-porch','Screened porch','Outdoor & location',true),
 ('balcony','Balcony','Outdoor & location',true),
 ('firewood-provided','Firewood provided','Outdoor & location',true),
 ('hiking-trail-access','Hiking trail access','Outdoor & location',true),
 ('outdoor-soaking-tub','Outdoor soaking tub','Outdoor & location',true),
 ('baby-gate','Baby gate','Safety & family',true),
 ('rv-parking','RV parking','Parking & access',true),
 ('covered-parking','Covered parking','Parking & access',true)
ON CONFLICT (code) DO NOTHING;
