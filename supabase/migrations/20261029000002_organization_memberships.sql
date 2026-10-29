-- ============================================================
-- ResourceBridge — Migration 000002: Hardened Organisation Multi-Tenancy,
-- Access Control, Audit Protection, and Status Workflow Reconciliation
-- ============================================================

-- 1. ORGANIZATIONS TABLE
CREATE TABLE IF NOT EXISTS public.organizations (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  slug TEXT NOT NULL UNIQUE,
  description TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Seed primary campus organization (Idempotent)
INSERT INTO public.organizations (id, name, slug, description)
VALUES (
  'org-greenwood-1',
  'Greenwood College & Senior School',
  'greenwood-college',
  'Unified campus sharing facility for STEM, robotics, and computing'
) ON CONFLICT (id) DO NOTHING;

-- 2. ENHANCE USERS TABLE (FACULTY ROLE, STATUS, EMAIL VERIFICATION, ORG LINK)
ALTER TABLE public.users 
  ADD COLUMN IF NOT EXISTS organization_id TEXT REFERENCES public.organizations(id) DEFAULT 'org-greenwood-1',
  ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive', 'invited')),
  ADD COLUMN IF NOT EXISTS email_verified BOOLEAN NOT NULL DEFAULT true;

-- Update role constraint to include 'faculty' alongside 'student', 'manager', 'admin'
ALTER TABLE public.users DROP CONSTRAINT IF EXISTS users_role_check;
ALTER TABLE public.users ADD CONSTRAINT users_role_check CHECK (role IN ('student', 'faculty', 'manager', 'admin'));

-- Backfill pre-existing user records and enforce NOT NULL on organization_id
UPDATE public.users 
SET 
  organization_id = 'org-greenwood-1',
  status = 'active',
  email_verified = true
WHERE organization_id IS NULL;

ALTER TABLE public.users ALTER COLUMN organization_id SET NOT NULL;

-- 3. SCOPE CORE ENTITIES TO ORGANISATIONS FOR STRICT TENANT ISOLATION
ALTER TABLE public.resources 
  ADD COLUMN IF NOT EXISTS organization_id TEXT REFERENCES public.organizations(id) DEFAULT 'org-greenwood-1';

UPDATE public.resources 
SET organization_id = 'org-greenwood-1' 
WHERE organization_id IS NULL;

ALTER TABLE public.resources ALTER COLUMN organization_id SET NOT NULL;

ALTER TABLE public.bookings 
  ADD COLUMN IF NOT EXISTS organization_id TEXT REFERENCES public.organizations(id) DEFAULT 'org-greenwood-1';

UPDATE public.bookings 
SET organization_id = 'org-greenwood-1' 
WHERE organization_id IS NULL;

ALTER TABLE public.bookings ALTER COLUMN organization_id SET NOT NULL;

ALTER TABLE public.incidents 
  ADD COLUMN IF NOT EXISTS organization_id TEXT REFERENCES public.organizations(id) DEFAULT 'org-greenwood-1';

UPDATE public.incidents 
SET organization_id = 'org-greenwood-1' 
WHERE organization_id IS NULL;

ALTER TABLE public.incidents ALTER COLUMN organization_id SET NOT NULL;

ALTER TABLE public.audit_events 
  ADD COLUMN IF NOT EXISTS organization_id TEXT REFERENCES public.organizations(id) DEFAULT 'org-greenwood-1';

UPDATE public.audit_events 
SET organization_id = 'org-greenwood-1' 
WHERE organization_id IS NULL;

ALTER TABLE public.audit_events ALTER COLUMN organization_id SET NOT NULL;

-- 4. ORGANISATION INVITATIONS TABLE (ADMIN-CONTROLLED INVITATION WORKFLOW)
CREATE TABLE IF NOT EXISTS public.organization_invitations (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('student', 'faculty', 'manager', 'admin')),
  name TEXT NOT NULL,
  department TEXT NOT NULL,
  invited_by_user_id TEXT REFERENCES public.users(id) ON DELETE SET NULL,
  token_hash TEXT,
  expires_at TIMESTAMPTZ NOT NULL DEFAULT (NOW() + INTERVAL '7 days'),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'expired', 'revoked')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 5. HARDENED HELPER FUNCTIONS (ACTIVE STATUS & SEARCH_PATH ENFORCED)
CREATE OR REPLACE FUNCTION public.get_auth_org_id()
RETURNS TEXT
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
  SELECT organization_id FROM public.users 
  WHERE auth_user_id = auth.uid() 
    AND status = 'active'
    AND auth.uid() IS NOT NULL 
  LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION public.get_auth_role()
RETURNS TEXT
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
  SELECT role FROM public.users 
  WHERE auth_user_id = auth.uid() 
    AND status = 'active'
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
      AND status = 'active'
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
      AND status = 'active'
      AND auth.uid() IS NOT NULL
  );
$$;

REVOKE ALL ON FUNCTION public.get_auth_org_id() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_auth_org_id() TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.get_auth_role() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_auth_role() TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.is_admin() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_admin() TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.is_staff() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_staff() TO authenticated, service_role;

-- 6. PROFILE MODIFICATION RESTRICTION TRIGGER
CREATE OR REPLACE FUNCTION public.validate_user_update()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
BEGIN
  -- Authenticated non-administrators are prohibited from modifying protected fields
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
    IF NEW.department IS DISTINCT FROM OLD.department THEN
      RAISE EXCEPTION 'Access Denied: Department assignment can only be updated by administrators.';
    END IF;
    IF NEW.status IS DISTINCT FROM OLD.status THEN
      RAISE EXCEPTION 'Access Denied: Account status cannot be modified by user.';
    END IF;
    IF NEW.email_verified IS DISTINCT FROM OLD.email_verified THEN
      RAISE EXCEPTION 'Access Denied: Email verification status is read-only.';
    END IF;
    IF NEW.completed_safety_modules IS DISTINCT FROM OLD.completed_safety_modules THEN
      RAISE EXCEPTION 'Access Denied: Safety module completion records require institutional verification.';
    END IF;
    IF NEW.organization_id IS DISTINCT FROM OLD.organization_id THEN
      RAISE EXCEPTION 'Access Denied: Organisation membership cannot be altered.';
    END IF;
    IF NEW.academic_standing IS DISTINCT FROM OLD.academic_standing THEN
      RAISE EXCEPTION 'Access Denied: Academic standing is managed by administrators.';
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

-- 7. BOOKING STATUS TRANSITION AND UPDATE RESTRICTION TRIGGERS
-- A. State transition validation supporting all legitimate workflows (including waitlist rejection)
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
  ELSIF OLD.status = 'Waitlisted' AND NEW.status IN ('Approved', 'Rejected', 'Cancelled') THEN
    RETURN NEW;
  ELSIF OLD.status = 'Approved' AND NEW.status IN ('CheckedIn', 'Cancelled') THEN
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

-- B. Field protection trigger: prevents students from tampering with dates, specs, or decisions
CREATE OR REPLACE FUNCTION public.validate_booking_update()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
BEGIN
  -- Service role / trusted server backend bypasses check
  IF auth.uid() IS NULL THEN
    RETURN NEW;
  END IF;

  -- Non-staff callers (students/faculty) cannot modify protected fields
  IF NOT public.is_staff() THEN
    IF NEW.resource_id IS DISTINCT FROM OLD.resource_id OR
       NEW.resource_name IS DISTINCT FROM OLD.resource_name OR
       NEW.resource_code IS DISTINCT FROM OLD.resource_code OR
       NEW.resource_location IS DISTINCT FROM OLD.resource_location OR
       NEW.student_id IS DISTINCT FROM OLD.student_id OR
       NEW.student_name IS DISTINCT FROM OLD.student_name OR
       NEW.student_department IS DISTINCT FROM OLD.student_department OR
       NEW.date IS DISTINCT FROM OLD.date OR
       NEW.start_time_text IS DISTINCT FROM OLD.start_time_text OR
       NEW.end_time_text IS DISTINCT FROM OLD.end_time_text OR
       NEW.start_timestamp IS DISTINCT FROM OLD.start_timestamp OR
       NEW.end_timestamp IS DISTINCT FROM OLD.end_timestamp OR
       NEW.duration_hours IS DISTINCT FROM OLD.duration_hours OR
       NEW.purpose IS DISTINCT FROM OLD.purpose OR
       NEW.course_or_project_code IS DISTINCT FROM OLD.course_or_project_code OR
       NEW.supervisor_name IS DISTINCT FROM OLD.supervisor_name OR
       NEW.organization_id IS DISTINCT FROM OLD.organization_id OR
       NEW.manager_decision_note IS DISTINCT FROM OLD.manager_decision_note OR
       NEW.decided_by_name IS DISTINCT FROM OLD.decided_by_name OR
       NEW.decided_at IS DISTINCT FROM OLD.decided_at THEN
      RAISE EXCEPTION 'Access Denied: Students cannot modify booking specifications or administrative decision details.';
    END IF;

    -- If student updates status directly, only 'Cancelled' is allowed
    IF NEW.status IS DISTINCT FROM OLD.status THEN
      IF NEW.status != 'Cancelled' THEN
        RAISE EXCEPTION 'Access Denied: Students can only cancel their booking requests.';
      END IF;
      IF OLD.status NOT IN ('Pending', 'Approved', 'Waitlisted') THEN
        RAISE EXCEPTION 'Cannot cancel a booking that is currently "%".', OLD.status;
      END IF;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_validate_booking_update ON public.bookings;
CREATE TRIGGER trg_validate_booking_update
  BEFORE UPDATE ON public.bookings
  FOR EACH ROW
  EXECUTE FUNCTION public.validate_booking_update();

-- 8. AUDIT APPEND RESTRICTION TRIGGER
CREATE OR REPLACE FUNCTION public.validate_audit_append()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
BEGIN
  -- Direct authenticated client inserts are blocked; only server operations can append
  IF auth.uid() IS NOT NULL THEN
    RAISE EXCEPTION 'Access Denied: Audit events can only be recorded by trusted server operations.';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_validate_audit_append ON public.audit_events;
CREATE TRIGGER trg_validate_audit_append
  BEFORE INSERT ON public.audit_events
  FOR EACH ROW
  EXECUTE FUNCTION public.validate_audit_append();

-- 9. SAFE DIRECTORY VIEW (ORGANISATION SCOPED & SANITIZED FOR ANONYMOUS USERS)
DROP VIEW IF EXISTS public.directory_profiles;
CREATE OR REPLACE VIEW public.directory_profiles AS
SELECT 
  id, 
  name, 
  department, 
  role,
  organization_id
FROM public.users
WHERE status = 'active'
  AND (
    -- Authenticated members only see colleagues in their own organisation
    (auth.uid() IS NOT NULL AND organization_id = public.get_auth_org_id())
    -- Anonymous public visitors only see designated staff/faculty contact profiles, NEVER students
    OR (auth.uid() IS NULL AND role IN ('faculty', 'manager', 'admin'))
  );

-- 10. ROW LEVEL SECURITY (RLS) POLICIES
ALTER TABLE public.organizations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.organization_invitations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.resources ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bookings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.incidents ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_events ENABLE ROW LEVEL SECURITY;

-- Organizations
DROP POLICY IF EXISTS "organizations_select_own" ON public.organizations;
CREATE POLICY "organizations_select_own" ON public.organizations
  FOR SELECT
  TO authenticated
  USING (id = public.get_auth_org_id());

-- Invitations: Administrators only
DROP POLICY IF EXISTS "invitations_admin_all" ON public.organization_invitations;
CREATE POLICY "invitations_admin_all" ON public.organization_invitations
  FOR ALL
  TO authenticated
  USING (
    public.is_admin() AND 
    organization_id = public.get_auth_org_id()
  )
  WITH CHECK (
    public.is_admin() AND 
    organization_id = public.get_auth_org_id()
  );

-- Users
DROP POLICY IF EXISTS "users_read_scope" ON public.users;
CREATE POLICY "users_read_scope" ON public.users 
  FOR SELECT 
  TO authenticated
  USING (
    organization_id = public.get_auth_org_id()
    AND (
      auth_user_id = auth.uid() 
      OR public.is_staff()
      OR role IN ('manager', 'admin', 'faculty')
    )
  );

DROP POLICY IF EXISTS "users_self_update" ON public.users;
CREATE POLICY "users_self_update" ON public.users 
  FOR UPDATE 
  TO authenticated
  USING (
    auth_user_id = auth.uid() 
    OR public.is_admin()
  );

-- Resources
DROP POLICY IF EXISTS "resources_read_all" ON public.resources;
CREATE POLICY "resources_read_all" ON public.resources 
  FOR SELECT 
  TO anon, authenticated
  USING (true);

DROP POLICY IF EXISTS "resources_staff_manage" ON public.resources;
CREATE POLICY "resources_staff_manage" ON public.resources 
  FOR ALL 
  TO authenticated
  USING (
    public.is_staff() AND
    organization_id = public.get_auth_org_id()
  )
  WITH CHECK (
    public.is_staff() AND
    organization_id = public.get_auth_org_id()
  );

-- Bookings
DROP POLICY IF EXISTS "bookings_select_scope" ON public.bookings;
CREATE POLICY "bookings_select_scope" ON public.bookings 
  FOR SELECT 
  TO authenticated
  USING (
    organization_id = public.get_auth_org_id()
    AND (
      student_id = (SELECT id FROM public.users WHERE auth_user_id = auth.uid())
      OR public.is_staff()
    )
  );

DROP POLICY IF EXISTS "bookings_insert_scope" ON public.bookings;
CREATE POLICY "bookings_insert_scope" ON public.bookings 
  FOR INSERT 
  TO authenticated
  WITH CHECK (
    organization_id = public.get_auth_org_id()
    AND (
      (
        student_id = (SELECT id FROM public.users WHERE auth_user_id = auth.uid())
        AND status = 'Pending'
      )
      OR public.is_staff()
    )
  );

DROP POLICY IF EXISTS "bookings_update_scope" ON public.bookings;
CREATE POLICY "bookings_update_scope" ON public.bookings 
  FOR UPDATE 
  TO authenticated
  USING (
    organization_id = public.get_auth_org_id()
    AND (
      (student_id = (SELECT id FROM public.users WHERE auth_user_id = auth.uid()) AND status IN ('Pending', 'Approved', 'Waitlisted'))
      OR public.is_staff()
    )
  )
  WITH CHECK (
    organization_id = public.get_auth_org_id()
    AND (
      (student_id = (SELECT id FROM public.users WHERE auth_user_id = auth.uid()) AND status = 'Cancelled')
      OR public.is_staff()
    )
  );

-- Incidents
DROP POLICY IF EXISTS "incidents_select_scope" ON public.incidents;
CREATE POLICY "incidents_select_scope" ON public.incidents 
  FOR SELECT 
  TO authenticated
  USING (
    organization_id = public.get_auth_org_id()
    AND (
      reported_by_user_id = (SELECT id FROM public.users WHERE auth_user_id = auth.uid())
      OR public.is_staff()
    )
  );

DROP POLICY IF EXISTS "incidents_insert_scope" ON public.incidents;
CREATE POLICY "incidents_insert_scope" ON public.incidents 
  FOR INSERT 
  TO authenticated
  WITH CHECK (
    organization_id = public.get_auth_org_id()
    AND (
      reported_by_user_id = (SELECT id FROM public.users WHERE auth_user_id = auth.uid())
      OR public.is_staff()
    )
  );

DROP POLICY IF EXISTS "incidents_staff_update" ON public.incidents;
CREATE POLICY "incidents_staff_update" ON public.incidents 
  FOR UPDATE 
  TO authenticated
  USING (
    public.is_staff() AND
    organization_id = public.get_auth_org_id()
  );

-- Audit Events: Staff read-only within own organisation
DROP POLICY IF EXISTS "audit_staff_read" ON public.audit_events;
CREATE POLICY "audit_staff_read" ON public.audit_events 
  FOR SELECT 
  TO authenticated
  USING (
    public.is_staff() AND
    organization_id = public.get_auth_org_id()
  );

-- 11. SCHEMA & TABLE PRIVILEGES
REVOKE ALL ON ALL TABLES IN SCHEMA public FROM PUBLIC;
REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM PUBLIC;
REVOKE ALL ON ALL ROUTINES IN SCHEMA public FROM PUBLIC;

GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;

-- Anonymous: read public resources, safe directory view, and platform policy
GRANT SELECT ON TABLE public.resources TO anon;
GRANT SELECT ON TABLE public.directory_profiles TO anon;
GRANT SELECT ON TABLE public.platform_policy TO anon;

-- Authenticated: scoped access
GRANT SELECT ON TABLE public.organizations TO authenticated;
GRANT SELECT ON TABLE public.users TO authenticated;
GRANT UPDATE ON TABLE public.users TO authenticated;
GRANT SELECT ON TABLE public.directory_profiles TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.resources TO authenticated;
GRANT SELECT, INSERT, UPDATE ON TABLE public.bookings TO authenticated;
GRANT SELECT, INSERT, UPDATE ON TABLE public.incidents TO authenticated;
GRANT SELECT ON TABLE public.audit_events TO authenticated;
GRANT SELECT, INSERT, UPDATE ON TABLE public.organization_invitations TO authenticated;
GRANT SELECT, UPDATE ON TABLE public.platform_policy TO authenticated;

-- Service Role (Trusted backend / migrations / seeder)
GRANT ALL ON ALL TABLES IN SCHEMA public TO service_role;
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO service_role;
GRANT ALL ON ALL ROUTINES IN SCHEMA public TO service_role;

REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.audit_events FROM PUBLIC, anon, authenticated;
