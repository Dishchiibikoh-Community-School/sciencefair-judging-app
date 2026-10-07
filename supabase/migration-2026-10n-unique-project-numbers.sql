-- ============================================================================
-- migration-2026-10n-unique-project-numbers.sql
-- A project number is unique within a school. Additive and re-runnable; it changes no
-- table data. Order does not matter relative to the other 2026-10 migrations.
--
-- Why: project numbers are picked in the admin's BROWSER (nextProjectNum() = highest number
-- in that browser's list + 1). Two admins adding a project at the same moment both pick the
-- same number, and nothing in the database stopped it — two projects shared one number and
-- one project code (2026-10-06 review). With this index the second insert is REFUSED, and the
-- app (createProject) re-reads the numbers from the server and retries once with a free one.
--
-- The comparison is on the stored text: "7" and "007" are different numbers here (the app
-- always writes three digits; a hand-typed "7" shows as a different project code anyway).
--
-- NOT coupled to the app build. Old app + this SQL: the clash is refused and the admin sees
-- the database error instead of a silent duplicate. New app without this SQL: behaves as
-- before (no clash is ever reported, the retry never runs).
-- ============================================================================

-- Creating the index would FAIL on a database that already holds a duplicate, and abort the
-- whole migration — so check first and warn instead. Renumber the duplicates (Projects tab →
-- Edit), then re-run this file. Query to find them:
--   SELECT school_id, num, count(*) FROM projects GROUP BY 1, 2 HAVING count(*) > 1;
DO $do$
DECLARE v_dupes int;
BEGIN
  SELECT count(*) INTO v_dupes FROM (
    SELECT school_id, num FROM public.projects
     GROUP BY 1, 2 HAVING count(*) > 1) d;
  IF v_dupes > 0 THEN
    RAISE WARNING 'projects already holds % duplicated project number(s) — unique index NOT created. Renumber them, then re-run this migration.', v_dupes;
  ELSE
    CREATE UNIQUE INDEX IF NOT EXISTS projects_school_num_uniq
      ON public.projects (school_id, num);
  END IF;
END $do$;
