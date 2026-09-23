begin;

insert into public.site_content_blocks (
  key,
  eyebrow,
  title,
  body,
  is_public,
  admin_editable,
  content_group,
  admin_label,
  editable_fields,
  policy_key,
  sort_order
) values (
  'about.featured',
  null,
  'Find a stay. Find the adventure around it.',
  'Cabins, campgrounds, lake stays, RV spots and independent places close to the places people already want to explore.',
  true,
  true,
  'About',
  'Featured card',
  array['title','body']::text[],
  null,
  15
)
on conflict (key) do update set
  eyebrow = null,
  is_public = true,
  admin_editable = true,
  content_group = 'About',
  admin_label = 'Featured card',
  editable_fields = array['title','body']::text[],
  policy_key = null,
  sort_order = 15;

commit;
