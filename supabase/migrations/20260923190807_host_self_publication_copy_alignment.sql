begin;

update public.site_content_blocks
set title = 'Publish when your listing is ready',
    body = 'Once the required listing details are complete and your payment account is ready, you can publish the stay directly from your host dashboard.',
    updated_at = now()
where key = 'hosts.step4'
  and title = 'Send it for review'
  and body = 'Find A Place checks the listing, then it can appear in traveler searches.';

commit;
