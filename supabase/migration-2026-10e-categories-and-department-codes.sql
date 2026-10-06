-- ════════════════════════════════════════════════════════════════════════════
-- Migration 2026-10e — per-school project categories + department codes
-- ════════════════════════════════════════════════════════════════════════════
-- WHY
--   `REG_CATEGORIES` was a module constant in the JSX, shared by every school on
--   the platform, and `api/scan-form.js` kept a hand-synced copy of the same six
--   strings. A robotics fair — or any school not using the 2026-27 Dishchii'bikoh
--   participation form — could not change its categories without a code deploy.
--   Categories now live in a per-school table, exactly like `departments`.
--
--   `departments.code` is added here (unused for now) so the registration-number
--   unification later does not need a second trip to the SQL editor. It replaces
--   the hardcoded DIV_CODES map (Elem / JHS / SHS).
--
-- SAFETY — ADDITIVE ONLY. Run it before or after deploying the app build:
--   • Old app  + new schema → old app never reads `categories` or `departments.code`.
--   • New app  + old schema → the app falls back to its built-in six categories
--     and logs CATEGORIES_TABLE_MISSING, so nothing breaks either way.
--   Nothing is dropped, renamed or rewritten. Rollback = redeploy the old build.
--
-- RE-RUNNABLE. The seed below only fires for schools that have NO categories at
--   all, so a school that has customised (or deleted) a category never has it
--   resurrected by a second run.
--
-- Verify afterwards as anon (CLAUDE.md rule 28 — the SQL editor saying "Success"
-- only means it parsed):
--   curl "$URL/rest/v1/categories?select=name,code&school_id=eq.<id>" -H "apikey: <anon>"
--     → 200 with the six rows (anon must be able to read: the public registration
--       form and the judge/admin dropdowns all need them)
--   curl -X POST "$URL/rest/v1/categories" -H "apikey: <anon>" -d '{"school_id":"<id>","name":"Hack"}'
--     → 401/403 row-level security (anon must NOT be able to write)
-- ════════════════════════════════════════════════════════════════════════════


-- ── PART 1: the categories table ────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.categories (
  id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id  UUID        NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  name       TEXT        NOT NULL,
  -- Short code used to build registration numbers, e.g. "LS" in "JHS-LS-001".
  code       TEXT        NOT NULL DEFAULT '',
  ord        INT         NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (school_id, name)
);

CREATE INDEX IF NOT EXISTS categories_school_idx ON public.categories (school_id, ord);

ALTER TABLE public.categories ENABLE ROW LEVEL SECURITY;

-- anon SELECT is required: the public student-registration form, the judge views
-- and the public project list all render the category list without a session.
-- Categories hold no personal data (CLAUDE.md rule 45), so this is safe.
DROP POLICY IF EXISTS "categories_select" ON public.categories;
DROP POLICY IF EXISTS "categories_insert" ON public.categories;
DROP POLICY IF EXISTS "categories_update" ON public.categories;
DROP POLICY IF EXISTS "categories_delete" ON public.categories;
CREATE POLICY "categories_select" ON public.categories FOR SELECT USING (true);
CREATE POLICY "categories_insert" ON public.categories FOR INSERT WITH CHECK (public.is_school_admin(school_id));
CREATE POLICY "categories_update" ON public.categories FOR UPDATE USING (public.is_school_admin(school_id));
CREATE POLICY "categories_delete" ON public.categories FOR DELETE USING (public.is_school_admin(school_id));

-- Realtime so a change on the admin's laptop reaches the tablets immediately.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'categories'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.categories;
  END IF;
END $$;


-- ── PART 2: departments.code ────────────────────────────────────────────────
-- Reserved for registration numbers ("JHS-LS-001"). Nothing reads it yet.
ALTER TABLE public.departments ADD COLUMN IF NOT EXISTS code TEXT NOT NULL DEFAULT '';


-- ── PART 3: seed the six current categories for every existing school ───────
-- These are exactly the strings the app shipped as REG_CATEGORIES, so every
-- existing project's `cat` value keeps matching a live category and nothing in
-- the UI changes until an admin edits the list.
INSERT INTO public.categories (school_id, name, code, ord)
SELECT s.id, d.name, d.code, d.ord
FROM public.schools s
CROSS JOIN (VALUES
  ('Life Science',                       'LS',  0),
  ('Earth & Environmental Science',      'EES', 1),
  ('Chemistry & Material Science',       'CMS', 2),
  ('Physics, Math & Astronomy',          'PMA', 3),
  ('Engineering, Robotics & Technology', 'ERT', 4),
  ('Energy, Sustainability & Design',    'ESD', 5)
) AS d(name, code, ord)
-- Only seed schools with no categories at all, so a re-run cannot resurrect a
-- category the admin deliberately deleted.
WHERE NOT EXISTS (SELECT 1 FROM public.categories c WHERE c.school_id = s.id)
ON CONFLICT (school_id, name) DO NOTHING;


-- ── PART 4: backfill department codes for the three seeded defaults ─────────
-- Matches the old DIV_CODES map. Custom departments keep '' until an admin sets
-- one; the app falls back to the first letters of the name.
UPDATE public.departments
SET code = CASE name
             WHEN 'Elementary'    THEN 'Elem'
             WHEN 'Middle School' THEN 'JHS'
             WHEN 'High School'   THEN 'SHS'
             ELSE code
           END
WHERE code = '';
