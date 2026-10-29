-- ============================================================
-- ResourceBridge — Incremental Migration for Pre-Existing Schemas
-- Run this script ONLY if your Supabase database already contains
-- earlier tables and needs the conflict exclusion and security constraints.
-- ============================================================

CREATE EXTENSION IF NOT EXISTS "btree_gist";

-- 1. Ensure start_timestamp and end_timestamp exist
ALTER TABLE public.bookings ADD COLUMN IF NOT EXISTS start_timestamp TIMESTAMPTZ;
ALTER TABLE public.bookings ADD COLUMN IF NOT EXISTS end_timestamp TIMESTAMPTZ;

-- 2. Backfill timestamps for existing text records if null
UPDATE public.bookings
SET 
  start_timestamp = (date || 'T' || start_time_text || ':00Z')::TIMESTAMPTZ,
  end_timestamp = (date || 'T' || end_time_text || ':00Z')::TIMESTAMPTZ
WHERE start_timestamp IS NULL;

ALTER TABLE public.bookings ALTER COLUMN start_timestamp SET NOT NULL;
ALTER TABLE public.bookings ALTER COLUMN end_timestamp SET NOT NULL;

-- 3. Add generated range column and exclusion constraint if missing
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'bookings' AND column_name = 'booking_period'
  ) THEN
    ALTER TABLE public.bookings 
      ADD COLUMN booking_period TSTZRANGE GENERATED ALWAYS AS (tstzrange(start_timestamp, end_timestamp, '[)')) STORED;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'prevent_conflicting_approved_bookings'
  ) THEN
    ALTER TABLE public.bookings 
      ADD CONSTRAINT prevent_conflicting_approved_bookings
      EXCLUDE USING gist (
        resource_id WITH =,
        booking_period WITH &&
      )
      WHERE (status IN ('Approved', 'CheckedIn'));
  END IF;
END $$;

-- 4. Create Directory View if not exists
CREATE OR REPLACE VIEW public.directory_profiles
WITH (security_invoker = true) AS
SELECT 
  id, 
  name, 
  department, 
  role
FROM public.users;
