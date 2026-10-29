-- ============================================================
-- ResourceBridge — Hardened PostgreSQL & Supabase Schema
-- Includes Least-Privilege RLS, Strict State Transitions,
-- Audit Immutability, and Exclusion Constraints for Double-Booking Prevention.
-- ============================================================

-- 1. EXTENSIONS
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "btree_gist";

-- 2. PLATFORM POLICY TABLE
CREATE TABLE IF NOT EXISTS public.platform_policy (
  id INT PRIMARY KEY DEFAULT 1,
  max_active_pending_requests_per_student INT NOT NULL DEFAULT 4,
  default_weekly_hours_cap_per_student INT NOT NULL DEFAULT 8,
  default_cooldown_hours_between_bookings INT NOT NULL DEFAULT 6,
  require_before_and_after_condition_reports BOOLEAN NOT NULL DEFAULT true,
  enforce_human_review_for_all_incidents BOOLEAN NOT NULL DEFAULT true,
  allow_waitlist_on_conflict BOOLEAN NOT NULL DEFAULT true,
  institution_name TEXT NOT NULL DEFAULT 'Greenwood College & Senior School (Demo Campus)',
  environment_mode TEXT NOT NULL DEFAULT 'Supabase PostgreSQL Production',
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT single_policy_row CHECK (id = 1)
);

INSERT INTO public.platform_policy (id, institution_name)
VALUES (1, 'Greenwood College & Senior School (Demo Campus)')
ON CONFLICT (id) DO NOTHING;

-- 3. USERS TABLE
CREATE TABLE IF NOT EXISTS public.users (
  id TEXT PRIMARY KEY,
  auth_user_id UUID UNIQUE REFERENCES auth.users(id) ON DELETE SET NULL,
  name TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE,
  department TEXT NOT NULL,
  academic_standing TEXT NOT NULL DEFAULT 'Student in Good Standing',
  role TEXT NOT NULL CHECK (role IN ('student', 'manager', 'admin')),
  completed_safety_modules JSONB NOT NULL DEFAULT '[]'::jsonb,
  active_restrictions TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Safe directory view for staff and supervisor lookup without exposing private emails
CREATE OR REPLACE VIEW public.directory_profiles
WITH (security_invoker = true) AS
SELECT 
  id, 
  name, 
  department, 
  role
FROM public.users;

-- 4. HARDENED SECURITY FUNCTIONS (SEARCH_PATH ENFORCED)
CREATE OR REPLACE FUNCTION public.get_auth_role()
RETURNS TEXT
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
  SELECT role FROM public.users 
  WHERE auth_user_id = auth.uid() 
    AND auth.uid() IS NOT NULL 
  LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.users 
    WHERE auth_user_id = auth.uid() 
      AND role = 'admin' 
      AND auth.uid() IS NOT NULL
  );
$$;

CREATE OR REPLACE FUNCTION public.is_staff()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.users 
    WHERE auth_user_id = auth.uid() 
      AND role IN ('manager', 'admin') 
      AND auth.uid() IS NOT NULL
  );
$$;

REVOKE ALL ON FUNCTION public.get_auth_role() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_auth_role() TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.is_admin() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_admin() TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.is_staff() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_staff() TO authenticated, service_role;

-- 5. USER UPDATE VALIDATION TRIGGER (BLOCKS PRIVILEGE ESCALATION)
CREATE OR REPLACE FUNCTION public.validate_user_update()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
BEGIN
  -- If caller is authenticated as a non-administrator, forbid modifying protected fields
  IF auth.uid() IS NOT NULL AND NOT public.is_admin() THEN
    IF NEW.role IS DISTINCT FROM OLD.role THEN
      RAISE EXCEPTION 'Access Denied: You cannot modify user roles.';
    END IF;
    IF NEW.active_restrictions IS DISTINCT FROM OLD.active_restrictions THEN
      RAISE EXCEPTION 'Access Denied: You cannot modify account restrictions.';
    END IF;
    IF NEW.email IS DISTINCT FROM OLD.email THEN
      RAISE EXCEPTION 'Access Denied: Email address changes require administrative verification.';
    END IF;
    IF NEW.auth_user_id IS DISTINCT FROM OLD.auth_user_id THEN
      RAISE EXCEPTION 'Access Denied: Cannot re-bind auth user linkage.';
    END IF;
    IF NEW.id IS DISTINCT FROM OLD.id THEN
      RAISE EXCEPTION 'Access Denied: User identifier is immutable.';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_validate_user_update ON public.users;
CREATE TRIGGER trg_validate_user_update
  BEFORE UPDATE ON public.users
  FOR EACH ROW
  EXECUTE FUNCTION public.validate_user_update();

-- 6. RESOURCES TABLE
CREATE TABLE IF NOT EXISTS public.resources (
  id TEXT PRIMARY KEY,
  code TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  category TEXT NOT NULL CHECK (category IN (
    'Electronics & Coding Kits',
    'Computers & Laptops',
    '3D Printing & Making',
    'Science & Physics Labs',
    'Project Rooms & Spaces',
    'Robotics & Mechatronics',
    'Electronics & RF Test',
    'Additive Manufacturing',
    'High-Performance Computing',
    'Supervised Laboratories'
  )),
  resource_type TEXT NOT NULL DEFAULT 'Equipment',
  location TEXT NOT NULL,
  building TEXT NOT NULL,
  description TEXT NOT NULL,
  image_url TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'Available' CHECK (status IN ('Available', 'In Use', 'Maintenance', 'Restricted')),
  condition_summary TEXT NOT NULL,
  operating_hours TEXT NOT NULL DEFAULT '08:00 – 18:00 (Mon–Fri)',
  available_time_slots JSONB NOT NULL DEFAULT '["08:00", "10:00", "12:00", "14:00", "16:00"]'::jsonb,
  min_duration_hours INT NOT NULL DEFAULT 1 CHECK (min_duration_hours >= 1),
  max_duration_hours INT NOT NULL DEFAULT 4 CHECK (max_duration_hours >= min_duration_hours),
  weekly_limit_hours_per_student INT NOT NULL DEFAULT 6 CHECK (weekly_limit_hours_per_student >= 1),
  cooldown_hours INT NOT NULL DEFAULT 6,
  eligibility_requirements JSONB NOT NULL DEFAULT '[]'::jsonb,
  required_safety_module TEXT NOT NULL,
  safety_rules JSONB NOT NULL DEFAULT '[]'::jsonb,
  manager_id TEXT NOT NULL,
  manager_name TEXT NOT NULL,
  is_demo_listing BOOLEAN NOT NULL DEFAULT false,
  specifications JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 7. BOOKINGS TABLE (WITH CONCURRENCY EXCLUSION CONSTRAINT)
CREATE TABLE IF NOT EXISTS public.bookings (
  id TEXT PRIMARY KEY,
  resource_id TEXT NOT NULL REFERENCES public.resources(id) ON DELETE CASCADE,
  resource_name TEXT NOT NULL,
  resource_code TEXT NOT NULL,
  resource_location TEXT NOT NULL,
  student_id TEXT NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  student_name TEXT NOT NULL,
  student_department TEXT NOT NULL,
  date TEXT NOT NULL, -- YYYY-MM-DD
  start_time_text TEXT NOT NULL, -- HH:00
  end_time_text TEXT NOT NULL, -- HH:00
  start_timestamp TIMESTAMPTZ NOT NULL,
  end_timestamp TIMESTAMPTZ NOT NULL,
  booking_period TSTZRANGE GENERATED ALWAYS AS (tstzrange(start_timestamp, end_timestamp, '[)')) STORED,
  duration_hours INT NOT NULL CHECK (duration_hours > 0),
  purpose TEXT NOT NULL,
  course_or_project_code TEXT NOT NULL,
  supervisor_name TEXT NOT NULL,
  agreed_to_safety_rules BOOLEAN NOT NULL DEFAULT true,
  self_declared_eligible BOOLEAN NOT NULL DEFAULT true,
  status TEXT NOT NULL DEFAULT 'Pending' CHECK (status IN (
    'Pending', 'Approved', 'Rejected', 'Waitlisted', 'CheckedIn', 'Completed', 'Cancelled'
  )),
  manager_decision_note TEXT,
  decided_by_name TEXT,
  decided_at TIMESTAMPTZ,
  check_in_at TIMESTAMPTZ,
  check_out_at TIMESTAMPTZ,
  before_condition_report JSONB,
  after_condition_report JSONB,
  flagged_missing_report BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT valid_booking_time_range CHECK (end_timestamp > start_timestamp),
  CONSTRAINT prevent_conflicting_approved_bookings
    EXCLUDE USING gist (
      resource_id WITH =,
      booking_period WITH &&
    )
    WHERE (status IN ('Approved', 'CheckedIn'))
);

-- Booking state transition validation trigger
CREATE OR REPLACE FUNCTION public.validate_booking_status_transition()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
BEGIN
  IF OLD.status = NEW.status THEN
    RETURN NEW;
  END IF;

  IF OLD.status = 'Pending' AND NEW.status IN ('Approved', 'Rejected', 'Waitlisted', 'Cancelled') THEN
    RETURN NEW;
  ELSIF OLD.status = 'Approved' AND NEW.status IN ('CheckedIn', 'Cancelled') THEN
    RETURN NEW;
  ELSIF OLD.status = 'Waitlisted' AND NEW.status IN ('Approved', 'Cancelled') THEN
    RETURN NEW;
  ELSIF OLD.status = 'CheckedIn' AND NEW.status = 'Completed' THEN
    RETURN NEW;
  ELSE
    RAISE EXCEPTION 'Invalid booking status transition from "%" to "%"', OLD.status, NEW.status;
  END IF;
END;
$$;

DROP TRIGGER IF EXISTS trg_validate_booking_status ON public.bookings;
CREATE TRIGGER trg_validate_booking_status
  BEFORE UPDATE OF status ON public.bookings
  FOR EACH ROW
  EXECUTE FUNCTION public.validate_booking_status_transition();

-- 8. INCIDENTS TABLE
CREATE TABLE IF NOT EXISTS public.incidents (
  id TEXT PRIMARY KEY,
  resource_id TEXT NOT NULL REFERENCES public.resources(id) ON DELETE CASCADE,
  resource_name TEXT NOT NULL,
  resource_code TEXT NOT NULL,
  booking_id TEXT REFERENCES public.bookings(id) ON DELETE SET NULL,
  reported_by_user_id TEXT NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  reported_by_name TEXT NOT NULL,
  reported_by_role TEXT NOT NULL,
  category TEXT NOT NULL CHECK (category IN (
    'Broken or not working', 'Returned late', 'Missing parts or cables', 'Safety concern', 'Other problem'
  )),
  severity TEXT NOT NULL CHECK (severity IN ('Low', 'Moderate', 'High', 'Critical')),
  description TEXT NOT NULL,
  supporting_image_ref TEXT,
  status TEXT NOT NULL DEFAULT 'Reported' CHECK (status IN ('Reported', 'Under Review', 'Resolved', 'Closed')),
  manager_review_notes TEXT,
  reviewed_by_name TEXT,
  human_review_required BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 9. AUDIT EVENTS TABLE (IMMUTABLE LEDGER)
CREATE TABLE IF NOT EXISTS public.audit_events (
  id TEXT PRIMARY KEY,
  timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  actor_id TEXT NOT NULL,
  actor_name TEXT NOT NULL,
  actor_role TEXT NOT NULL,
  action_type TEXT NOT NULL,
  target_type TEXT NOT NULL,
  target_id TEXT NOT NULL,
  summary TEXT NOT NULL,
  metadata TEXT
);

CREATE OR REPLACE FUNCTION public.prevent_audit_modification()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
BEGIN
  RAISE EXCEPTION 'Audit ledger is strictly append-only. Modification and deletion are prohibited.';
END;
$$;

DROP TRIGGER IF EXISTS trg_prevent_audit_mod ON public.audit_events;
CREATE TRIGGER trg_prevent_audit_mod
  BEFORE UPDATE OR DELETE ON public.audit_events
  FOR EACH ROW
  EXECUTE FUNCTION public.prevent_audit_modification();

-- 10. INDEXES
CREATE INDEX IF NOT EXISTS idx_users_auth_id ON public.users(auth_user_id);
CREATE INDEX IF NOT EXISTS idx_bookings_resource_date ON public.bookings(resource_id, date);
CREATE INDEX IF NOT EXISTS idx_bookings_student ON public.bookings(student_id);
CREATE INDEX IF NOT EXISTS idx_bookings_status ON public.bookings(status);
CREATE INDEX IF NOT EXISTS idx_incidents_status ON public.incidents(status);
CREATE INDEX IF NOT EXISTS idx_audit_timestamp ON public.audit_events(timestamp DESC);

-- 11. LEAST-PRIVILEGE SCHEMA & TABLE GRANTS
REVOKE ALL ON ALL TABLES IN SCHEMA public FROM PUBLIC;
REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM PUBLIC;
REVOKE ALL ON ALL ROUTINES IN SCHEMA public FROM PUBLIC;

GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;

-- anon grants (Public directory and policy lookup only)
GRANT SELECT ON TABLE public.platform_policy TO anon;
GRANT SELECT ON TABLE public.resources TO anon;
GRANT SELECT ON TABLE public.directory_profiles TO anon;

-- authenticated grants (Scoped permissions)
GRANT SELECT ON TABLE public.platform_policy TO authenticated;
GRANT UPDATE ON TABLE public.platform_policy TO authenticated;

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.resources TO authenticated;

GRANT SELECT, UPDATE ON TABLE public.users TO authenticated;
GRANT SELECT ON TABLE public.directory_profiles TO authenticated;

GRANT SELECT, INSERT, UPDATE ON TABLE public.bookings TO authenticated;
GRANT SELECT, INSERT, UPDATE ON TABLE public.incidents TO authenticated;

GRANT SELECT ON TABLE public.audit_events TO authenticated;

-- service_role grants (Trusted backend / seeder operations)
GRANT ALL ON ALL TABLES IN SCHEMA public TO service_role;
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO service_role;
GRANT ALL ON ALL ROUTINES IN SCHEMA public TO service_role;

-- 12. ROW LEVEL SECURITY (RLS) POLICIES
ALTER TABLE public.platform_policy ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.resources ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bookings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.incidents ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_events ENABLE ROW LEVEL SECURITY;

-- Platform Policy
DROP POLICY IF EXISTS "policy_read_all" ON public.platform_policy;
CREATE POLICY "policy_read_all" ON public.platform_policy 
  FOR SELECT USING (true);

DROP POLICY IF EXISTS "policy_admin_update" ON public.platform_policy;
CREATE POLICY "policy_admin_update" ON public.platform_policy 
  FOR UPDATE USING (public.is_admin());

-- Users (Students only see own profile; staff see all profiles)
DROP POLICY IF EXISTS "users_read_scope" ON public.users;
CREATE POLICY "users_read_scope" ON public.users 
  FOR SELECT USING (
    auth_user_id = auth.uid() 
    OR public.is_staff()
  );

DROP POLICY IF EXISTS "users_self_update" ON public.users;
CREATE POLICY "users_self_update" ON public.users 
  FOR UPDATE USING (
    auth_user_id = auth.uid() 
    OR public.is_admin()
  );

-- Resources
DROP POLICY IF EXISTS "resources_read_all" ON public.resources;
CREATE POLICY "resources_read_all" ON public.resources 
  FOR SELECT USING (true);

DROP POLICY IF EXISTS "resources_staff_manage" ON public.resources;
CREATE POLICY "resources_staff_manage" ON public.resources 
  FOR ALL USING (public.is_staff());

-- Bookings
DROP POLICY IF EXISTS "bookings_select_scope" ON public.bookings;
CREATE POLICY "bookings_select_scope" ON public.bookings 
  FOR SELECT USING (
    student_id = (SELECT id FROM public.users WHERE auth_user_id = auth.uid())
    OR public.is_staff()
  );

DROP POLICY IF EXISTS "bookings_insert_scope" ON public.bookings;
CREATE POLICY "bookings_insert_scope" ON public.bookings 
  FOR INSERT WITH CHECK (
    (
      student_id = (SELECT id FROM public.users WHERE auth_user_id = auth.uid())
      AND status = 'Pending'
    )
    OR public.is_staff()
  );

DROP POLICY IF EXISTS "bookings_update_scope" ON public.bookings;
CREATE POLICY "bookings_update_scope" ON public.bookings 
  FOR UPDATE USING (
    student_id = (SELECT id FROM public.users WHERE auth_user_id = auth.uid())
    OR public.is_staff()
  );

-- Incidents
DROP POLICY IF EXISTS "incidents_select_scope" ON public.incidents;
CREATE POLICY "incidents_select_scope" ON public.incidents 
  FOR SELECT USING (
    reported_by_user_id = (SELECT id FROM public.users WHERE auth_user_id = auth.uid())
    OR public.is_staff()
  );

DROP POLICY IF EXISTS "incidents_insert_scope" ON public.incidents;
CREATE POLICY "incidents_insert_scope" ON public.incidents 
  FOR INSERT WITH CHECK (
    reported_by_user_id = (SELECT id FROM public.users WHERE auth_user_id = auth.uid())
    OR public.is_staff()
  );

DROP POLICY IF EXISTS "incidents_staff_update" ON public.incidents;
CREATE POLICY "incidents_staff_update" ON public.incidents 
  FOR UPDATE USING (public.is_staff());

-- Audit Events (Strict Read-Only for Staff; No Client Direct Insert)
DROP POLICY IF EXISTS "audit_staff_read" ON public.audit_events;
CREATE POLICY "audit_staff_read" ON public.audit_events 
  FOR SELECT USING (public.is_staff());
