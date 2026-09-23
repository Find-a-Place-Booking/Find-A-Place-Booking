-- Editable content for the source-based Find A Place About/Team page.
-- Existing About copy is preserved; these rows add the source history/team sections.

begin;

insert into public.site_content_blocks (
  key, eyebrow, title, body, admin_editable, content_group, admin_label, editable_fields, sort_order
) values
  ('about.network_hero', 'Unforgettable Stays. Exceptional Adventures.', 'Find A Place Arkansas & Beyond Collaboration Network', 'Find A Place Arkansas & Beyond - Who We Are/What We Do', true, 'About', 'Network hero', ARRAY['eyebrow','title','body']::text[], 11),
  ('about.history', 'Our story', 'How the Find A Place team grew.', 'Founding collaborators are Renea with "Renea and Jon''s Travels", Mike with “Van Muir - For Life Outdoors”, Chad with “Chasing The Ozarks” and Gez with “Waterfalls in AR & Other Cool Places”.

In June 2024 we welcomed Joey Hunter with the "Adventure Arkansas" page and "Bridges of Arkansas" Group aboard the Find A Place Arkansas team.

In September 2024 we invited Marcus Allen with the "Floating the Ozarks" page.

In October 2024, Tammy Bradley from the "Arkansas Sole Sisters Group" joined our collaboration.

In January 2025, Aaron with Vinci Snaps joined our team.

In February 2025, Hilary with "Explore MO*AR" and Ben our "VP of Behind the Scenes" or Marketing Coordinator joined the Find A Place Team.

In May 2026, Lobo with the Arkansas Outdoors page joined the Find A Place Team.

In July 2026, Ozarks Uncovered and Arkansas Trail Diaries joined the Find A Place Team.

In September, McCarley Norway joined the Find A Place Team.', true, 'About', 'Team history', ARRAY['eyebrow','title','body']::text[], 42),
  ('about.following', '', 'Our combined reach', 'Collectively across all our platforms, we have a social media following of great outdoor enthusiast!', true, 'About', 'Combined reach', ARRAY['eyebrow','title','body']::text[], 44),
  ('about.booking_bridge', 'The network today', 'The same outdoor community, now connected to booking.', 'The original Find A Place network was built around short-term rentals and the outdoorsy things to see and do around them. Find A Place Booking carries that idea forward by giving travelers a place to discover and book independent stays while keeping the people, places and adventures behind the network at the center of it.', true, 'About', 'Booking bridge', ARRAY['eyebrow','title','body']::text[], 46),
  ('about.team_intro', 'Team Find A Place', 'Meet the people behind the network.', 'Outdoor creators, travelers, a short-term rental owner, marketing and technology working together around the places people want to explore.', true, 'About', 'Team introduction', ARRAY['eyebrow','title','body']::text[], 60),
  ('about.map_intro', 'Across the Find A Place network', 'See where our partners are.', 'Find A Place started by connecting travelers with local stays and outdoor destinations across Arkansas. This map shows the partner locations that make up that growing network.', true, 'About', 'Partner map introduction', ARRAY['eyebrow','title','body']::text[], 90),
  ('about.team.renea-jon', '"Renea and Jon Travels" · "Explore, Stay, Adventure, Repeat"', 'Renea and Jon', 'Renea is a short-term rental property owner, is very active within many multi-state social media groups, and has a complete understanding of the short-term rental business. She owns and operates Fancy Hill Cabins and RV Park LLC and runs her own travel blog Renea''s and Jon''s Travels & Explore.Stay.Adventure.Repeat. She also handles our group pages and is the guru of all things behind the scenes at Find A Place, Famous Jon and Renea inspire to help others to step out side find their adventure and always support local business.', true, 'About', 'Team - Renea and Jon', ARRAY['eyebrow','title','body']::text[], 61),
  ('about.team.mike', '"Van Muir - For Life Outdoors"', 'Mike', 'Mike has a passion for the outdoors and design work and has a nationwide ambassadorial network of outdoors artists.', true, 'About', 'Team - Mike', ARRAY['eyebrow','title','body']::text[], 62),
  ('about.team.chad', '"Chasing the Ozarks"', 'Chad', 'Chad is an avid Ozarks (and beyond!) hiker and creates some high quality shots and drone video clips of his hiking adventures.', true, 'About', 'Team - Chad', ARRAY['eyebrow','title','body']::text[], 63),
  ('about.team.gez', '"Waterfalls in Arkansas and Other Cool Places"', 'Gez', 'Gez is a dedicated waterfall chaser, has authored a comprehensive map of Waterfalls in AR, and his 4-legged companion “Super Leeds” is the USFS (Ozark & Ouachita National Forests) Pet of the year for 2023.', true, 'About', 'Team - Gez', ARRAY['eyebrow','title','body']::text[], 64),
  ('about.team.joey', '"Adventure Arkansas"', 'Joey', 'Joey is the face behind the social media page Adventure Arkansas and the group Bridges of Arkansas. He and his wife travel all four corners of Arkansas frequently and document their travels.', true, 'About', 'Team - Joey', ARRAY['eyebrow','title','body']::text[], 65),
  ('about.team.marcus', '"Floating the Ozarks"', 'Marcus', 'Marcus is the face behind the Floating the Ozarks page and is an avid floater & camper and he will be significant in helping us as we expand our roots further into southern Missouri.', true, 'About', 'Team - Marcus', ARRAY['eyebrow','title','body']::text[], 66),
  ('about.team.tammy', '"Arkansas Sole Sisters Hiking Group"', 'Tammy', 'Tammy is the founder of Arkansas Sole Sisters Hiking Group, In 2021 Arkansas Sole Sisters took their first hike, now many adventures later this hiking group inspires to help women build friendships, lift each other up as well as create an atmosphere of empowerment, all while going on fun filled adventures exploring the beautiful state.', true, 'About', 'Team - Tammy', ARRAY['eyebrow','title','body']::text[], 67),
  ('about.team.aaron', 'Vinci Snaps', 'Aaron', 'Aaron is the founder of Vinci Snaps. He has a passion for hiking and all things night sky photography, and his work is absolutely stunning!', true, 'About', 'Team - Aaron', ARRAY['eyebrow','title','body']::text[], 68),
  ('about.team.hilary', '"Explore MO*AR"', 'Hilary', 'Hilary is the founder of Explore MOAR. She has a passion for hiking, waterfalls, and scenic views, often traveling Southern MO and much of the Ozarks. AND she often travels with Chad with Chasing the Ozarks her partner in crime.', true, 'About', 'Team - Hilary', ARRAY['eyebrow','title','body']::text[], 69),
  ('about.team.ben', '"VP of Behind the Scenes" · Marketing Coordinator', 'Ben', 'Ben will be spearheading many tasks behind the scenes for us. He is very fluent in social media and website automation and will be our marketing coordinator behind the scenes.', true, 'About', 'Team - Ben', ARRAY['eyebrow','title','body']::text[], 70),
  ('about.team.jake', 'Platform Development & Technology', 'Jake', 'Jake handles platform development and technology for Find A Place, building and maintaining the booking experience and the tools that support hosts, guests and the Find A Place team behind the scenes.', true, 'About', 'Team - Jake', ARRAY['eyebrow','title','body']::text[], 71),
  ('about.team.lobo', '"Arkansas Outdoors"', 'Lobo', 'Lobo is the face behind Arkansas Outdoors. His connection to nature started early and has only grown stronger with time. From camping and hiking to chasing waterfalls, exploring rivers, learning about plants and wildlife, and even guiding zipline adventures, the outdoors has always been at the heart of who he is. Today he shares his experiences to inspire others to get outside, connect with nature, and discover all it has to offer.', true, 'About', 'Team - Lobo', ARRAY['eyebrow','title','body']::text[], 72),
  ('about.team.ricky-tiffany', 'Ozarks Uncovered', 'Ricky and Tiffany', 'Ricky and Tiffany together make Ozarks Uncovered. Based over in the heart of the Missouri Ozarks, their passion is uncovering and sharing the incredible rugged beauty of the region.', true, 'About', 'Team - Ricky and Tiffany', ARRAY['eyebrow','title','body']::text[], 73),
  ('about.team.ashley', '"Arkansas Trail Diaries"', 'Ashley', 'Ashley is the face behind Arkansas Trail Diaries and is passionate about hiking and nature. Her hope is to inspire other to explore, learn about, and help protect the outdoors and everything the Natural State has to offer.', true, 'About', 'Team - Ashley', ARRAY['eyebrow','title','body']::text[], 74),
  ('about.team.mccarley', '"McCarley Explores"', 'McCarley', 'McCarley is a Huntsville, Alabama based content creator with a love for road trips and finding places that make you say, "How did I not know this was here?"', true, 'About', 'Team - McCarley', ARRAY['eyebrow','title','body']::text[], 75)
on conflict (key) do update set
  admin_editable = true,
  content_group = excluded.content_group,
  admin_label = excluded.admin_label,
  editable_fields = excluded.editable_fields,
  sort_order = excluded.sort_order;

commit;
