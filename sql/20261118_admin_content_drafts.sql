-- Persistent admin-only drafts; publishing still uses the existing versioned, audited RPC.
BEGIN;
CREATE TABLE IF NOT EXISTS public.site_copy_drafts (
  key text PRIMARY KEY REFERENCES public.site_content_blocks(key) ON DELETE CASCADE,
  title text NOT NULL CHECK(char_length(title) BETWEEN 1 AND 500),
  eyebrow text,
  body text,
  updated_by uuid REFERENCES public.profiles(id),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT draft_eyebrow_length CHECK(eyebrow IS NULL OR char_length(eyebrow) <= 200),
  CONSTRAINT draft_body_length CHECK(body IS NULL OR char_length(body) <= 20000)
);
ALTER TABLE public.site_copy_drafts ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.site_copy_drafts FROM anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.site_copy_drafts TO authenticated;
DROP POLICY IF EXISTS site_copy_drafts_admin_select ON public.site_copy_drafts;
CREATE POLICY site_copy_drafts_admin_select ON public.site_copy_drafts FOR SELECT TO authenticated USING (public.admin_has_any_role(ARRAY['SUPER_ADMIN','OPERATIONS_ADMIN']::public.admin_role[]));
DROP POLICY IF EXISTS site_copy_drafts_admin_insert ON public.site_copy_drafts;
CREATE POLICY site_copy_drafts_admin_insert ON public.site_copy_drafts FOR INSERT TO authenticated WITH CHECK (public.admin_has_any_role(ARRAY['SUPER_ADMIN','OPERATIONS_ADMIN']::public.admin_role[]));
DROP POLICY IF EXISTS site_copy_drafts_admin_update ON public.site_copy_drafts;
CREATE POLICY site_copy_drafts_admin_update ON public.site_copy_drafts FOR UPDATE TO authenticated USING (public.admin_has_any_role(ARRAY['SUPER_ADMIN','OPERATIONS_ADMIN']::public.admin_role[])) WITH CHECK (public.admin_has_any_role(ARRAY['SUPER_ADMIN','OPERATIONS_ADMIN']::public.admin_role[]));
DROP POLICY IF EXISTS site_copy_drafts_admin_delete ON public.site_copy_drafts;
CREATE POLICY site_copy_drafts_admin_delete ON public.site_copy_drafts FOR DELETE TO authenticated USING (public.admin_has_any_role(ARRAY['SUPER_ADMIN','OPERATIONS_ADMIN']::public.admin_role[]));
COMMIT;
