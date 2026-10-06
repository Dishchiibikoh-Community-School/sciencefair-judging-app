-- ════════════════════════════════════════════════════════════════════════════
-- Migration 2026-10l — per-school branding (logo + fair poster)
-- ════════════════════════════════════════════════════════════════════════════
-- WHY
--   Every school's pages showed ONE school's wildcat logo (public/logo.png) and the text
--   "Dishchiibikoh Community School" — the registration page, the public project list, the
--   confirmation email and the browser/app icon. Each school now uploads its own logo and an
--   optional fair poster in Admin → Setup; a school without a logo gets a neutral monogram.
--
-- WHAT
--   • school_branding(school_id, logo_path, poster_path, poster_alt) — PUBLIC read (a logo is
--     public by nature; no personal data), writes ONLY through set_school_branding()
--   • set_school_branding(school, kind, path, alt) — admin of THAT school only; the path must
--     be a file in that school's own folder of the bucket, and must already be uploaded
--   • Storage bucket "school-branding" (public read, ≤ 2 MB, WebP / PNG / JPEG only) and
--     storage.objects policies: an admin may add / delete files only under "<their school id>/"
--     and only with the names the app generates. No UPDATE policy: files are never overwritten
--     (every upload gets a new name, so browsers and the CDN can cache them forever).
--   • The existing wildcat logo is kept for Dishchii'bikoh ONLY: seeded as "builtin:…" for the
--     school whose id AND slug both match (checked on the live project 2026-10-06). The app
--     resolves "builtin:" for that school id only. Removing it in Setup is permanent (a re-run
--     never puts it back).
--
-- COUPLING — none. Safe in either order:
--   • old app + this SQL: nothing reads the new table; nothing changes.
--   • new app without this SQL: Dishchii'bikoh keeps its logo, other schools get the neutral
--     monogram, and Setup → School branding says the migration has not been run.
--
-- RE-RUNNABLE. No bare DELETE/UPDATE (Supabase pg-safeupdate).
-- Storage parts are skipped where the storage schema does not exist (local test databases).
-- ════════════════════════════════════════════════════════════════════════════


-- ── PART 1: the branding row ────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.school_branding (
  school_id   UUID PRIMARY KEY REFERENCES public.schools(id) ON DELETE CASCADE,
  logo_path   TEXT,
  poster_path TEXT,
  poster_alt  TEXT NOT NULL DEFAULT '' CHECK (char_length(poster_alt) <= 250),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.school_branding ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "school_branding_select" ON public.school_branding;
DROP POLICY IF EXISTS "school_branding_insert" ON public.school_branding;
DROP POLICY IF EXISTS "school_branding_update" ON public.school_branding;
DROP POLICY IF EXISTS "school_branding_delete" ON public.school_branding;
-- Read open: the landing page, registration form and public results are anonymous.
CREATE POLICY "school_branding_select" ON public.school_branding FOR SELECT USING (true);
CREATE POLICY "school_branding_insert" ON public.school_branding FOR INSERT WITH CHECK (false);
CREATE POLICY "school_branding_update" ON public.school_branding FOR UPDATE USING (false);
CREATE POLICY "school_branding_delete" ON public.school_branding FOR DELETE USING (false);
REVOKE INSERT, UPDATE, DELETE ON public.school_branding FROM anon, authenticated;
GRANT SELECT ON public.school_branding TO anon, authenticated;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime')
     AND NOT EXISTS (SELECT 1 FROM pg_publication_tables
                      WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'school_branding') THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.school_branding;
  END IF;
END $$;


-- ── PART 2: keep the existing logo for its own school only ──────────────────
-- Both the id and the slug must match, so a different school can never inherit it.
-- ON CONFLICT DO NOTHING: once the admin replaces or removes it, a re-run leaves it alone.
INSERT INTO public.school_branding (school_id, logo_path)
SELECT id, 'builtin:dishchiibikoh'
  FROM public.schools
 WHERE id = '5667eba1-2f45-4830-96b7-6a6467113dfc'
   AND slug = 'dishchiibikoh-community-school'
ON CONFLICT (school_id) DO NOTHING;


-- ── PART 3: storage object names an admin may manage ────────────────────────
-- "<school uuid>/logo-<random>.webp" | "<school uuid>/poster-<random>.jpg" …  and only for
-- an admin of THAT school. CASE keeps the uuid cast from running on a malformed name.
CREATE OR REPLACE FUNCTION public.can_manage_branding_object(p_name text)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT CASE
    WHEN p_name ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/(logo|poster)-[A-Za-z0-9_-]{8,64}\.(webp|png|jpg)$'
      THEN is_school_admin(split_part(p_name, '/', 1)::uuid)
    ELSE false
  END
$$;
REVOKE EXECUTE ON FUNCTION public.can_manage_branding_object(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.can_manage_branding_object(text) TO authenticated;


-- ── PART 4: set_school_branding() — the only way to change a school's branding ──
-- p_kind: 'logo' | 'poster' (p_path NULL = remove) | 'poster_alt' (description only).
-- Returns the new row plus old_path, so the app can delete the replaced file afterwards.
CREATE OR REPLACE FUNCTION public.set_school_branding(
  p_school_id uuid, p_kind text, p_path text, p_alt text DEFAULT NULL
)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_row    school_branding%ROWTYPE;
  v_old    text;
  v_alt    text := btrim(COALESCE(p_alt, ''));
  v_exists boolean := true;
BEGIN
  IF NOT is_school_admin(p_school_id) THEN
    RAISE EXCEPTION 'Not authorised' USING ERRCODE = 'P0001';
  END IF;
  IF p_kind NOT IN ('logo', 'poster', 'poster_alt') THEN
    RAISE EXCEPTION 'Unknown branding item.' USING ERRCODE = 'P0001';
  END IF;

  IF p_kind IN ('logo', 'poster') AND p_path IS NOT NULL THEN
    -- Only a file in THIS school's folder, with a name the app generates.
    IF p_path !~ ('^' || p_school_id::text || '/' || p_kind || '-[A-Za-z0-9_-]{8,64}\.(webp|png|jpg)$') THEN
      RAISE EXCEPTION 'That image does not belong to this school.' USING ERRCODE = 'P0001';
    END IF;
    -- …that has actually been uploaded (skipped where storage is not installed).
    IF to_regclass('storage.objects') IS NOT NULL THEN
      BEGIN
        -- row_security = off makes Postgres RAISE (instead of silently returning no rows) if this
        -- function's owner cannot bypass the storage policies — then we skip the check rather than
        -- refuse every save. Undone automatically if the block fails.
        PERFORM set_config('row_security', 'off', true);
        EXECUTE 'SELECT EXISTS (SELECT 1 FROM storage.objects WHERE bucket_id = $1 AND name = $2)'
          INTO v_exists USING 'school-branding', p_path;
        PERFORM set_config('row_security', 'on', true);
      EXCEPTION WHEN insufficient_privilege THEN
        v_exists := true;   -- cannot look; the storage policies already limited who could upload
      END;
      IF NOT v_exists THEN
        RAISE EXCEPTION 'The image was not uploaded. Please try again.' USING ERRCODE = 'P0001';
      END IF;
    END IF;
  END IF;

  IF p_kind = 'poster' AND p_path IS NOT NULL AND char_length(v_alt) < 3 THEN
    RAISE EXCEPTION 'Describe the poster in a few words (for people using screen readers).' USING ERRCODE = 'P0001';
  END IF;
  IF char_length(v_alt) > 250 THEN
    RAISE EXCEPTION 'The poster description is too long (250 characters at most).' USING ERRCODE = 'P0001';
  END IF;

  INSERT INTO school_branding (school_id) VALUES (p_school_id) ON CONFLICT (school_id) DO NOTHING;
  SELECT * INTO v_row FROM school_branding WHERE school_id = p_school_id FOR UPDATE;

  IF p_kind = 'logo' THEN
    v_old := v_row.logo_path;
    UPDATE school_branding SET logo_path = p_path, updated_at = now() WHERE school_id = p_school_id;
  ELSIF p_kind = 'poster' THEN
    v_old := v_row.poster_path;
    UPDATE school_branding
       SET poster_path = p_path, poster_alt = CASE WHEN p_path IS NULL THEN '' ELSE v_alt END, updated_at = now()
     WHERE school_id = p_school_id;
  ELSE
    IF v_row.poster_path IS NULL THEN
      RAISE EXCEPTION 'Upload a poster first.' USING ERRCODE = 'P0001';
    END IF;
    IF char_length(v_alt) < 3 THEN
      RAISE EXCEPTION 'Describe the poster in a few words (for people using screen readers).' USING ERRCODE = 'P0001';
    END IF;
    UPDATE school_branding SET poster_alt = v_alt, updated_at = now() WHERE school_id = p_school_id;
  END IF;

  SELECT * INTO v_row FROM school_branding WHERE school_id = p_school_id;
  RETURN to_jsonb(v_row) || jsonb_build_object('old_path', CASE WHEN v_old IS DISTINCT FROM p_path THEN v_old END);
END $$;
REVOKE EXECUTE ON FUNCTION public.set_school_branding(uuid, text, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_school_branding(uuid, text, text, text) TO authenticated;


-- ── PART 5: storage bucket + policies (Supabase only) ───────────────────────
DO $$
DECLARE
  v_has_limits boolean;
BEGIN
  IF to_regclass('storage.buckets') IS NULL OR to_regclass('storage.objects') IS NULL THEN
    RAISE NOTICE 'storage schema not found — skipping the school-branding bucket (local test database).';
    RETURN;
  END IF;

  -- Public bucket: anyone may READ a file by its URL (logos are public); nobody may LIST it
  -- (there is no SELECT policy for anon). Size and type limits are enforced by Storage itself.
  v_has_limits := EXISTS (SELECT 1 FROM information_schema.columns
                           WHERE table_schema = 'storage' AND table_name = 'buckets' AND column_name = 'allowed_mime_types');
  IF v_has_limits THEN
    EXECUTE $q$
      INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
      VALUES ('school-branding', 'school-branding', true, 2097152, ARRAY['image/webp','image/png','image/jpeg'])
      ON CONFLICT (id) DO UPDATE
        SET public = true, file_size_limit = EXCLUDED.file_size_limit, allowed_mime_types = EXCLUDED.allowed_mime_types
    $q$;
  ELSE
    EXECUTE $q$
      INSERT INTO storage.buckets (id, name, public) VALUES ('school-branding', 'school-branding', true)
      ON CONFLICT (id) DO UPDATE SET public = true
    $q$;
  END IF;

  EXECUTE 'DROP POLICY IF EXISTS "qritiko_branding_insert" ON storage.objects';
  EXECUTE 'DROP POLICY IF EXISTS "qritiko_branding_select" ON storage.objects';
  EXECUTE 'DROP POLICY IF EXISTS "qritiko_branding_delete" ON storage.objects';
  EXECUTE $q$CREATE POLICY "qritiko_branding_insert" ON storage.objects FOR INSERT TO authenticated
    WITH CHECK (bucket_id = 'school-branding' AND public.can_manage_branding_object(name))$q$;
  -- SELECT is needed by the Storage API to delete (DELETE … RETURNING); admins of that school only.
  EXECUTE $q$CREATE POLICY "qritiko_branding_select" ON storage.objects FOR SELECT TO authenticated
    USING (bucket_id = 'school-branding' AND public.can_manage_branding_object(name))$q$;
  EXECUTE $q$CREATE POLICY "qritiko_branding_delete" ON storage.objects FOR DELETE TO authenticated
    USING (bucket_id = 'school-branding' AND public.can_manage_branding_object(name))$q$;
END $$;
