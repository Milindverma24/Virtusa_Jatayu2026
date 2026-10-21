-- ====================================================================
-- SANJEEVANI LEKH (FIELD-TO-RECORD) — SUPABASE POSTGRES SCHEMA
-- ====================================================================
-- Run this script in the Supabase SQL Editor (https://supabase.com/dashboard/project/_/sql)

-- 1. Create the append-only audit_log table
CREATE TABLE IF NOT EXISTS public.audit_log (
    device_id TEXT NOT NULL,
    record_id TEXT NOT NULL,
    encounter_id TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL,
    input_type TEXT NOT NULL CHECK (input_type IN ('text', 'voice', 'image')),
    raw_text TEXT NOT NULL,
    record_json JSONB NOT NULL,
    model_name TEXT,
    prompt_version TEXT,
    reviewed_by TEXT NOT NULL,
    corrects_record_id TEXT,
    prev_hash TEXT NOT NULL,
    hash TEXT NOT NULL,
    received_at TIMESTAMPTZ DEFAULT NOW(),

    -- Composite Primary Key: guarantees retrying sync NEVER creates duplicate records
    PRIMARY KEY (device_id, record_id)
);

-- 2. Indexes for fast supervisor lookups and timeline sorting
CREATE INDEX IF NOT EXISTS idx_audit_log_encounter_id ON public.audit_log(encounter_id);
CREATE INDEX IF NOT EXISTS idx_audit_log_created_at ON public.audit_log(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_log_reviewed_by ON public.audit_log(reviewed_by);
CREATE INDEX IF NOT EXISTS idx_audit_log_device ON public.audit_log(device_id);

-- 3. Row Level Security (RLS) Configuration
ALTER TABLE public.audit_log ENABLE ROW LEVEL SECURITY;

-- Allow read-only access for supervisor dashboard (authenticated or anon demo access)
CREATE POLICY "Allow read access to audit_log"
    ON public.audit_log
    FOR SELECT
    USING (true);

-- Allow authenticated devices or service role to insert records
CREATE POLICY "Allow insert of confirmed records"
    ON public.audit_log
    FOR INSERT
    WITH CHECK (true);

-- Strictly prevent ANY updates or deletes in cloud Postgres (matching offline SQLite immutability)
CREATE POLICY "Block all updates on audit_log"
    ON public.audit_log
    FOR UPDATE
    USING (false);

CREATE POLICY "Block all deletes on audit_log"
    ON public.audit_log
    FOR DELETE
    USING (false);

-- 4. Convenient analytical view for supervisor dashboard
CREATE OR REPLACE VIEW public.encounter_summaries AS
SELECT 
    encounter_id,
    device_id,
    COUNT(*) AS record_count,
    MIN(created_at) AS started_at,
    MAX(created_at) AS last_activity,
    string_agg(DISTINCT reviewed_by, ', ') AS responders,
    COUNT(CASE WHEN jsonb_array_length(record_json->'entry') > 0 THEN 1 END) AS active_records
FROM public.audit_log
GROUP BY encounter_id, device_id
ORDER BY last_activity DESC;
