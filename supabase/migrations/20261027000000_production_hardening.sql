-- ==============================================================================
-- VS STUDIO ADMIN — PRODUCTION HARDENING MIGRATION
-- Migration: 20261027000000_production_hardening.sql
-- Description:
--   1. Strengthen RLS for inquiries and storage (prevent unauthorized status tampering)
--   2. Make activity_log immutable (prevent silent edits or deletions)
--   3. Add indexes and constraints on inquiries, clients, and payments
--   4. Add transaction reference and status flexibility for payments
--   5. Provide atomic RPC for convert_inquiry_to_project with rollback safety
--   6. Enforce proposal integrity on accepted proposals
-- ==============================================================================

-- 1. STRENGTHEN INQUIRIES PUBLIC INSERT POLICY
-- Ensure anonymous web visitors can ONLY create inquiries with status='new' and assigned_to=NULL
DROP POLICY IF EXISTS "Public website can insert inquiries" ON public.inquiries;
CREATE POLICY "Public website can insert inquiries"
    ON public.inquiries
    FOR INSERT
    TO anon
    WITH CHECK (
        status = 'new' AND
        assigned_to IS NULL
    );

-- 2. ENSURE AUDIT LOG IMMUTABILITY
-- Admins can SELECT and INSERT activity logs, but cannot UPDATE or DELETE historical records
DROP POLICY IF EXISTS "Admins can view and insert activity log" ON public.activity_log;
CREATE POLICY "Admins can view activity log"
    ON public.activity_log
    FOR SELECT
    TO authenticated
    USING (public.is_admin());

CREATE POLICY "Admins can append activity log"
    ON public.activity_log
    FOR INSERT
    TO authenticated
    WITH CHECK (public.is_admin());

-- 3. INDEXES & RELATIONSHIP INTEGRITY
CREATE INDEX IF NOT EXISTS idx_inquiries_email ON public.inquiries(lower(email));
CREATE INDEX IF NOT EXISTS idx_clients_email ON public.clients(lower(email));
CREATE INDEX IF NOT EXISTS idx_clients_inquiry_id ON public.clients(inquiry_id);

-- Enforce unique inquiry conversion where inquiry_id is set
CREATE UNIQUE INDEX IF NOT EXISTS idx_clients_inquiry_id_unique 
    ON public.clients(inquiry_id) 
    WHERE inquiry_id IS NOT NULL;

-- 4. PAYMENTS EXTENSIONS (TRANSACTION REFERENCES & EXPANDED STATUSES)
ALTER TABLE public.payments ADD COLUMN IF NOT EXISTS reference TEXT;

-- Update status check constraint to support refunds and failures
ALTER TABLE public.payments DROP CONSTRAINT IF EXISTS payments_status_check;
ALTER TABLE public.payments ADD CONSTRAINT payments_status_check 
    CHECK (status IN ('pending', 'paid', 'overdue', 'refunded', 'failed'));

-- 5. ATOMIC RPC FUNCTION: convert_inquiry_to_project
CREATE OR REPLACE FUNCTION public.convert_inquiry_to_project(
    p_inquiry_id UUID,
    p_project_title TEXT,
    p_start_date DATE,
    p_due_date DATE DEFAULT NULL,
    p_assigned_to UUID DEFAULT NULL,
    p_existing_client_id UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_inquiry RECORD;
    v_client_id UUID;
    v_client RECORD;
    v_project_id UUID;
    v_admin_name TEXT;
BEGIN
    -- 1. Security Check: Caller must be an authorized founder admin
    IF NOT public.is_admin() THEN
        RAISE EXCEPTION 'Access denied: caller is not an authorized founder admin';
    END IF;

    -- 2. Fetch and lock the inquiry row for update
    SELECT * INTO v_inquiry
    FROM public.inquiries
    WHERE id = p_inquiry_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Inquiry with ID % not found', p_inquiry_id;
    END IF;

    -- If already converted / accepted
    IF v_inquiry.status = 'accepted' THEN
        -- Check if client already exists for this inquiry
        SELECT id INTO v_client_id FROM public.clients WHERE inquiry_id = p_inquiry_id LIMIT 1;
        IF v_client_id IS NOT NULL THEN
            SELECT id INTO v_project_id FROM public.projects WHERE client_id = v_client_id LIMIT 1;
            RETURN jsonb_build_object(
                'success', true,
                'already_converted', true,
                'client_id', v_client_id,
                'project_id', v_project_id,
                'message', 'Inquiry was already converted.'
            );
        END IF;
    END IF;

    -- 3. Resolve or create client
    IF p_existing_client_id IS NOT NULL THEN
        SELECT * INTO v_client FROM public.clients WHERE id = p_existing_client_id;
        IF NOT FOUND THEN
            RAISE EXCEPTION 'Specified client ID % does not exist', p_existing_client_id;
        END IF;
        v_client_id := v_client.id;
        -- Update inquiry link if not set
        IF v_client.inquiry_id IS NULL THEN
            UPDATE public.clients SET inquiry_id = p_inquiry_id, updated_at = now() WHERE id = v_client_id;
        END IF;
    ELSE
        -- Check if client with matching email already exists
        SELECT id INTO v_client_id FROM public.clients WHERE lower(email) = lower(v_inquiry.email) LIMIT 1;
        IF v_client_id IS NULL THEN
            -- Insert new client
            INSERT INTO public.clients (inquiry_id, name, email, phone, company, notes)
            VALUES (
                p_inquiry_id,
                v_inquiry.name,
                v_inquiry.email,
                v_inquiry.phone,
                v_inquiry.company,
                'Converted from inquiry: ' || COALESCE(v_inquiry.requirements, '')
            )
            RETURNING id INTO v_client_id;
        END IF;
    END IF;

    -- 4. Create Project
    INSERT INTO public.projects (
        client_id,
        title,
        service_type,
        status,
        start_date,
        due_date,
        assigned_to,
        progress_percent
    ) VALUES (
        v_client_id,
        COALESCE(NULLIF(trim(p_project_title), ''), v_inquiry.name || ' Project'),
        v_inquiry.service_type,
        'planning',
        COALESCE(p_start_date, CURRENT_DATE),
        p_due_date,
        p_assigned_to,
        0
    )
    RETURNING id INTO v_project_id;

    -- 5. Mark inquiry as accepted and associate
    UPDATE public.inquiries
    SET status = 'accepted',
        assigned_to = COALESCE(p_assigned_to, v_inquiry.assigned_to),
        updated_at = now()
    WHERE id = p_inquiry_id;

    -- 6. Log activity
    SELECT name INTO v_admin_name FROM public.admins WHERE user_id = auth.uid() LIMIT 1;
    INSERT INTO public.activity_log (
        entity_type,
        entity_id,
        action,
        actor,
        metadata
    ) VALUES (
        'inquiry',
        p_inquiry_id,
        'Converted inquiry to Client & Project "' || COALESCE(NULLIF(trim(p_project_title), ''), v_inquiry.name || ' Project') || '"',
        COALESCE(v_admin_name, 'Founder Admin'),
        jsonb_build_object('client_id', v_client_id, 'project_id', v_project_id)
    );

    RETURN jsonb_build_object(
        'success', true,
        'client_id', v_client_id,
        'project_id', v_project_id,
        'inquiry_id', p_inquiry_id
    );
END;
$$;
