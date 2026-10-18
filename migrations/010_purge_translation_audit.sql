-- Drop automatic translation bookkeeping from audit history.
-- Freshness / revision / acknowledge are derived state; CMS mutations already log content changes.

DELETE FROM audit_log
WHERE action IN (
  'translation.status_changed',
  'translation.acknowledge',
  'source.revision_bumped'
);
