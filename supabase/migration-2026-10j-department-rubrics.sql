-- ════════════════════════════════════════════════════════════════════════════
-- Migration 2026-10j — each department picks its own rubric
-- ════════════════════════════════════════════════════════════════════════════
-- WHY
--   A fair judges grade bands differently: e.g. PreK/K-2 comment-only, 3-5 on the
--   42-point sheet, 6-8 and up on the 100-point Cibecue sheet. Until now a school had
--   ONE active rubric, used for every department.
--
-- WHAT
--   • departments.rubric_id — the department's rubric. NULL = the school's default
--     rubric (rubrics.is_active = true). Comment-only stays departments.scoring_mode.
--   • at most ONE default rubric per school (unique partial index; duplicates from the
--     past are resolved by keeping the newest, which is what the app showed).
--   • guard trigger on departments: the rubric / comment-only setting of a department
--     that already has scores cannot change (its scores would silently count against a
--     different rubric); a department can only use its own school's rubrics.
--   • guard trigger on rubrics: the default rubric and any rubric a department uses
--     cannot be deleted.
--   • set_default_rubric() — admin: switch the default in one step; refused if a
--     department that follows the default already has scores.
--
-- COUPLING: not coupled. Old app with this SQL: departments keep rubric_id NULL and use
--   the default, exactly as before. New app without it: the department rubric selector
--   says this migration is missing; scoring keeps using the default rubric.
--
-- RE-RUNNABLE.
-- ════════════════════════════════════════════════════════════════════════════


-- ── PART 1: a rubric per department ─────────────────────────────────────────
ALTER TABLE public.departments
  ADD COLUMN IF NOT EXISTS rubric_id UUID REFERENCES public.rubrics(id) ON DELETE SET NULL;


-- ── PART 2: exactly one default rubric per school ───────────────────────────
-- Several active rows made the old app's .single() fail and fall back to the built-in
-- rubric; keep the newest active one (the most recent save).
UPDATE public.rubrics r SET is_active = false
 WHERE r.is_active
   AND EXISTS (SELECT 1 FROM public.rubrics x
                WHERE x.school_id = r.school_id AND x.is_active AND x.id <> r.id
                  AND (x.created_at, x.id::text) > (r.created_at, r.id::text));
-- A school with rubrics but no default: make its newest rubric the default.
UPDATE public.rubrics r SET is_active = true
 WHERE NOT EXISTS (SELECT 1 FROM public.rubrics x WHERE x.school_id = r.school_id AND x.is_active)
   AND r.id = (SELECT x.id FROM public.rubrics x WHERE x.school_id = r.school_id
                ORDER BY x.created_at DESC, x.id DESC LIMIT 1);
CREATE UNIQUE INDEX IF NOT EXISTS rubrics_one_default_per_school
  ON public.rubrics (school_id) WHERE is_active;


-- ── PART 3: departments — no rubric change once scored; own school's rubrics only ──
CREATE OR REPLACE FUNCTION public.departments_guard_judging()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
DECLARE
  v_default uuid;
BEGIN
  IF NEW.rubric_id IS NOT NULL AND NOT EXISTS (
       SELECT 1 FROM rubrics WHERE id = NEW.rubric_id AND school_id = NEW.school_id) THEN
    RAISE EXCEPTION 'That rubric does not belong to this school.' USING ERRCODE = 'P0001';
  END IF;
  IF TG_OP = 'UPDATE' THEN
    SELECT id INTO v_default FROM rubrics WHERE school_id = OLD.school_id AND is_active LIMIT 1;
    -- Compare the EFFECTIVE rubric: NULL means "the default".
    IF (COALESCE(NEW.rubric_id, v_default) IS DISTINCT FROM COALESCE(OLD.rubric_id, v_default)
        OR NEW.scoring_mode IS DISTINCT FROM OLD.scoring_mode)
       AND EXISTS (SELECT 1 FROM scores s JOIN projects p ON p.id = s.project_id
                    WHERE p.department_id = OLD.id AND s.school_id = OLD.school_id) THEN
      RAISE EXCEPTION '% already has scores. Changing how it is judged now would make those scores count against a different rubric. Remove those scores first (Reset All Data, or remove the judges who gave them).',
        OLD.name USING ERRCODE = 'P0001';
    END IF;
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS departments_guard_judging ON public.departments;
CREATE TRIGGER departments_guard_judging
  BEFORE INSERT OR UPDATE ON public.departments
  FOR EACH ROW EXECUTE FUNCTION public.departments_guard_judging();


-- ── PART 4: rubrics — the default and any rubric in use cannot be deleted ────
CREATE OR REPLACE FUNCTION public.rubrics_guard_delete()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
DECLARE
  v_dept text;
BEGIN
  -- Deleting the whole school cascades here after the school row is gone — allow it.
  IF NOT EXISTS (SELECT 1 FROM schools WHERE id = OLD.school_id) THEN
    RETURN OLD;
  END IF;
  IF OLD.is_active THEN
    RAISE EXCEPTION '"%" is the default rubric. Make another rubric the default first.', OLD.name
      USING ERRCODE = 'P0001';
  END IF;
  SELECT name INTO v_dept FROM departments WHERE rubric_id = OLD.id ORDER BY ord LIMIT 1;
  IF v_dept IS NOT NULL THEN
    RAISE EXCEPTION '"%" is used by %. Give that department another rubric first.', OLD.name, v_dept
      USING ERRCODE = 'P0001';
  END IF;
  RETURN OLD;
END $$;

DROP TRIGGER IF EXISTS rubrics_guard_delete ON public.rubrics;
CREATE TRIGGER rubrics_guard_delete
  BEFORE DELETE ON public.rubrics
  FOR EACH ROW EXECUTE FUNCTION public.rubrics_guard_delete();


-- ── PART 5: set_default_rubric() ────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.set_default_rubric(p_school_id uuid, p_rubric_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_old  uuid;
  v_dept text;
BEGIN
  IF NOT is_school_admin(p_school_id) THEN
    RAISE EXCEPTION 'Not authorised' USING ERRCODE = 'P0001';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM rubrics WHERE id = p_rubric_id AND school_id = p_school_id) THEN
    RAISE EXCEPTION 'That rubric does not belong to this school.' USING ERRCODE = 'P0001';
  END IF;
  SELECT id INTO v_old FROM rubrics WHERE school_id = p_school_id AND is_active LIMIT 1;
  IF v_old = p_rubric_id THEN RETURN; END IF;
  -- Departments that follow the default would switch rubric under their scores.
  SELECT d.name INTO v_dept FROM departments d
   WHERE d.school_id = p_school_id AND d.rubric_id IS NULL AND d.scoring_mode = 'scored'
     AND EXISTS (SELECT 1 FROM scores s JOIN projects p ON p.id = s.project_id
                  WHERE p.department_id = d.id AND s.school_id = p_school_id)
   ORDER BY d.ord LIMIT 1;
  IF v_dept IS NOT NULL THEN
    RAISE EXCEPTION '% follows the default rubric and already has scores. Pick its rubric explicitly in Setup first, then change the default.',
      v_dept USING ERRCODE = 'P0001';
  END IF;
  UPDATE rubrics SET is_active = false WHERE school_id = p_school_id AND is_active;
  UPDATE rubrics SET is_active = true  WHERE school_id = p_school_id AND id = p_rubric_id;
END $$;
GRANT EXECUTE ON FUNCTION public.set_default_rubric(uuid, uuid) TO authenticated;
