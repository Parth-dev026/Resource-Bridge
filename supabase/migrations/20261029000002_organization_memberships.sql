-- ============================================================
-- ResourceBridge — Migration 000002: Organisation-Authorised Accounts
-- Multi-Tenancy Isolation, Member Status, Secure Invitations,
-- and Faculty Role Support.
-- ============================================================

-- 1. ORGANIZATIONS TABLE
CREATE TABLE IF NOT EXISTS public.organizations (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  slug TEXT NOT NULL UNIQUE,
  description TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Seed primary campus organization
INSERT INTO public.organizations (id, name, slug, description)
VALUES (
  'org-greenwood-1',
  'Greenwood College & Senior School',
  'greenwood-college',
  'Unified campus sharing facility for STEM, robotics, and computing'
) ON CONFLICT (id) DO NOTHING;

-- 2. ENHANCE USERS TABLE WITH ORGANISATION MEMBERSHIP & STATUS
ALTER TABLE public.users 
  ADD COLUMN IF NOT EXISTS organization_id TEXT REFERENCES public.organizations(id) DEFAULT 'org-greenwood-1',
  ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive', 'invited')),
  ADD COLUMN IF NOT EXISTS email_verified BOOLEAN NOT NULL DEFAULT true;

-- Update role constraint to include 'faculty' alongside 'student', 'manager', 'admin'
ALTER TABLE public.users DROP CONSTRAINT IF EXISTS users_role_check;
ALTER TABLE public.users ADD CONSTRAINT users_role_check CHECK (role IN ('student', 'faculty', 'manager', 'admin'));

-- Backfill default organization for any pre-existing records
UPDATE public.users 
SET 
  organization_id = 'org-greenwood-1',
  status = 'active',
  email_verified = true
WHERE organization_id IS NULL;

-- 3. SCOPE CORE ENTITIES TO ORGANISATIONS FOR TENANT ISOLATION
ALTER TABLE public.resources 
  ADD COLUMN IF NOT EXISTS organization_id TEXT REFERENCES public.organizations(id) DEFAULT 'org-greenwood-1';

UPDATE public.resources 
SET organization_id = 'org-greenwood-1' 
WHERE organization_id IS NULL;

ALTER TABLE public.bookings 
  ADD COLUMN IF NOT EXISTS organization_id TEXT REFERENCES public.organizations(id) DEFAULT 'org-greenwood-1';

UPDATE public.bookings 
SET organization_id = 'org-greenwood-1' 
WHERE organization_id IS NULL;

ALTER TABLE public.incidents 
  ADD COLUMN IF NOT EXISTS organization_id TEXT REFERENCES public.organizations(id) DEFAULT 'org-greenwood-1';

UPDATE public.incidents 
SET organization_id = 'org-greenwood-1' 
WHERE organization_id IS NULL;

ALTER TABLE public.audit_events 
  ADD COLUMN IF NOT EXISTS organization_id TEXT REFERENCES public.organizations(id) DEFAULT 'org-greenwood-1';

UPDATE public.audit_events 
SET organization_id = 'org-greenwood-1' 
WHERE organization_id IS NULL;

-- 4. ORGANISATION INVITATIONS TABLE (ADMIN-CONTROLLED INVITATION WORKFLOW)
CREATE TABLE IF NOT EXISTS public.organization_invitations (
  id TEXT PRIMARY KEY DEFAULT ('inv-' || substr(md5(random()::text), 1, 12)),
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

-- 5. ROW LEVEL SECURITY (RLS) POLICIES
ALTER TABLE public.organizations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.organization_invitations ENABLE ROW LEVEL SECURITY;

-- Organizations policy: authenticated users can only view their own organization
DROP POLICY IF EXISTS "organizations_select_own" ON public.organizations;
CREATE POLICY "organizations_select_own" ON public.organizations
  FOR SELECT
  TO authenticated
  USING (
    id IN (
      SELECT organization_id FROM public.users 
      WHERE auth_user_id = auth.uid() AND auth.uid() IS NOT NULL
    )
  );

-- Invitations policy: Only organisation administrators can view and manage invitations
DROP POLICY IF EXISTS "invitations_admin_all" ON public.organization_invitations;
CREATE POLICY "invitations_admin_all" ON public.organization_invitations
  FOR ALL
  TO authenticated
  USING (
    public.is_admin() AND 
    organization_id IN (
      SELECT organization_id FROM public.users 
      WHERE auth_user_id = auth.uid() AND auth.uid() IS NOT NULL
    )
  )
  WITH CHECK (
    public.is_admin() AND 
    organization_id IN (
      SELECT organization_id FROM public.users 
      WHERE auth_user_id = auth.uid() AND auth.uid() IS NOT NULL
    )
  );

-- Service role full access on organizations and invitations
GRANT SELECT, INSERT, UPDATE, DELETE ON public.organizations TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.organization_invitations TO service_role;

GRANT SELECT ON public.organizations TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.organization_invitations TO authenticated;
