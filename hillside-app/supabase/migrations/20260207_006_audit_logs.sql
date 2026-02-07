-- ============================================
-- Phase 3 Security Enhancement: Audit Logs
-- Created: 2026-02-07
-- Purpose: Immutable audit trail for compliance and security
-- ============================================

-- ====================
-- Audit Logs Table
-- ====================

CREATE TABLE IF NOT EXISTS public.audit_logs (
  audit_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  
  -- Who performed the action
  performed_by_user_id UUID REFERENCES public.users(user_id) ON DELETE SET NULL,
  
  -- What entity was affected
  entity_type TEXT NOT NULL CHECK (entity_type IN (
    'reservation',
    'payment',
    'unit',
    'user',
    'checkin'
  )),
  entity_id TEXT NOT NULL,
  
  -- What action was performed
  action TEXT NOT NULL CHECK (action IN (
    'create',
    'update',
    'delete',
    'verify',
    'cancel',
    'checkin',
    'checkout',
    'approve',
    'reject'
  )),
  
  -- Cryptographic hash of the event data
  data_hash TEXT NOT NULL,
  
  -- Blockchain transaction hash (when implemented in Phase 7)
  blockchain_tx_hash TEXT,
  
  -- Additional context (JSON for flexibility)
  metadata JSONB,
  
  -- Request metadata for security tracking
  ip_address INET,
  user_agent TEXT,
  
  -- Timestamp (immutable)
  timestamp TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

-- ====================
-- Indexes for Performance
-- ====================

-- Index for querying by entity (most common query pattern)
CREATE INDEX idx_audit_logs_entity 
  ON public.audit_logs(entity_type, entity_id);

-- Index for querying by user (audit reports)
CREATE INDEX idx_audit_logs_user 
  ON public.audit_logs(performed_by_user_id) 
  WHERE performed_by_user_id IS NOT NULL;

-- Index for time-based queries (recent activity)
CREATE INDEX idx_audit_logs_timestamp 
  ON public.audit_logs(timestamp DESC);

-- Index for blockchain verification (Phase 7)
CREATE INDEX idx_audit_logs_blockchain 
  ON public.audit_logs(blockchain_tx_hash) 
  WHERE blockchain_tx_hash IS NOT NULL;

-- ====================
-- Row Level Security
-- ====================

ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;

-- Policy: Only admins can read audit logs
CREATE POLICY "admins_read_audit_logs" ON public.audit_logs
  FOR SELECT 
  USING (
    EXISTS (
      SELECT 1 FROM public.users
      WHERE user_id = auth.uid()
      AND role = 'admin'
    )
  );

COMMENT ON POLICY "admins_read_audit_logs" ON public.audit_logs IS
'Only administrators can view audit logs for compliance and security reviews.
Regular users cannot access audit trail.';

-- Policy: System can insert audit logs (through stored procedures)
CREATE POLICY "system_insert_audit_logs" ON public.audit_logs
  FOR INSERT 
  WITH CHECK (true);

COMMENT ON POLICY "system_insert_audit_logs" ON public.audit_logs IS
'Allows audit log creation from stored procedures and triggers.
All authenticated operations can create audit entries.';

-- Policy: Audit logs are immutable (no updates)
CREATE POLICY "no_update_audit_logs" ON public.audit_logs
  FOR UPDATE 
  USING (false)
  WITH CHECK (false);

-- Policy: Audit logs are immutable (no deletes)
CREATE POLICY "no_delete_audit_logs" ON public.audit_logs
  FOR DELETE 
  USING (false);

COMMENT ON TABLE public.audit_logs IS
'Immutable audit trail for all critical system operations.
Used for compliance, security monitoring, and blockchain verification.
No records can be modified or deleted after creation.';

-- ====================
-- Helper Function: Create Audit Log
-- ====================

CREATE OR REPLACE FUNCTION public.create_audit_log(
  p_entity_type TEXT,
  p_entity_id TEXT,
  p_action TEXT,
  p_data_hash TEXT,
  p_metadata JSONB DEFAULT NULL
) RETURNS UUID AS $$
DECLARE
  v_audit_id UUID;
BEGIN
  INSERT INTO public.audit_logs (
    performed_by_user_id,
    entity_type,
    entity_id,
    action,
    data_hash,
    metadata
  ) VALUES (
    auth.uid(),
    p_entity_type,
    p_entity_id,
    p_action,
    p_data_hash,
    p_metadata
  ) RETURNING audit_id INTO v_audit_id;
  
  RETURN v_audit_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION public.create_audit_log IS
'Helper function to create audit log entries.
Automatically captures the current user ID from auth context.
Returns the audit_id for reference.';

-- ====================
-- Trigger: Auto-Audit Reservation Updates
-- ====================

CREATE OR REPLACE FUNCTION public.audit_reservation_update()
RETURNS TRIGGER AS $$
BEGIN
  -- Only audit status changes and cancellations
  IF OLD.status IS DISTINCT FROM NEW.status THEN
    PERFORM public.create_audit_log(
      'reservation',
      NEW.reservation_id::TEXT,
      CASE 
        WHEN NEW.status = 'cancelled' THEN 'cancel'
        WHEN NEW.status = 'checked_in' THEN 'checkin'
        WHEN NEW.status = 'checked_out' THEN 'checkout'
        ELSE 'update'
      END,
      encode(digest(concat(
        NEW.reservation_code, 
        NEW.status, 
        NOW()::TEXT
      ), 'sha256'), 'hex'),
      jsonb_build_object(
        'old_status', OLD.status,
        'new_status', NEW.status,
        'reservation_code', NEW.reservation_code
      )
    );
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Attach trigger to reservations table
CREATE TRIGGER audit_reservation_status_change
  AFTER UPDATE ON public.reservations
  FOR EACH ROW
  WHEN (OLD.status IS DISTINCT FROM NEW.status)
  EXECUTE FUNCTION public.audit_reservation_update();

COMMENT ON TRIGGER audit_reservation_status_change ON public.reservations IS
'Automatically creates audit log entries when reservation status changes.
Captures old and new status for compliance tracking.';

-- ====================
-- Sample Audit Queries
-- ====================

-- Query: Recent audit activity (last 24 hours)
-- SELECT 
--   a.timestamp,
--   a.entity_type,
--   a.action,
--   u.name as performed_by,
--   a.metadata
-- FROM audit_logs a
-- LEFT JOIN users u ON a.performed_by_user_id = u.user_id
-- WHERE a.timestamp > NOW() - INTERVAL '24 hours'
-- ORDER BY a.timestamp DESC;

-- Query: Audit trail for specific reservation
-- SELECT 
--   a.timestamp,
--   a.action,
--   u.name as performed_by,
--   a.metadata->>'old_status' as old_status,
--   a.metadata->>'new_status' as new_status
-- FROM audit_logs a
-- LEFT JOIN users u ON a.performed_by_user_id = u.user_id
-- WHERE a.entity_type = 'reservation' 
--   AND a.entity_id = '<reservation-id>'
-- ORDER BY a.timestamp;

-- Query: User activity report
-- SELECT 
--   u.name,
--   u.role,
--   COUNT(*) as total_actions,
--   COUNT(*) FILTER (WHERE a.action = 'create') as creates,
--   COUNT(*) FILTER (WHERE a.action = 'update') as updates,
--   MAX(a.timestamp) as last_activity
-- FROM audit_logs a
-- JOIN users u ON a.performed_by_user_id = u.user_id
-- GROUP BY u.user_id, u.name, u.role
-- ORDER BY total_actions DESC;
